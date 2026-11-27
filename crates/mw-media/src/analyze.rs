//! Messung von Lautheit, Clipping, Stille, Belichtung, Schwarz-/Standbild und Schnitten.
//! Das JSON entspricht dem TypeScript-Typ `Measurements` (camelCase).

use crate::error::{Error, Result};
use crate::probe::{probe, MediaInfo};
use crate::run::drain_tail;
use crate::tools::{spawn_error, Tools};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::process::{ChildStdout, Command, Stdio};

// --- Messgrößen (Werte aus der Aufgabenbeschreibung) ---
/// Bildrate der Analyse und Breite der Analysebilder.
const ANALYSIS_FPS: f64 = 5.0;
const ANALYSIS_WIDTH: u32 = 160;
/// Schwarzbild: Luma-Mittel unter diesem Wert …
const BLACK_LUMA: f64 = 0.04;
/// … für mindestens so viele Sekunden.
const BLACK_MIN_SEC: f64 = 0.2;
/// Standbild: mittlere absolute Luma-Differenz unter diesem Wert …
const FREEZE_DIFF: f64 = 0.003;
/// … für mindestens so viele Sekunden.
const FREEZE_MIN_SEC: f64 = 2.0;
/// Schnitt: mittlere absolute Luma-Differenz über diesem Wert.
const CUT_DIFF: f64 = 0.25;
/// Pixel mit Y ≥ 235 zählen als Lichter, Y ≤ 16 als Tiefen.
const HIGHLIGHT_Y: u8 = 235;
const SHADOW_Y: u8 = 16;
/// Balken (Letterbox/Pillarbox aus dem Einpassen im Export): Randzeilen/-spalten, in denen jedes Pixel
/// Y ≤ 18 hat – und das in mindestens 98 % der Bilder eines Abschnitts. Sie zählen nicht zur Belichtung.
const BAR_Y: u8 = 18;
const BAR_SHARE: f64 = 0.98;
/// Ton-PCM: 48 kHz, Clipping ab |x| ≥ 0,999.
const PCM_RATE: usize = 48_000;
const CLIP_LEVEL: f32 = 0.999;
/// Stille: RMS über 50-ms-Fenster unter −50 dBFS für mindestens 1 s.
const SILENCE_WINDOW_SEC: f64 = 0.05;
const SILENCE_DBFS: f64 = -50.0;
const SILENCE_MIN_SEC: f64 = 1.0;
/// Untergrenze von ebur128 (digitale Stille) in LUFS.
const LUFS_FLOOR: f64 = -70.0;

/// Eingabe: ein Zeitabschnitt in Sekunden.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
}

