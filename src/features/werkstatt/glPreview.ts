import { lutData } from '../../domain/render/lut';
import { renderTitle, type TitleCtx } from '../../domain/render/titles';
import type { ColorParams, TitleParams } from '../../domain/timeline/types';

export type TexSource = HTMLVideoElement | HTMLImageElement;
export type DrawLayer = { source: TexSource; alpha: number; lutKey: string; color: ColorParams | null };
export type DrawTitle = { key: string; params: TitleParams; alpha: number };
export type DrawList = { layers: DrawLayer[]; titles: DrawTitle[] };

export interface Preview {
  /** `true`, wenn die Farbkorrektur sichtbar ist (WebGL2). */
  readonly colorSupported: boolean;
  /** `true`, wenn eine Medienquelle nicht ins Bild übernommen werden darf (SecurityError, fehlendes CORS). */
  readonly blocked: boolean;
  /** Wird aufgerufen, wenn der WebGL-Kontext verloren ging und nicht zurückkam. */
  onUnrecoverable: (() => void) | null;
  /** Wird aufgerufen, wenn der WebGL-Kontext wiederhergestellt wurde (neu zeichnen!). */
  onRestored: (() => void) | null;
  draw(list: DrawList): void;
  /** Gibt Titel-Zwischenspeicher frei, die nicht mehr `live` sind oder länger als 30 s ungenutzt blieben. */
  prune(live: Set<string>, now: number): void;
  dispose(): void;
}

/** So lange ungenutzte Titel-Texturen bleiben (ms). */
export const IDLE_MS = 30_000;
/** So lange wartet die Vorschau auf `webglcontextrestored`, bevor sie auf Canvas 2D zurückfällt (ms). */
const RESTORE_WAIT_MS = 2000;

const LUT_SIZE = 33;
const LUT_CACHE_MAX = 16;

const VERT = `#version 300 es
in vec2 aPos;
uniform vec4 uRect; // x, y, Breite, Höhe in Clip-Koordinaten (oben links)
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x, aPos.y);
  gl_Position = vec4(uRect.x + aPos.x * uRect.z, uRect.y - aPos.y * uRect.w, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler3D uLut;
uniform bool uUseLut;
uniform bool uPremult;
uniform float uAlpha;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  if (uPremult) { outColor = c * uAlpha; return; }
  vec3 rgb = c.rgb;
  if (uUseLut) {
    float n = ${LUT_SIZE}.0;
    rgb = texture(uLut, rgb * ((n - 1.0) / n) + 0.5 / n).rgb;
  }
  outColor = vec4(rgb * uAlpha, uAlpha);
}`;

