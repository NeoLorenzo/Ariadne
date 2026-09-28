"""Ariadne demo score — composed and synthesised from scratch (no samples, no ML).

117.1875 BPM (beat = 0.512s, bar = 2.048s). Bar 0 lands at T0 = 0.256s so every
video cut (4.352, 10.496, 16.64, 22.784, 30.976, 35.072, 41.216) sits on a bar line.

A minor → C major: tension (busy) → the thread → the groove → resolution on the logo.

    python tools/compose.py  → assets/bgm/ariadne-score.wav (+ stems/ for inspection)
"""
import os
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
BEAT = 0.512
S16 = BEAT / 4
BAR = BEAT * 4
T0 = 0.256
DUR = 41.9
N = int(DUR * SR)
rng = np.random.default_rng(20260928)
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "bgm")


def tb(bar, beat=0.0, s16=0.0):
    return T0 + bar * BAR + beat * BEAT + s16 * S16


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


# ───────────────────────────── buses ─────────────────────────────
class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def add(self, t, y, pan=0.0, gain=1.0):
        """Add mono (n,) or stereo (2,n) signal y at time t (s), equal-power pan."""
        i = int(round(t * SR))
        if y.ndim == 1:
            a = (pan + 1) * np.pi / 4
            y = np.vstack([y * np.cos(a), y * np.sin(a)]) * np.sqrt(2)
        if i < 0:
            y, i = y[:, -i:], 0
        n = min(y.shape[1], N - i)
        if n > 0:
            self.x[:, i:i + n] += y[:, :n] * gain


# ─────────────────────────── DSP helpers ───────────────────────────
def rbj(kind, f, q):
    f = min(max(f, 20.0), SR * 0.45)
    w = 2 * np.pi * f / SR
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    if kind == "lp":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == "hp":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else:  # band-pass, constant peak gain
        b = [al, 0, -al]
    a = [1 + al, -2 * c, 1 - al]
    return np.array(b) / a[0], np.array(a) / a[0]


def filt(x, kind, f, q=0.707):
    b, a = rbj(kind, f, q)
    return signal.lfilter(b, a, x, axis=-1)


def sweep(x, kind, cut, q=0.707, block=64):
    """Time-varying biquad; cut is an array (per sample) or a callable of time."""
    cut = cut(tt(x.shape[-1])) if callable(cut) else cut
    y = np.empty_like(x)
    zi = np.zeros(x.shape[:-1] + (2,))
    for i in range(0, x.shape[-1], block):
        b, a = rbj(kind, float(cut[min(i, len(cut) - 1)]), q)
        y[..., i:i + block], zi = signal.lfilter(b, a, x[..., i:i + block], axis=-1, zi=zi)
    return y