/// Zeitintervall in Sekunden.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Interval {
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Format {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration_sec: f64,
    pub video_codec: String,
    pub audio_codec: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStats {
    /// `None` bei fehlendem Ton oder digitaler Stille (−∞).
    pub integrated_lufs: Option<f64>,
    pub true_peak_dbtp: Option<f64>,
    pub clipped_samples: u64,
    pub silences: Vec<Interval>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentStats {
    pub start: f64,
    pub end: f64,
    /// 0–1
    pub mean_luma: f64,
    /// 0–100
    pub highlights_pct: f64,
    /// 0–100
    pub shadows_pct: f64,
    /// −0,5…0,5
    pub mean_u: f64,
    pub mean_v: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStats {
    pub black: Vec<Interval>,
    pub freeze: Vec<Interval>,
    pub detected_cuts: Vec<f64>,
    pub segments: Vec<SegmentStats>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Measurements {
    pub format: Format,
    pub audio: AudioStats,
    pub video: VideoStats,
}

/// Misst `file`. Ohne `segments` wird die ganze Datei als ein Abschnitt ausgewertet.
pub fn analyze(t: &Tools, file: &Path, segments: &[Segment]) -> Result<Measurements> {
    let info = probe(t, file)?;
    let format = Format {
        width: info.width,
        height: info.height,
        fps: info.fps.unwrap_or(0.0),
        duration_sec: info.duration_sec,
        video_codec: info.video_codec.clone().unwrap_or_default(),
        audio_codec: info.audio_codec.clone(),
    };
    let whole = [Segment {
        start: 0.0,
        end: info.duration_sec,
    }];
    let segs = if segments.is_empty() {
        &whole
    } else {
        segments
    };

    let audio = if info.has_audio {
        let (integrated_lufs, true_peak_dbtp) = measure_loudness(t, file)?;
        let (clipped_samples, silences) = scan_pcm(t, file)?;
        AudioStats {
            integrated_lufs,
            true_peak_dbtp,
            clipped_samples,
            silences,
        }
    } else {
        AudioStats {
            integrated_lufs: None,
            true_peak_dbtp: None,
            clipped_samples: 0,
            silences: Vec::new(),
        }
    };

    let (frames, segment_stats) = if info.video_codec.is_some() && info.width > 0 && info.height > 0
    {
        let (f, s) = scan_video(t, file, &info, segs)?;
        (f, Some(s))
    } else {
        (Vec::new(), None)
    };
    let mut video = video_stats(&frames, segs);
    if let Some(s) = segment_stats {
        video.segments = s;
    }
    Ok(Measurements {
        format,
        audio,
        video,
    })
}

// ---------------------------------------------------------------------------
// ffmpeg-Läufe
// ---------------------------------------------------------------------------

fn base_args(file: &Path) -> Vec<OsString> {
    let mut a: Vec<OsString> = ["-hide_banner", "-nostdin", "-v", "error", "-i"]
        .iter()
        .map(OsString::from)
        .collect();
    a.push(file.as_os_str().to_owned());
    a
}

/// Startet ffmpeg (Argument-Array, keine Shell) mit stdout als Pipe und leergelesenem
/// stderr. `read` verarbeitet stdout; schlägt es fehl, wird der Prozess beendet.
fn stream<T>(
    t: &Tools,
    args: &[OsString],
    read: impl FnOnce(&mut ChildStdout) -> Result<T>,
) -> Result<T> {
    let mut child = Command::new(&t.ffmpeg)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| spawn_error(&t.ffmpeg, e))?;
    let err = drain_tail(child.stderr.take().expect("stderr piped"));
    let mut stdout = child.stdout.take().expect("stdout piped");
    let result = read(&mut stdout);
    if result.is_err() {
        let _ = child.kill();
    }
    drop(stdout);
    let status = child.wait()?;
    let stderr_tail = err.join().unwrap_or_default();
    let value = result?;
    if !status.success() {
        return Err(Error::ToolFailed {
            code: status.code(),
            stderr_tail,
        });
    }
    Ok(value)
}

/// Füllt `buf` so weit wie möglich; liefert die Zahl der gelesenen Bytes (< Länge nur am Ende).
fn read_full(r: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut n = 0;
    while n < buf.len() {
        match r.read(&mut buf[n..]) {
            Ok(0) => break,
            Ok(k) => n += k,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
    Ok(n)
}

fn measure_loudness(t: &Tools, file: &Path) -> Result<(Option<f64>, Option<f64>)> {
    let mut args = vec![OsString::from("-hide_banner"), OsString::from("-nostdin")];
    args.extend(["-v", "info", "-i"].map(OsString::from));
    args.push(file.as_os_str().to_owned());
    args.extend(
        [
            "-vn",
            "-map",
            "0:a:0",
            "-af",
            "ebur128=peak=true:framelog=verbose",
            "-f",
            "null",
            "-",
        ]
        .map(OsString::from),
    );
    let out = Command::new(&t.ffmpeg)
        .args(&args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| spawn_error(&t.ffmpeg, e))?;
    let text = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        let tail: Vec<&str> = text.lines().rev().take(20).collect();
        return Err(Error::ToolFailed {
            code: out.status.code(),
            stderr_tail: tail.into_iter().rev().collect::<Vec<_>>().join("\n"),
        });
    }
    parse_ebur128_summary(&text)
}

/// Liest `I:` (LUFS) und `True peak: Peak:` (dBFS) aus der letzten „Summary“.
/// −70,0 LUFS (Boden von ebur128) und `-inf` ergeben `None`.
pub(crate) fn parse_ebur128_summary(text: &str) -> Result<(Option<f64>, Option<f64>)> {
    let summary = text
        .rfind("Summary:")
        .map(|i| &text[i..])
        .ok_or_else(|| Error::Parse("ebur128: keine Zusammenfassung gefunden".into()))?;
    let mut lufs = None;
    let mut peak = None;
    let mut in_true_peak = false;
    for line in summary.lines().map(str::trim) {
        if line.starts_with("True peak:") {
            in_true_peak = true;
        } else if let Some(v) = line.strip_prefix("I:") {
            lufs = Some(parse_level(v, "LUFS")?);
        } else if in_true_peak {
            if let Some(v) = line.strip_prefix("Peak:") {
                peak = Some(parse_level(v, "dBFS")?);
                in_true_peak = false;
            }
        }
    }
    let lufs = lufs.ok_or_else(|| Error::Parse("ebur128: kein I-Wert".into()))?;
    let peak = peak.ok_or_else(|| Error::Parse("ebur128: kein True-Peak-Wert".into()))?;
    Ok((
        Some(lufs).filter(|v| v.is_finite() && *v > LUFS_FLOOR),
        Some(peak).filter(|v| v.is_finite()),
    ))
}

fn parse_level(v: &str, unit: &str) -> Result<f64> {
    v.trim()
        .strip_suffix(unit)
        .unwrap_or(v)
        .trim()
        .parse::<f64>()
        .map_err(|_| Error::Parse(format!("ebur128: Wert nicht lesbar: {}", v.trim())))
}

/// Kanalzahl der ersten Tonspur. Der Ton wird in seiner eigenen Kanalzahl gelesen, weil
/// `-ac 2` bei Mono um 3 dB abschwächen würde und Clipping dann unentdeckt bliebe.
fn audio_channels(t: &Tools, file: &Path) -> Result<usize> {
    let out = Command::new(&t.ffprobe)
        .args(["-v", "error", "-select_streams", "a:0"])
        .args(["-show_entries", "stream=channels", "-of", "csv=p=0", "-i"])
        .arg(file)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| spawn_error(&t.ffprobe, e))?;
    if !out.status.success() {
        return Err(Error::ToolFailed {
            code: out.status.code(),
            stderr_tail: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        });
    }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<usize>()
        .ok()
        .filter(|&c| c > 0)
        .ok_or_else(|| Error::Parse("Kanalzahl der Tonspur nicht lesbar".into()))
}

fn scan_pcm(t: &Tools, file: &Path) -> Result<(u64, Vec<Interval>)> {
    let channels = audio_channels(t, file)?;
    let mut args = base_args(file);
    args.extend(["-vn", "-map", "0:a:0", "-ar", "48000", "-f", "f32le", "-"].map(OsString::from));
    let window_frames = (PCM_RATE as f64 * SILENCE_WINDOW_SEC).round() as usize;
    let (clipped, silent) = stream(t, &args, |out| {
        let mut buf = vec![0u8; window_frames * channels * 4];
        let mut clipped = 0u64;
        let mut silent: Vec<bool> = Vec::new();
        loop {
            let n = read_full(out, &mut buf)?;
            // Nur ganze Samples zählen; ein angebrochenes am Ende wird verworfen.
            let n = n - n % 4;
            if n == 0 {
                break;
            }
            let mut sum_sq = 0.0f64;
            let count = n / 4;
            for b in buf[..n].chunks_exact(4) {
                let x = f32::from_le_bytes([b[0], b[1], b[2], b[3]]);
                if x.abs() >= CLIP_LEVEL {
                    clipped += 1;
                }
                sum_sq += f64::from(x) * f64::from(x);
            }
            let rms = (sum_sq / count as f64).sqrt();
            let db = if rms > 0.0 {
                20.0 * rms.log10()
            } else {
                f64::NEG_INFINITY
            };
            silent.push(db < SILENCE_DBFS);
            if n < buf.len() {
                break;
            }
        }
        Ok((clipped, silent))
    })?;
    let min_windows = (SILENCE_MIN_SEC / SILENCE_WINDOW_SEC).round() as usize;
    let silences = runs(&silent)
        .into_iter()
        .filter(|(a, b)| b - a >= min_windows)
        .map(|(a, b)| Interval {
            start: a as f64 * SILENCE_WINDOW_SEC,
            end: b as f64 * SILENCE_WINDOW_SEC,
        })
        .collect();
    Ok((clipped, silences))
}

// ---------------------------------------------------------------------------
// Bild-Durchlauf
// ---------------------------------------------------------------------------

/// Messwerte eines Analysebilds.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct FrameStat {
    luma: f64,
    highlights_pct: f64,
    shadows_pct: f64,
    u: f64,
    v: f64,
    /// Mittlere absolute Luma-Differenz zum Vorgängerbild (erstes Bild: `None`).
    diff: Option<f64>,
}

fn norm_luma(y: u8) -> f64 {
    ((f64::from(y) - 16.0) / 219.0).clamp(0.0, 1.0)
}

/// Ausgabehöhe der Analysebilder: gerade, mindestens 2, aus der angezeigten Größe.
fn analysis_height(info: &MediaInfo) -> u32 {
    let h = f64::from(ANALYSIS_WIDTH) * f64::from(info.height) / f64::from(info.width);
    (((h / 2.0).round() as u32) * 2).max(2)
}

/// Bildebenen eines Analysebilds (Y, U, V je `w × h`).
pub(crate) struct Planes {
    w: usize,
    h: usize,
    y: Vec<u8>,
    u: Vec<u8>,
    v: Vec<u8>,
}

/// Bildbereich ohne Balken als `(zeile_von, zeile_bis, spalte_von, spalte_bis)`: von den Rändern her die
/// Zeilen und Spalten weglassen, die in ≥ 98 % der Bilder ganz schwarz sind. Bleibt nichts übrig, ist das
/// Schwarz das Bild selbst – dann zählt das ganze Bild.
pub(crate) fn content_rect(frames: &[&Planes]) -> (usize, usize, usize, usize) {
    let Some(first) = frames.first() else {
        return (0, 0, 0, 0);
    };
    let (w, h) = (first.w, first.h);
    let need = ((BAR_SHARE * frames.len() as f64).ceil() as usize).max(1);
    let row_bar = |r: usize| {
        frames
            .iter()
            .filter(|p| p.y[r * w..(r + 1) * w].iter().all(|&y| y <= BAR_Y))
            .count()
            >= need
    };
    let (mut r0, mut r1) = (0, h);
    while r0 < r1 && row_bar(r0) {
        r0 += 1;
    }
    while r1 > r0 && row_bar(r1 - 1) {
        r1 -= 1;
    }
    if r0 >= r1 {
        return (0, h, 0, w);
    }
    let col_bar = |c: usize| {
        frames
            .iter()
            .filter(|p| (r0..r1).all(|r| p.y[r * w + c] <= BAR_Y))
            .count()
            >= need
    };
    let (mut c0, mut c1) = (0, w);
    while c0 < c1 && col_bar(c0) {
        c0 += 1;
    }
    while c1 > c0 && col_bar(c1 - 1) {
        c1 -= 1;
    }
    if c0 >= c1 {
        return (0, h, 0, w);
    }
    (r0, r1, c0, c1)
}

/// Abschnittswerte aus den Bildebenen, ohne Balken.
fn segment_stats_planes(seg: &Segment, frames: &[&Planes], table: &[f64]) -> SegmentStats {
    let (r0, r1, c0, c1) = content_rect(frames);
    let n_px = ((r1 - r0) * (c1 - c0)).max(1) as f64;
    let mut acc = [0.0f64; 5];
    for p in frames {
        let (mut l, mut hl, mut sh, mut u, mut v) = (0.0, 0usize, 0usize, 0.0, 0.0);
        for r in r0..r1 {
            for c in c0..c1 {
                let i = r * p.w + c;
                let y = p.y[i];
                l += table[y as usize];
                hl += usize::from(y >= HIGHLIGHT_Y);
                sh += usize::from(y <= SHADOW_Y);
                u += (f64::from(p.u[i]) - 128.0) / 224.0;
                v += (f64::from(p.v[i]) - 128.0) / 224.0;
            }
        }
        acc[0] += l / n_px;
        acc[1] += 100.0 * hl as f64 / n_px;
        acc[2] += 100.0 * sh as f64 / n_px;
        acc[3] += u / n_px;
        acc[4] += v / n_px;
    }
    let n = frames.len().max(1) as f64;
    SegmentStats {
        start: seg.start,
        end: seg.end,
        mean_luma: acc[0] / n,
        highlights_pct: acc[1] / n,
        shadows_pct: acc[2] / n,
        mean_u: acc[3] / n,
        mean_v: acc[4] / n,
    }
}

/// Bilder eines Abschnitts aus dem Fenster: Zeitstempel in `[start, end)`, sonst das Bild bei `start`
/// (bzw. das letzte vorhandene) – wie `segment_stats`.
fn frames_of<'a>(window: &'a [(usize, Planes)], seg: &Segment, dt: f64) -> Vec<&'a Planes> {
    let sel: Vec<&Planes> = window
        .iter()
        .filter(|(i, _)| {
            let ts = *i as f64 * dt;
            ts >= seg.start - 1e-9 && ts < seg.end - 1e-9
        })
        .map(|(_, p)| p)
        .collect();
    if !sel.is_empty() || window.is_empty() {
        return sel;
    }
    let last = window[window.len() - 1].0;
    let want = ((seg.start / dt).floor().max(0.0) as usize).min(last);
    window
        .iter()
        .find(|(i, _)| *i == want)
        .map(|(_, p)| vec![p])
        .unwrap_or_default()
}