/** Fläche zum Zeichnen der Titel (OffscreenCanvas, sonst verstecktes Canvas). */
function makeSurface(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function sizeOf(s: TexSource): { w: number; h: number } {
  return s instanceof HTMLVideoElement ? { w: s.videoWidth, h: s.videoHeight } : { w: s.naturalWidth, h: s.naturalHeight };
}

/** Einpassen wie im Export (`scale … decrease` + `pad`): zentriert, Seitenverhältnis bleibt. */
export function fitRect(srcW: number, srcH: number, dstW: number, dstH: number): { x: number; y: number; w: number; h: number } {
  const k = Math.min(dstW / srcW, dstH / srcH);
  const [w, h] = [srcW * k, srcH * k];
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

class TitleCache {
  private items = new Map<string, { json: string; w: number; h: number; surface: HTMLCanvasElement | OffscreenCanvas; lastUsed: number }>();
  /** Zeichnet den Titel neu, wenn sich Parameter oder Größe geändert haben; liefert `fresh`, wenn neu gezeichnet. */
  get(key: string, params: TitleParams, w: number, h: number, now: number): { surface: HTMLCanvasElement | OffscreenCanvas; fresh: boolean } {
    const json = JSON.stringify(params);
    let it = this.items.get(key);
    if (it && it.json === json && it.w === w && it.h === h) {
      it.lastUsed = now;
      return { surface: it.surface, fresh: false };
    }
    if (!it || it.w !== w || it.h !== h) it = { json, w, h, surface: makeSurface(w, h), lastUsed: now };
    it.json = json;
    it.lastUsed = now;
    const ctx = it.surface.getContext('2d') as unknown as TitleCtx | null;
    if (ctx) renderTitle(params, w, h, ctx);
    this.items.set(key, it);
    return { surface: it.surface, fresh: true };
  }
  prune(live: Set<string>, now: number): string[] {
    const gone: string[] = [];
    for (const [k, it] of this.items) {
      if (!live.has(k) || now - it.lastUsed > IDLE_MS) {
        this.items.delete(k);
        gone.push(k);
      }
    }
    return gone;
  }
  has(key: string): boolean {
    return this.items.has(key);
  }
  clear(): void {
    this.items.clear();
  }
}

export class GlPreview implements Preview {
  readonly colorSupported = true;
  blocked = false;
  onUnrecoverable: (() => void) | null = null;
  onRestored: (() => void) | null = null;
  private lost = false;
  private restoreTimer = 0;
  private prog!: WebGLProgram;
  private u!: Record<'rect' | 'tex' | 'lut' | 'useLut' | 'premult' | 'alpha', WebGLUniformLocation | null>;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private srcTex: WebGLTexture | null = null;
  private titleTex = new Map<string, WebGLTexture>();
  private lutTex = new Map<string, WebGLTexture>();
  private identityLut: WebGLTexture | null = null;
  private titles = new TitleCache();
  private uploaded = new WeakSet<WebGLTexture>();

  private constructor(private canvas: HTMLCanvasElement, private gl: WebGL2RenderingContext) {
    this.init();
    canvas.addEventListener('webglcontextlost', this.handleLost);
    canvas.addEventListener('webglcontextrestored', this.handleRestored);
  }

  /** Programm, Puffer und Standard-Texturen anlegen (auch nach Kontextwiederherstellung). */
  private init(): void {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Programm');
    this.prog = prog;
    const loc = (n: string) => gl.getUniformLocation(prog, n);
    this.u = { rect: loc('uRect'), tex: loc('uTex'), lut: loc('uLut'), useLut: loc('uUseLut'), premult: loc('uPremult'), alpha: loc('uAlpha') };
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = this.makeTex2D();
    this.identityLut = this.makeLut(lutData({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0 }, 2), 2);
  }

  private handleLost = (e: Event): void => {
    e.preventDefault(); // sonst kommt der Kontext nie zurück
    this.lost = true;
    window.clearTimeout(this.restoreTimer);
    this.restoreTimer = window.setTimeout(() => {
      if (this.lost) this.onUnrecoverable?.();
    }, RESTORE_WAIT_MS);
  };

  private handleRestored = (): void => {
    window.clearTimeout(this.restoreTimer);
    // Alle GL-Objekte sind weg: Zwischenspeicher verwerfen, LUT- und Titel-Texturen entstehen beim nächsten Zeichnen neu.
    this.titleTex.clear();
    this.lutTex.clear();
    this.uploaded = new WeakSet();
    try {
      this.init();
      this.lost = false;
      this.onRestored?.();
    } catch {
      this.onUnrecoverable?.();
    }
  };

  /** `null`, wenn WebGL2 fehlt. */
  static create(canvas: HTMLCanvasElement): GlPreview | null {
    try {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
      return gl ? new GlPreview(canvas, gl) : null;
    } catch {
      return null;
    }
  }

  private makeTex2D(): WebGLTexture | null {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private makeLut(data: Uint8Array, size: number): WebGLTexture | null {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  }

  private lutFor(key: string, color: ColorParams): WebGLTexture | null {
    let t = this.lutTex.get(key);
    if (!t) {
      if (this.lutTex.size >= LUT_CACHE_MAX) {
        const oldest = this.lutTex.keys().next().value as string;
        this.gl.deleteTexture(this.lutTex.get(oldest) ?? null);
        this.lutTex.delete(oldest);
      }
      t = this.makeLut(lutData(color, LUT_SIZE), LUT_SIZE) ?? undefined;
      if (t) this.lutTex.set(key, t);
    }
    return t ?? null;
  }

  private quad(rect: { x: number; y: number; w: number; h: number }): void {
    const { gl, canvas } = this;
    const [W, H] = [canvas.width, canvas.height];
    gl.uniform4f(this.u.rect, (rect.x / W) * 2 - 1, 1 - (rect.y / H) * 2, (rect.w / W) * 2, (rect.h / H) * 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  draw(list: DrawList): void {
    if (this.lost || this.gl.isContextLost()) return;
    const { gl, canvas } = this;
    const now = performance.now();
    const [W, H] = [canvas.width, canvas.height];
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(this.u.tex, 0);
    gl.uniform1i(this.u.lut, 1);

    for (const l of list.layers) {
      const { w, h } = sizeOf(l.source);
      if (w === 0 || h === 0) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, l.source);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'SecurityError') this.blocked = true;
        continue; // Bild noch nicht dekodiert oder Quelle nicht freigegeben
      }
      gl.activeTexture(gl.TEXTURE1);
      const lut = l.color ? this.lutFor(l.lutKey, l.color) : null;
      gl.bindTexture(gl.TEXTURE_3D, lut ?? this.identityLut);
      gl.uniform1i(this.u.useLut, lut ? 1 : 0);
      gl.uniform1i(this.u.premult, 0);
      gl.uniform1f(this.u.alpha, l.alpha);
      this.quad(fitRect(w, h, W, H));
    }

    for (const t of list.titles) {
      const { surface, fresh } = this.titles.get(t.key, t.params, W, H, now);
      let tex = this.titleTex.get(t.key);
      gl.activeTexture(gl.TEXTURE0);
      if (!tex) {
        tex = this.makeTex2D() ?? undefined;
        if (!tex) continue;
        this.titleTex.set(t.key, tex);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (fresh || !this.uploaded.has(tex)) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface as TexImageSource);
        this.uploaded.add(tex);
      }
      gl.uniform1i(this.u.premult, 1);
      gl.uniform1f(this.u.alpha, t.alpha);
      this.quad({ x: 0, y: 0, w: W, h: H });
    }
    gl.disable(gl.BLEND);
  }

  prune(live: Set<string>, now: number): void {
    this.titles.prune(live, now);
    // Texturen ohne Zeichenfläche (veraltet oder entfernt) freigeben; sie entstehen bei Bedarf neu.
    for (const key of [...this.titleTex.keys()]) {
      if (!live.has(key) || !this.titles.has(key)) {
        if (!this.lost) this.gl.deleteTexture(this.titleTex.get(key) ?? null);
        this.titleTex.delete(key);
      }
    }
  }

  dispose(): void {
    window.clearTimeout(this.restoreTimer);
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    const gl = this.gl;
    if (!this.lost) {
      for (const t of [...this.titleTex.values(), ...this.lutTex.values(), this.srcTex, this.identityLut]) gl.deleteTexture(t);
      gl.deleteProgram(this.prog);
      gl.deleteBuffer(this.buf);
      gl.deleteVertexArray(this.vao);
    }
    this.titleTex.clear();
    this.lutTex.clear();
    this.titles.clear();
  }
}

/** Rückfall ohne WebGL2: Canvas 2D, ohne Farbkorrektur. */
export class CanvasPreview implements Preview {
  readonly colorSupported = false;
  blocked = false;
  onUnrecoverable: (() => void) | null = null;
  onRestored: (() => void) | null = null;
  private ctx: CanvasRenderingContext2D;
  private titles = new TitleCache();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  draw(list: DrawList): void {
    const { ctx, canvas } = this;
    if (!ctx) return;
    const [W, H] = [canvas.width, canvas.height];
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (const l of list.layers) {
      const { w, h } = sizeOf(l.source);
      if (w === 0 || h === 0) continue;
      const r = fitRect(w, h, W, H);
      ctx.globalAlpha = l.alpha;
      try {
        ctx.drawImage(l.source, r.x, r.y, r.w, r.h);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'SecurityError') this.blocked = true;
      }
    }
    for (const t of list.titles) {
      const { surface } = this.titles.get(t.key, t.params, W, H, performance.now());
      ctx.globalAlpha = t.alpha;
      ctx.drawImage(surface as CanvasImageSource, 0, 0);
    }
    ctx.globalAlpha = 1;
  }

  prune(live: Set<string>, now: number): void {
    this.titles.prune(live, now);
  }

  dispose(): void {
    this.titles.clear();
  }
}

export function createPreview(canvas: HTMLCanvasElement): Preview {
  return GlPreview.create(canvas) ?? new CanvasPreview(canvas);
}