def saw(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    t = ph[m] / dt[m]
    y[m] -= t + t - t * t - 1
    m = ph > 1 - dt
    t = (ph[m] - 1) / dt[m]
    y[m] -= t * t + t + t + 1
    return y


def sine(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.sin(2 * np.pi * (ph0 + np.cumsum(f) / SR))


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.2, hold=None):
    """hold = seconds until release starts (default: n - r)."""
    t = tt(n)
    hold = (n / SR - r) if hold is None else hold
    env = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > hold
    lvl = np.interp(hold, t, env) if hold < t[-1] else env[-1]
    env[rel] = lvl * np.exp(-(t[rel] - hold) / max(r / 4, 1e-6))
    return env


def noise(n):
    return rng.standard_normal(n)


# ─────────────────────────── instruments ───────────────────────────
def kick(v=1.0):
    n = int(0.55 * SR)
    t = tt(n)
    f = 52 + 125 * np.exp(-t / 0.03) + 40 * np.exp(-t / 0.005)
    body = sine(f, n) * np.exp(-t / 0.24) * (1 - np.exp(-t / 0.0012))
    click = filt(noise(n), "hp", 2500) * np.exp(-t / 0.0025) * 0.35
    y = np.tanh(1.8 * (body + click)) / np.tanh(1.8)
    return y * v


def clap(v=1.0):
    n = int(0.45 * SR)
    t = tt(n)
    env = np.zeros(n)
    for d, g in ((0.0, 1.0), (0.0105, 0.9), (0.021, 0.85)):
        env += np.where(t >= d, g * np.exp(-np.clip(t - d, 0, None) / 0.0055), 0)
    env += np.where(t >= 0.03, 0.7 * np.exp(-np.clip(t - 0.03, 0, None) / 0.11), 0)
    y = filt(filt(noise(n), "bp", 1350, 0.8), "hp", 600) * env
    return y * v / np.max(np.abs(y))


def hat(v=1.0, open_=False):
    n = int((0.45 if open_ else 0.09) * SR)
    t = tt(n)
    y = filt(filt(noise(n), "hp", 7200, 0.9), "hp", 7200, 0.9)
    y *= np.exp(-t / (0.2 if open_ else 0.028))
    return y * v / np.max(np.abs(y))


def shaker(v=1.0):
    n = int(0.08 * SR)
    t = tt(n)
    y = filt(noise(n), "bp", 6200, 1.2) * (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.03)
    return y * v / np.max(np.abs(y))


def snare(v=1.0):
    n = int(0.3 * SR)
    t = tt(n)
    y = filt(noise(n), "bp", 2400, 0.7) * np.exp(-t / 0.09) + 0.5 * sine(190 * np.exp(-t / 0.3), n) * np.exp(-t / 0.05)
    return y * v / np.max(np.abs(y))


def crash(v=1.0):
    n = int(3.2 * SR)
    t = tt(n)
    y = filt(noise(n), "hp", 3800) + 0.4 * filt(noise(n), "bp", 9000, 2)
    y *= np.exp(-t / 1.0) * (1 - np.exp(-t / 0.002))
    return y * v / np.max(np.abs(y))


def tick(v=1.0, f=2600):
    n = int(0.05 * SR)
    t = tt(n)
    y = sine(f, n) * np.exp(-t / 0.008) + 0.3 * filt(noise(n), "hp", 5000) * np.exp(-t / 0.004)
    return y * v


def supersaw(m, n, spread=0.16, voices=7, ph_seed=0):
    """Returns stereo (2, n) detuned saw stack."""
    out = np.zeros((2, n))
    r = np.random.default_rng(ph_seed + int(m * 7))
    for k in range(voices):
        d = (k - (voices - 1) / 2) / ((voices - 1) / 2)  # -1..1
        det = d * spread  # semitones
        y = saw(hz(m + det), n, r.random())
        pan = d * 0.85
        a = (pan + 1) * np.pi / 4
        out[0] += y * np.cos(a)
        out[1] += y * np.sin(a)
    return out / voices * 1.6


def pluck(m, v=1.0, bright=4200, dec=0.16, length=0.42):
    n = int(length * SR)
    t = tt(n)
    y = 0.65 * saw(hz(m), n) + 0.35 * saw(hz(m) * 2.003, n)
    cut = 380 + bright * np.exp(-t / 0.07)
    y = sweep(y, "lp", cut, 1.1)
    y *= (1 - np.exp(-t / 0.002)) * np.exp(-t / dec)
    return y * v


def lead(m, dur, v=1.0, bright=2600):
    n = int((dur + 0.25) * SR)
    t = tt(n)
    vib = 1 + (2 ** (0.14 / 12) - 1) * np.sin(2 * np.pi * 5.4 * t) * np.clip((t - 0.18) / 0.2, 0, 1)
    y = 0.5 * saw(hz(m) * vib * 1.0025, n) + 0.5 * saw(hz(m) * vib * 0.9975, n) + 0.25 * sine(hz(m - 12) * vib, n)
    y = filt(y, "lp", bright, 0.9)
    y *= adsr(n, a=0.012, d=0.25, s=0.72, r=0.22, hold=dur)
    return y * v


def bell(m, v=1.0, dec=2.2, ratio=3.5):
    n = int((dec * 2.2) * SR)
    t = tt(n)
    fc = hz(m)
    idx = 2.2 * np.exp(-t / (dec * 0.25))
    y = np.sin(2 * np.pi * fc * t + idx * np.sin(2 * np.pi * fc * ratio * t))
    y += 0.3 * np.sin(2 * np.pi * fc * 2.0 * t) * np.exp(-t / (dec * 0.4))
    y *= (1 - np.exp(-t / 0.002)) * np.exp(-t / dec)
    return y * v


def impact(v=1.0, dark=1.0):
    n = int(3.5 * SR)
    t = tt(n)
    sub = sine(28 + 55 * np.exp(-t / 0.22), n) * np.exp(-t / (0.9 * dark)) * (1 - np.exp(-t / 0.002))
    body = filt(noise(n), "lp", 900) * np.exp(-t / 0.28) * 0.9
    snap = filt(noise(n), "hp", 2500) * np.exp(-t / 0.035) * 0.5
    y = np.tanh(1.5 * (sub * 1.1 + body + snap))
    return y * v


def riser(dur, v=1.0, f0=300, f1=9000):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    cut = f0 * (f1 / f0) ** p
    y = sweep(noise(n), "bp", cut, 2.2) * 2.2
    tone = saw(hz(57) * 2 ** (p * 2), n) * 0.18
    y = (y + sweep(tone, "lp", cut)) * p ** 2.2
    return y * v


def swell(dur, v=1.0):
    """Reversed cymbal: rises into the hit."""
    n = int(dur * SR)
    t = tt(n)[::-1]
    y = filt(noise(n), "hp", 2500) * np.exp(-t / (dur * 0.35))
    return y * v / np.max(np.abs(y))


def downlifter(dur, v=1.0):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    y = sweep(noise(n), "bp", 7000 * (200 / 7000) ** p, 1.6) * (1 - p) ** 1.5 * 1.8
    return y * v


# ─────────────────────────── the score ───────────────────────────
# Chords per bar (0..19). Voicings for pad; root for bass.
AM9 = [57, 60, 64, 67, 71]
FMAJ9 = [53, 57, 60, 64, 67]
CADD9 = [55, 60, 64, 67, 74]
G6 = [55, 59, 62, 64, 69]
ROOT = {"Am": 33, "F": 29, "C": 36, "G": 31}
VOICE = {"Am": AM9, "F": FMAJ9, "C": CADD9, "G": G6}
CHORDS = ["Am", "Am", "F", "Am", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "F", "C", "C"]

drums, bass, pad, arp, leadb, fx, bells = (Bus() for _ in range(7))
rev_send, dly_send = Bus(), Bus()
kicks = []

# Sections (bars): 0-1 tangle · 2-4 thread · 5-7 drop/dashboard · 8-10 explorer (+lead)
# 11 Ari Bot · 12 processing break · 13-14 re-sort drop · 15-16 signals · 17-19 close.
GROOVE = set(range(5, 12)) | {13, 14, 15, 16}

# ── Section A: tangle (bars 0-1) — ticking chaos, three slams, suck, boom.
fx.add(0.0, swell(0.256, 0.5), gain=0.35)
for t_hit, v in ((tb(0), 1.0), (tb(0, 2), 0.7), (tb(0, 3), 1.0)):
    fx.add(t_hit, impact(v), gain=0.62)
    stab = supersaw(45, int(0.9 * SR)) + supersaw(52, int(0.9 * SR))
    stab = filt(stab, "lp", 1400) * np.exp(-tt(stab.shape[1]) / 0.25)
    pad.add(t_hit, stab, gain=0.45 * v)
    rev_send.add(t_hit, stab, gain=0.25 * v)
# drone under the chaos
n = int((tb(2) - 0.0) * SR)
dr = supersaw(33, n, spread=0.08) + 0.6 * supersaw(40, n, spread=0.1)
dr = sweep(dr, "lp", lambda t: 180 + 700 * (t / t[-1]) ** 2)
dr *= np.clip(tt(n) / 0.2, 0, 1)
dr *= np.interp(tt(n), [0, 2.7, 3.8, n / SR], [1, 1, 0.25, 0.2])
pad.add(0.0, dr, gain=0.32)
# busy ticks: 16ths + random 32nd ghosts, random pans, fading into the suck
for s in range(0, 32):
    t_s = tb(0, 0, s)
    if t_s > 3.75:
        break
    fade = 1.0 if t_s < 2.7 else max(0.0, 1 - (t_s - 2.7) / 1.0)
    drums.add(t_s, hat(0.5 + 0.5 * rng.random()), pan=rng.uniform(-0.8, 0.8), gain=0.1 * fade)
    if rng.random() < 0.55:
        drums.add(t_s + S16 / 2, tick(0.6, rng.choice([2100, 2600, 3200, 3900])), pan=rng.uniform(-0.9, 0.9), gain=0.07 * fade)
fx.add(tb(1, 1), swell(tb(1, 3) - tb(1, 1), 0.9), gain=0.3)  # 2.8 → 3.84 suck
r = riser(tb(1, 3) - tb(1, 1), 1.0, 200, 5000)
fx.add(tb(1, 1), r, gain=0.22)
fx.add(tb(1, 3), impact(1.0), gain=0.7)
for m, g in ((81, 0.5), (88, 0.3)):
    bells.add(tb(1, 3), bell(m, 1.0, 1.6), gain=0.07 * g / 0.5)
    rev_send.add(tb(1, 3), bell(m, 1.0, 1.6), gain=0.05)

# ── Pad + bass layer for bars 2..19
def sc_env():
    env = np.ones(N)
    for k in kicks:
        i = int(k * SR)
        m = int(0.42 * SR)
        if i >= N:
            continue
        seg = tt(min(m, N - i))
        g = 1 - 0.78 * np.exp(-seg / 0.11) * np.clip(seg / 0.004, 0, 1) - 0.78 * (seg < 0.004) * 0
        env[i:i + len(seg)] = np.minimum(env[i:i + len(seg)], g)
    return env

for b in range(2, 20):
    ch = CHORDS[b]
    start = tb(b)
    length = BAR + 0.6 if b < 19 else 3.2
    n = int(length * SR)
    att = 0.35 if b in (2, 3, 4, 17) else 0.06
    st = np.zeros((2, n))
    for m in VOICE[ch]:
        st += supersaw(m, n, spread=0.17, ph_seed=b)
    env = adsr(n, a=att, d=0.8, s=0.85, r=0.6, hold=BAR if b < 19 else 2.2)
    st *= env
    pad.add(start, st, gain=0.34)
    rev_send.add(start, st, gain=0.05)
    # sub: long in calm sections, quarter pulses in the groove
    root = ROOT[ch]
    if b in GROOVE:
        for q in range(4):
            nn = int(0.5 * SR)
            y = sine(hz(root + 12), nn) * adsr(nn, 0.004, 0.2, 0.8, 0.06, hold=0.42)
            bass.add(tb(b, q), np.tanh(1.4 * y), gain=0.24)
            # off-beat mid bass
            nn2 = int(0.24 * SR)
            y2 = saw(hz(root + 24), nn2)
            y2 = sweep(y2, "lp", 350 + 1500 * np.exp(-tt(nn2) / 0.05), 1.3) * np.exp(-tt(nn2) / 0.12)
            bass.add(tb(b, q + 0.5), y2, gain=0.2)
    elif b >= 2:
        nn = int((BAR + 0.3) * SR)
        y = sine(hz(root + 12), nn) * adsr(nn, 0.3 if b < 5 else 0.05, 0.5, 0.9, 0.3, hold=BAR)
        g = 0.18 if b in (2, 3, 4) else 0.24
        if b == 12:
            g = 0.26
        if b >= 17:
            y = sine(hz(root + 12), nn) * adsr(nn, 0.4, 0.8, 0.9, 1.0, hold=BAR if b < 19 else 1.6)
            g = 0.24
        bass.add(tb(b), np.tanh(1.2 * y), gain=g)

# ── Drums in the groove
for b in sorted(GROOVE):
    for q in range(4):
        kicks.append(tb(b, q))
        drums.add(tb(b, q), kick(1.0), gain=0.5)
        drums.add(tb(b, q + 0.5), hat(0.9), pan=0.15, gain=0.21)
        if q in (1, 3):
            drums.add(tb(b, q), clap(1.0), gain=0.26)
            rev_send.add(tb(b, q), clap(1.0), gain=0.12)
        for s in range(4):
            v = (0.5, 0.25, 0.85, 0.3)[s]
            drums.add(tb(b, q, s), shaker(v), pan=-0.35, gain=0.085)
    if b in (13, 14):  # extra drive after the re-sort
        for q in range(4):
            drums.add(tb(b, q + 0.5), hat(0.8, open_=True), pan=-0.1, gain=0.11)
# crashes / impacts on section entries
for b, g in ((5, 1.0), (8, 0.6), (11, 0.6), (13, 1.0), (15, 0.6)):
    drums.add(tb(b), crash(1.0), gain=0.18 * g)
    fx.add(tb(b), impact(1.0, 0.8), gain=0.42 * g)

# ── Thread section (bars 2-4): mark bell + build into the drop
mark_t = tb(3, 3)  # 7.936 — thread finishes writing the mark
fx.add(mark_t - 0.7, swell(0.7, 1.0), gain=0.22)
fx.add(mark_t, impact(0.8), gain=0.4)
for m in (69, 72, 76, 79, 83):
    bells.add(mark_t, bell(m, 1.0, 2.4), gain=0.085)
    rev_send.add(mark_t, bell(m, 1.0, 2.4), gain=0.04)
# heartbeat into the build
for q in (0, 2):
    drums.add(tb(4, q), kick(0.7), gain=0.55)
    kicks.append(tb(4, q))
fx.add(tb(4), riser(BAR - S16 / 2, 1.0), gain=0.3)
for s in range(16):
    if s >= 15:
        break
    step = 1 if s >= 8 else 2
    if s % step:
        continue
    v = 0.35 + 0.65 * s / 15
    drums.add(tb(4, 0, s), snare(v), pan=0.1, gain=0.22)
for s in range(12, 15):  # 32nd flam at the very end
    drums.add(tb(4, 0, s + 0.5), snare(0.9), pan=-0.1, gain=0.18)

# ── Ari Bot "processing" break (bar 12) → re-sort drop (bar 13)
fx.add(tb(12), riser(BAR - S16, 1.0, 250, 11000), gain=0.3)
for s in range(16):
    if s % (1 if s >= 8 else 2):
        continue
    drums.add(tb(12, 0, s), snare(0.3 + 0.6 * s / 15), gain=0.18)
for q in range(4):  # keep the pulse alive with hats only
    drums.add(tb(12, q + 0.5), hat(0.8), gain=0.1)
# signals → close: fill and drop-out
fx.add(tb(16, 2), riser(BEAT * 2, 1.0, 400, 9000), gain=0.25)
fx.add(tb(17), downlifter(1.6, 1.0), gain=0.25)
fx.add(tb(17), impact(0.9, 1.2), gain=0.45)
drums.add(tb(17), crash(1.0), gain=0.14)

# ── Arpeggio: the thread motif (bars 2..18)
PATTERN = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 5, 4, 2, 3, 1]
for b in range(2, 19):
    if b == 2:
        first = 8  # starts with the thread (bar 2, beat 3)
    else:
        first = 0
    tones = sorted(VOICE[CHORDS[b]]) + [sorted(VOICE[CHORDS[b]])[0] + 12]
    for s in range(first, 16):
        t_s = tb(b, 0, s)
        if b == 18 and s >= 4:
            break
        prog = min(1.0, max(0.0, (t_s - tb(2, 2)) / (tb(5) - tb(2, 2))))
        bright = 900 + 3400 * prog if b < 5 else (4400 if b not in (12,) else 2400 + 3000 * (s / 15))
        if b >= 17:
            bright = 2600
        m = tones[PATTERN[s] % len(tones)] + 12
        acc = (1.0, 0.55, 0.75, 0.5)[s % 4]
        y = pluck(m, acc, bright=bright)
        pan = (-0.35, 0.35)[s % 2]
        g = 0.26 if b >= 5 else 0.14 + 0.12 * prog
        if b >= 17:
            g = 0.15
        arp.add(t_s, y, pan=pan, gain=g)
        dly_send.add(t_s, y, gain=g * 0.9)
        rev_send.add(t_s, y, gain=g * 0.3)