/// Liest die Analysebilder: Bildwerte für Schwarz/Standbild/Schnitte und – mit einem gleitenden Fenster, das
/// nur die Bilder noch offener Abschnitte hält – die Abschnittswerte ohne Balken.
fn scan_video(
    t: &Tools,
    file: &Path,
    info: &MediaInfo,
    segs: &[Segment],
) -> Result<(Vec<FrameStat>, Vec<SegmentStats>)> {
    let h = analysis_height(info) as usize;
    let w = ANALYSIS_WIDTH as usize;
    let plane = w * h;
    let dt = 1.0 / ANALYSIS_FPS;
    let mut args = base_args(file);
    args.extend(["-an", "-vf"].map(OsString::from));
    args.push(format!("fps=5,scale={ANALYSIS_WIDTH}:{h},format=yuv444p").into());
    args.extend(["-f", "rawvideo", "-"].map(OsString::from));

    let table: Vec<f64> = (0..=255u8).map(norm_luma).collect();
    stream(t, &args, |out| {
        let mut buf = vec![0u8; plane * 3];
        let mut prev_y: Option<Vec<u8>> = None;
        let mut stats = Vec::new();
        let mut window: Vec<(usize, Planes)> = Vec::new();
        let mut seg_out: Vec<Option<SegmentStats>> = vec![None; segs.len()];
        loop {
            let n = read_full(out, &mut buf)?;
            if n < buf.len() {
                break; // Ende (ein angebrochenes Bild wird verworfen)
            }
            let (y, rest) = buf.split_at(plane);
            let (u, v) = rest.split_at(plane);
            let luma = y.iter().map(|&p| table[p as usize]).sum::<f64>() / plane as f64;
            let hl = y.iter().filter(|&&p| p >= HIGHLIGHT_Y).count();
            let sh = y.iter().filter(|&&p| p <= SHADOW_Y).count();
            let mean_c = |c: &[u8]| {
                c.iter()
                    .map(|&p| (f64::from(p) - 128.0) / 224.0)
                    .sum::<f64>()
                    / plane as f64
            };
            let diff = prev_y.as_ref().map(|p| {
                y.iter()
                    .zip(p)
                    .map(|(&a, &b)| (table[a as usize] - table[b as usize]).abs())
                    .sum::<f64>()
                    / plane as f64
            });
            stats.push(FrameStat {
                luma,
                highlights_pct: 100.0 * hl as f64 / plane as f64,
                shadows_pct: 100.0 * sh as f64 / plane as f64,
                u: mean_c(u),
                v: mean_c(v),
                diff,
            });
            match &mut prev_y {
                Some(p) => p.copy_from_slice(y),
                None => prev_y = Some(y.to_vec()),
            }
            let idx = stats.len() - 1;
            window.push((
                idx,
                Planes {
                    w,
                    h,
                    y: y.to_vec(),
                    u: u.to_vec(),
                    v: v.to_vec(),
                },
            ));
            // Abschnitte, deren Ende dieses Bild erreicht hat, sind vollständig.
            let ts = idx as f64 * dt;
            for (k, seg) in segs.iter().enumerate() {
                if seg_out[k].is_none() && ts >= seg.end - 1e-9 {
                    seg_out[k] = Some(segment_stats_planes(
                        seg,
                        &frames_of(&window, seg, dt),
                        &table,
                    ));
                }
            }
            // Nur Bilder behalten, die ein offener Abschnitt noch braucht (und das letzte).
            let keep = segs
                .iter()
                .zip(&seg_out)
                .filter(|(_, o)| o.is_none())
                .map(|(s, _)| (s.start / dt).floor().max(0.0) as usize)
                .min()
                .unwrap_or(idx);
            window.retain(|(i, _)| *i >= keep.min(idx));
        }
        let segments = segs
            .iter()
            .zip(seg_out)
            .map(|(seg, o)| {
                o.unwrap_or_else(|| segment_stats_planes(seg, &frames_of(&window, seg, dt), &table))
            })
            .collect();
        Ok((stats, segments))
    })
}

