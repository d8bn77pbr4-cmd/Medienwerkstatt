#!/usr/bin/env python3
"""Zeichnet das App-Symbol (gleiche Geometrie wie src-tauri/icons/icon.svg) als 1024x1024-PNG.
Aufruf: python3 scripts/make-icon.py <ausgabe.png>; danach: npx tauri icon <ausgabe.png>"""
import sys
from PIL import Image, ImageDraw

S = 4  # Überabtastung für glatte Kanten
N = 1024 * S
A, B = (0x1A, 0x4F, 0xD0), (0x7A, 0xA2, 0xFF)

def sc(pts):
    return [(x * S, y * S) for x, y in pts]

grad = Image.new("RGB", (N, N))
px = grad.load()
for y in range(N):
    for x in range(N):
        t = (x + y) / (2 * (N - 1))
        px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(A, B))
mask = Image.new("L", (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle([64 * S, 64 * S, 960 * S, 960 * S], radius=200 * S, fill=255)
img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)
W, BL = (255, 255, 255, 255), A + (255,)
d.polygon(sc([(212, 356), (812, 236), (836, 330), (236, 450)]), fill=W)
d.rounded_rectangle([212 * S, 480 * S, 812 * S, 780 * S], radius=36 * S, fill=W)
for dx in (0, 150, 300):
    d.polygon(sc([(318 + dx, 327), (384 + dx, 314), (424 + dx, 400), (358 + dx, 413)]), fill=BL)
for x, a, b in [(290, 600, 660), (360, 570, 690), (430, 530, 730), (500, 580, 680), (570, 545, 715), (640, 585, 675), (710, 610, 650)]:
    d.line([(x * S, a * S), (x * S, b * S)], fill=BL, width=30 * S)
    for y in (a, b):
        r = 15 * S
        d.ellipse([x * S - r, y * S - r, x * S + r, y * S + r], fill=BL)
img.resize((1024, 1024), Image.LANCZOS).save(sys.argv[1])