# ── Lead melody (bars 8-14): (bar, step, len16, midi)
MEL = [
    (8, 0, 3, 71), (8, 3, 3, 74), (8, 6, 6, 79), (8, 12, 4, 76),
    (9, 0, 6, 76), (9, 6, 2, 74), (9, 8, 4, 72), (9, 12, 4, 69),
    (10, 0, 3, 69), (10, 3, 3, 72), (10, 6, 6, 77), (10, 12, 4, 76),
    (11, 0, 8, 76), (11, 8, 4, 79), (11, 12, 4, 74),
    (12, 0, 14, 74),
    (13, 0, 6, 88), (13, 6, 2, 86), (13, 8, 4, 84), (13, 12, 4, 81),
    (14, 0, 3, 81), (14, 3, 3, 84), (14, 6, 6, 89), (14, 12, 4, 88),
]
for b, st, ln, m in MEL:
    d = ln * S16 * 0.95
    y = lead(m, d, 1.0, bright=3000 if m < 84 else 3600)
    g = 0.26 if m < 84 else 0.2
    leadb.add(tb(b, 0, st), y, pan=0.05, gain=g)
    dly_send.add(tb(b, 0, st), y, gain=g * 0.8)
    rev_send.add(tb(b, 0, st), y, gain=g * 0.45)