/// Zusammenhängende `true`-Läufe als `[von, bis)`-Indizes.
fn runs(flags: &[bool]) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut start = None;
    for (i, &f) in flags.iter().enumerate() {
        match (f, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                out.push((s, i));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        out.push((s, flags.len()));
    }
    out
}

/// Schwarz-, Standbild- und Schnitterkennung sowie Aggregation je Abschnitt.
pub(crate) fn video_stats(frames: &[FrameStat], segments: &[Segment]) -> VideoStats {
    let dt = 1.0 / ANALYSIS_FPS;
    let eps = 1e-9;

    let black_flags: Vec<bool> = frames.iter().map(|f| f.luma < BLACK_LUMA).collect();
    let black = runs(&black_flags)
        .into_iter()
        .filter(|(a, b)| (b - a) as f64 * dt >= BLACK_MIN_SEC - eps)
        .map(|(a, b)| Interval {
            start: a as f64 * dt,
            end: b as f64 * dt, // letztes Bild + 0,2 s
        })
        .collect();

    // Ein Bild mit kleiner Differenz gleicht seinem Vorgänger: der Lauf beginnt beim Vorgänger.
    let freeze_flags: Vec<bool> = frames
        .iter()
        .map(|f| f.diff.is_some_and(|d| d < FREEZE_DIFF))
        .collect();
    let freeze = runs(&freeze_flags)
        .into_iter()
        .filter(|(a, b)| (b - a + 1) as f64 * dt >= FREEZE_MIN_SEC - eps)
        .map(|(a, b)| Interval {
            start: (a - 1) as f64 * dt,
            end: b as f64 * dt,
        })
        .collect();

    let detected_cuts = frames
        .iter()
        .enumerate()
        .filter(|(_, f)| f.diff.is_some_and(|d| d > CUT_DIFF))
        .map(|(i, _)| i as f64 * dt)
        .collect();

    let segments = segments
        .iter()
        .map(|s| segment_stats(frames, s, dt))
        .collect();
    VideoStats {
        black,
        freeze,
        detected_cuts,
        segments,
    }
}

