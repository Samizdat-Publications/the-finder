"""The image tape: WAV header parsing and windowed channel reads.

The tape is `sources/image-tape/384kHzStereo.wav` (docs/research/images-and-audio.md section 2):
1,455,685,720 bytes, 32-bit float stereo, header rate 384,000 Hz, 181,960,704 samples per channel.
It is never loaded whole: every read is a window of at most a few million samples, taken through a
numpy memmap on the data chunk.
"""
from __future__ import annotations

import os
import struct
from dataclasses import dataclass

import numpy as np

# Header sample rate in Hz. Source: images-and-audio.md section 2 (the 384 kHz label restores the
# cover's timing; keep it).
HEADER_RATE = 384_000
# Samples per channel in the complete tape. Source: images-and-audio.md section 2.
EXPECTED_FRAMES = 181_960_704


@dataclass
class TapeInfo:
    path: str
    sample_rate: int
    channels: int
    bits: int
    fmt_tag: int  # 3 = IEEE float
    data_offset: int  # byte offset of the first sample
    n_frames: int  # samples per channel available in the file
    complete: bool


def parse_header(path: str) -> TapeInfo:
    """Walk the RIFF chunks (fmt, PEAK, data, ...) and return where the samples are."""
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(4096)
    if head[0:4] != b"RIFF" or head[8:12] != b"WAVE":
        raise ValueError(f"{path}: not a RIFF/WAVE file")
    pos = 12
    fmt = None
    while pos + 8 <= len(head):
        cid = head[pos:pos + 4]
        clen = struct.unpack("<I", head[pos + 4:pos + 8])[0]
        body = pos + 8
        if cid == b"fmt ":
            tag, ch, rate, _brate, _align, bits = struct.unpack("<HHIIHH", head[body:body + 16])
            if tag == 0xFFFE and clen >= 40:  # WAVE_FORMAT_EXTENSIBLE: subformat GUID first 2 bytes
                tag = struct.unpack("<H", head[body + 24:body + 26])[0]
            fmt = (tag, ch, rate, bits)
        elif cid == b"data":
            if fmt is None:
                raise ValueError("data chunk before fmt chunk")
            tag, ch, rate, bits = fmt
            frame_bytes = ch * bits // 8
            avail = (size - body) // frame_bytes
            declared = clen // frame_bytes
            n = min(avail, declared) if declared > 0 else avail
            return TapeInfo(path, rate, ch, bits, tag, body, int(n), bool(avail >= declared > 0))
        pos = body + clen + (clen & 1)
    raise ValueError(f"{path}: no data chunk in the first 4 KB")


class Tape:
    """Windowed access to one stereo float32 tape. Channel 0 = left, 1 = right."""

    def __init__(self, path: str):
        self.info = parse_header(path)
        i = self.info
        if i.fmt_tag != 3 or i.bits != 32 or i.channels != 2:
            raise ValueError(f"expected 32-bit float stereo, got tag {i.fmt_tag}, {i.bits} bit, {i.channels} ch")
        self.rate = i.sample_rate
        self.n = i.n_frames
        self._mm = np.memmap(path, dtype="<f4", mode="r", offset=i.data_offset, shape=(self.n, 2))

    def read(self, channel: int, start: int, length: int) -> np.ndarray:
        """Samples [start, start+length) of one channel as float64; zero-padded outside the tape."""
        out = np.zeros(length, dtype=np.float64)
        a = max(start, 0)
        b = min(start + length, self.n)
        if b > a:
            out[a - start:b - start] = self._mm[a:b, channel]
        return out

    def global_peak(self, chunk: int = 8_000_000) -> float:
        """Largest |sample| over both channels, scanned in chunks (never the whole file at once)."""
        peak = 0.0
        for s in range(0, self.n, chunk):
            blk = np.asarray(self._mm[s:min(s + chunk, self.n)])
            peak = max(peak, float(np.max(np.abs(blk))))
        return peak


def default_tape_path(root: str) -> str:
    """The verified tape (tools/sources.json records its size, MD5 and SHA-256)."""
    p = os.path.join(root, "sources", "image-tape", "384kHzStereo.wav")
    if not os.path.exists(p):
        raise FileNotFoundError(p)
    return p


def project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