# ── Close (bars 17-19): the thread writes the mark → C major resolution
res = tb(18)  # 37.12
fx.add(res - 1.0, swell(1.0, 1.0), gain=0.3)
fx.add(res, impact(1.0, 1.3), gain=0.62)
drums.add(res, crash(1.0), gain=0.12)
for m, g in ((60, 1), (64, 0.8), (67, 0.8), (72, 0.9), (76, 0.6), (79, 0.5)):
    bells.add(res, bell(m, 1.0, 2.8), gain=0.1 * g)
    rev_send.add(res, bell(m, 1.0, 2.8), gain=0.05 * g)
for t_n, m in ((tb(18, 1), 79), (tb(18, 2), 84), (tb(18, 3), 88)):  # ARIADNE · FIND YOUR THREAD · Fabbro
    bells.add(t_n, bell(m, 1.0, 2.0), pan=0.2, gain=0.09)
    rev_send.add(t_n, bell(m, 1.0, 2.0), gain=0.06)
    dly_send.add(t_n, bell(m, 1.0, 2.0), gain=0.03)

# ─────────────────────────── mixing ───────────────────────────
sc = sc_env()
pad.x *= 1 - 0.55 * (1 - sc)
bass.x[:, :] *= 1 - 0.35 * (1 - sc)  # sub pulses already sit on the beat; light duck
arp.x *= 1 - 0.3 * (1 - sc)
# pad brightness automation across the piece
def pad_cut(t):
    return np.interp(t, [0, tb(2), tb(4), tb(5), tb(12), tb(12, 3.9), tb(13), tb(17), tb(19), DUR],
                        [1400, 1100, 3400, 5200, 5200, 9000, 5600, 4200, 5000, 2600])