fn segment_stats(frames: &[FrameStat], seg: &Segment, dt: f64) -> SegmentStats {
    let mut sel: Vec<&FrameStat> = frames
        .iter()
        .enumerate()
        .filter(|(i, _)| {
            let ts = *i as f64 * dt;
            ts >= seg.start - 1e-9 && ts < seg.end - 1e-9
        })
        .map(|(_, f)| f)
        .collect();
    if sel.is_empty() && !frames.is_empty() {
        // Abschnitt kürzer als ein Bildabstand: nächstes Bild davor verwenden.
        let i = ((seg.start / dt).floor().max(0.0) as usize).min(frames.len() - 1);
        sel.push(&frames[i]);
    }
    let n = sel.len().max(1) as f64;
    let mean = |f: fn(&FrameStat) -> f64| sel.iter().map(|x| f(x)).sum::<f64>() / n;
    SegmentStats {
        start: seg.start,
        end: seg.end,
        mean_luma: mean(|f| f.luma),
        highlights_pct: mean(|f| f.highlights_pct),
        shadows_pct: mean(|f| f.shadows_pct),
        mean_u: mean(|f| f.u),
        mean_v: mean(|f| f.v),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SUMMARY: &str = "[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -23.0 LUFS\n    Threshold: -33.0 LUFS\n\n  Loudness range:\n    LRA:         5.0 LU\n    LRA low:   -26.0 LUFS\n    LRA high:  -21.0 LUFS\n\n  True peak:\n    Peak:       -1.2 dBFS\n";

    #[test]
    fn parses_ebur128_summary() {
        let (l, p) = parse_ebur128_summary(SUMMARY).unwrap();
        assert_eq!((l, p), (Some(-23.0), Some(-1.2)));
    }

    #[test]
    fn digital_silence_and_inf_become_none() {
        let s = SUMMARY
            .replace("-23.0 LUFS", "-70.0 LUFS")
            .replace("-1.2 dBFS", "-inf dBFS");
        assert_eq!(parse_ebur128_summary(&s).unwrap(), (None, None));
        let s = SUMMARY.replace("-23.0 LUFS", "-inf LUFS");
        assert_eq!(parse_ebur128_summary(&s).unwrap().0, None);
        // knapp über dem Boden bleibt erhalten
        let s = SUMMARY.replace("-23.0 LUFS", "-69.9 LUFS");
        assert_eq!(parse_ebur128_summary(&s).unwrap().0, Some(-69.9));
    }

    #[test]
    fn uses_last_summary_and_rejects_garbage() {
        let two = format!(
            "{}\nrauschen\n{}",
            SUMMARY.replace("-23.0", "-30.0"),
            SUMMARY
        );
        assert_eq!(parse_ebur128_summary(&two).unwrap().0, Some(-23.0));
        assert!(parse_ebur128_summary("nichts").is_err());
        assert!(parse_ebur128_summary("Summary:\n I: abc LUFS\n").is_err());
        assert!(parse_ebur128_summary("Summary:\n I: -20.0 LUFS\n").is_err());
    }

    #[test]
    fn finds_runs() {
        assert_eq!(runs(&[true, true, false, true]), vec![(0, 2), (3, 4)]);
        assert!(runs(&[false, false]).is_empty());
    }

    fn fs(luma: f64, diff: Option<f64>) -> FrameStat {
        FrameStat {
            luma,
            highlights_pct: luma * 10.0,
            shadows_pct: 0.0,
            u: 0.0,
            v: 0.0,
            diff,
        }
    }

    #[test]
    fn detects_black_freeze_cuts_and_segments() {
        // 5 fps: 0..2 s bewegt, 2..3 s schwarz, danach 3 s eingefroren.
        let mut f = vec![fs(0.5, None)];
        f.extend((1..10).map(|_| fs(0.5, Some(0.1))));
        f.push(fs(0.0, Some(0.5))); // Schnitt bei 2,0 s
        f.extend((0..4).map(|_| fs(0.0, Some(0.0))));
        f.push(fs(0.6, Some(0.6))); // Schnitt bei 3,0 s
        f.extend((0..15).map(|_| fs(0.6, Some(0.001))));
        let v = video_stats(
            &f,
            &[
                Segment {
                    start: 0.0,
                    end: 2.0,
                },
                Segment {
                    start: 3.0,
                    end: 6.0,
                },
            ],
        );
        assert_eq!(
            v.black,
            vec![Interval {
                start: 2.0,
                end: 3.0
            }]
        );
        assert_eq!(v.detected_cuts, vec![2.0, 3.0]);
        // 15 gleiche Bilder + das Ausgangsbild: von 3,0 s bis 6,2 s; der Schwarzlauf (4 Diffs
        // → 1,0 s) ist zu kurz.
        assert_eq!(
            v.freeze,
            vec![Interval {
                start: 3.0,
                end: 6.2
            }]
        );
        assert!((v.segments[0].mean_luma - 0.5).abs() < 1e-9);
        assert!((v.segments[1].highlights_pct - 6.0).abs() < 1e-9);
    }

    #[test]
    fn segment_without_frames_uses_nearest_and_empty_input_is_zero() {
        let f = vec![fs(0.3, None), fs(0.4, Some(0.1))];
        let v = video_stats(
            &f,
            &[Segment {
                start: 0.21,
                end: 0.22,
            }],
        );
        assert!((v.segments[0].mean_luma - 0.4).abs() < 1e-9);
        let v = video_stats(
            &[],
            &[Segment {
                start: 0.0,
                end: 1.0,
            }],
        );
        assert_eq!(v.segments[0].mean_luma, 0.0);
    }

    #[test]
    fn analysis_height_is_even() {
        let mk = |w, h| MediaInfo {
            kind: crate::probe::MediaKind::Video,
            duration_sec: 1.0,
            width: w,
            height: h,
            fps: None,
            has_audio: false,
            hdr: false,
            video_codec: None,
            audio_codec: None,
            rotation: 0,
        };
        assert_eq!(analysis_height(&mk(1920, 1080)), 90);
        assert_eq!(analysis_height(&mk(1080, 1920)), 284);
        assert_eq!(analysis_height(&mk(1000, 1)), 2);
    }
}
