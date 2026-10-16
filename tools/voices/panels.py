"""Spectrogram panels of a whole track for a person to read (M5 step 6a): the Sounds of Earth (Ozma 04) in 60 s
panels, so the lead can say by eye where animals call and where people speak, the independent truth for
voices.others on that track. Each panel: the spectrogram (0 to 8 kHz, seconds across, Hz up) and, in a strip
below it and kept apart so it does not colour the reading, what the reference finder measured (held calls,
speech runs, the stretches it accepts).

Run: python -P tools/voices/panels.py [track number, default 4]   (reads sources/ozma-cd-NN, data/voices.json)
Out: review/archive/<timestamp>-sounds-spectrograms/panel_NN.png and index.txt
Review aid only: nothing in the game reads these files.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy.signal import spectrogram  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyse  # noqa: E402

PANEL_S = 60.0
TOP_HZ = 8000.0
"""Birds, frogs and whales on this track sit below 8 kHz; speech's formants too."""
NPERSEG = 2048
HOP = 256
"""46 ms windows every 5.8 ms at 44.1 kHz: fine enough in time for calls, in frequency for harmonics (21.5 Hz)."""


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    tid = f"ozma-{n:02d}"
    V = json.load(open(os.path.join(analyse.ROOT, "data", "voices.json"), encoding="utf-8"))
    o = V["others"]["tracks"][tid]
    m, sr = analyse.mono(n)
    stamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    out = os.path.join(analyse.ROOT, "review", "archive", f"{stamp}-sounds-spectrograms")
    os.makedirs(out, exist_ok=True)
    dur = len(m) / sr
    lines = [f"{tid}: {dur:.2f} s in {PANEL_S:.0f} s panels; spectrogram 0 to {TOP_HZ:.0f} Hz (Hann {NPERSEG}, hop {HOP}, dB re the panel's peak, 70 dB range)",
             "strip below each panel (the finder, data/voices.json others): orange = held calls, blue = speech runs, green = accepted stretches",
             "accepted stretches (s, calls inside): " + ", ".join(f"{a / 100:.2f} to {b / 100:.2f} ({k})" for a, b, k in o["accepted"])]
    for k in range(int(np.ceil(dur / PANEL_S))):
        t0, t1 = k * PANEL_S, min(dur, (k + 1) * PANEL_S)
        x = m[int(t0 * sr): int(t1 * sr)]
        f, t, s = spectrogram(x, sr, window="hann", nperseg=NPERSEG, noverlap=NPERSEG - HOP, mode="psd")
        keep = f <= TOP_HZ
        db = 10 * np.log10(s[keep] + 1e-20)
        top = db.max()
        fig, (ax, st) = plt.subplots(2, 1, figsize=(16, 7.5), height_ratios=[6, 1], sharex=True)
        ax.pcolormesh(t0 + t, f[keep], db, vmin=top - 70, vmax=top, cmap="magma", shading="auto")
        ax.set_ylabel("Hz")
        ax.set_title(f"{tid} The Sounds of Earth, {t0:.0f} to {t1:.0f} s")
        ax.set_yticks(np.arange(0, TOP_HZ + 1, 1000))
        for a, b, kk in o["accepted"]:
            if b / 100 > t0 and a / 100 < t1:
                st.axvspan(max(t0, a / 100), min(t1, b / 100), ymin=0.0, ymax=0.3, color="tab:green")
        for a, nn in o["speech"]:
            if (a + nn) / 100 > t0 and a / 100 < t1:
                st.axvspan(a / 100, (a + nn) / 100, ymin=0.35, ymax=0.65, color="tab:blue")
        for a, nn, *_ in o["calls"]:
            if (a + nn) / 100 > t0 and a / 100 < t1:
                st.axvspan(a / 100, (a + nn) / 100, ymin=0.7, ymax=1.0, color="tab:orange")
        st.set_yticks([0.15, 0.5, 0.85], ["accepted", "speech", "calls"])
        st.set_ylim(0, 1)
        st.set_xlim(t0, t0 + PANEL_S)
        st.set_xlabel("seconds from the start of the track")
        st.set_xticks(np.arange(t0, t0 + PANEL_S + 0.1, 5))
        fig.tight_layout()
        name = f"panel_{k + 1:02d}_{int(t0):03d}-{int(t1):03d}s.png"
        fig.savefig(os.path.join(out, name), dpi=90)
        plt.close(fig)
        lines.append(name)
    with open(os.path.join(out, "index.txt"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")
    print(out)


if __name__ == "__main__":
    main()