pad.x = filt(sweep(pad.x, "lp", pad_cut, 0.8, block=256), "hp", 190)
# Ari Bot break: filter the whole groove down, then open for the re-sort
brk = np.interp(tt(N), [0, tb(12) - 0.01, tb(12) + 0.2, tb(12, 3.5), tb(13), DUR], [20000, 20000, 1200, 6000, 20000, 20000])
drums.x = sweep(drums.x, "lp", brk, 0.7, block=256)

# ping-pong delay (dotted 8th)
def pingpong(send, d=BEAT * 0.75, fb=0.42, taps=8):
    mono = send.x.sum(0) * 0.5
    mono = filt(filt(mono, "hp", 300), "lp", 5200)
    out = np.zeros((2, N))
    k_d = int(d * SR)
    for k in range(1, taps + 1):
        s = k * k_d
        if s >= N:
            break
        out[(k + 1) % 2, s:] += mono[:N - s] * fb ** (k - 1)
    return out * 0.55

# synthetic hall reverb
def reverb(send, secs=2.8):
    n = int(secs * SR)
    t = tt(n)
    ir = np.vstack([noise(n), noise(n)]) * np.exp(-t / (secs / 6.9) * 1.0)
    ir = filt(ir, "lp", 6500)
    ir[:, : int(0.018 * SR)] = 0  # pre-delay
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    src = filt(send.x, "hp", 250)
    return np.vstack([signal.fftconvolve(src[c], ir[c])[:N] for c in range(2)]) * 0.9

dly = pingpong(dly_send)
rev = reverb(rev_send)

STEMS = {"drums": drums.x, "bass": bass.x, "pad": pad.x, "arp": arp.x, "lead": leadb.x, "bells": bells.x, "fx": fx.x, "delay": dly, "reverb": rev}
mix = sum(STEMS.values())
mix = filt(mix, "hp", 30)
mix = mix + 0.45 * filt(mix, "hp", 3500) + 0.25 * filt(mix, "hp", 9000)  # presence + air shelf

# glue compressor (RMS, 2:1 over -14 dBFS) + soft clip
rms = np.sqrt(signal.lfilter([0.0015], [1, -0.9985], (mix ** 2).mean(0)) + 1e-12)
thr = 10 ** (-14 / 20)
gain = np.where(rms > thr, (thr / rms) ** (1 - 1 / 2), 1.0)
mix *= gain
mix /= np.max(np.abs(mix)) / 0.95
mix = np.tanh(1.35 * mix) / np.tanh(1.35)
# end fade (after the last bell) and a clean head
fade = np.interp(tt(N), [0, 39.4, 41.2, DUR], [1, 1, 0, 0])
mix *= fade
mix /= np.max(np.abs(mix)) / 0.93

os.makedirs(os.path.join(OUT, "stems"), exist_ok=True)
sf.write(os.path.join(OUT, "ariadne-score.wav"), mix.T.astype(np.float32), SR)
for k, v in STEMS.items():
    sf.write(os.path.join(OUT, "stems", k + ".wav"), (v.T * 0.5).astype(np.float32), SR)

def db(x):
    return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)

print("written", round(N / SR, 2), "s")
for name, (a, b) in {"tangle": (0, 4.35), "thread": (4.35, 10.5), "drop": (10.5, 16.64), "explorer": (16.64, 22.78),
                     "aribot": (22.78, 30.98), "signals": (30.98, 35.07), "close": (35.07, 41.2)}.items():
    seg = slice(int(a * SR), int(b * SR))
    print(f"{name:9s} mix {db(mix[:, seg]):6.1f} dB | " + " ".join(f"{k}:{db(v[:, seg]):6.1f}" for k, v in STEMS.items()))
