from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import queue
import subprocess
import threading
import time
from typing import Any

import numpy as np


@dataclass
class VideoWriterStats:
    written_frames: int = 0
    dropped_frames: int = 0


class FfmpegVideoWriter:
    def __init__(
        self,
        path: str | Path,
        *,
        width: int,
        height: int,
        fps: int = 20,
        max_queue: int = 8,
        write_delay_seconds: float = 0.0,
    ):
        self.path = Path(path)
        self.width = int(width)
        self.height = int(height)
        self.fps = int(fps)
        self.max_queue = int(max_queue)
        self.write_delay_seconds = float(write_delay_seconds)
        self.stats = VideoWriterStats()
        self._queue: queue.Queue[np.ndarray | None] = queue.Queue(maxsize=max(1, self.max_queue))
        self._proc: subprocess.Popen[bytes] | None = None
        self._worker: threading.Thread | None = None

    def __enter__(self) -> 'FfmpegVideoWriter':
        self.open()
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()

    def open(self) -> None:
        if self._proc is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            'ffmpeg', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{self.width}x{self.height}', '-r', str(self.fps),
            '-i', '-', '-an', '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', str(self.path),
        ]
        self._proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._worker = threading.Thread(target=self._drain_queue, daemon=True)
        self._worker.start()

    def write(self, frame: np.ndarray) -> bool:
        if self._proc is None:
            self.open()
        array = np.asarray(frame, dtype=np.uint8)
        if array.shape != (self.height, self.width, 3):
            raise ValueError(f'frame must have shape {(self.height, self.width, 3)}')
        try:
            self._queue.put_nowait(array.copy())
            return True
        except queue.Full:
            self.stats.dropped_frames += 1
            return False

    def close(self) -> VideoWriterStats:
        if self._proc is None:
            return self.stats
        self._queue.put(None)
        if self._worker is not None:
            self._worker.join(timeout=10.0)
        if self._proc.stdin is not None:
            self._proc.stdin.close()
        self._proc.wait(timeout=10.0)
        self._proc = None
        self._worker = None
        return self.stats

    def _drain_queue(self) -> None:
        assert self._proc is not None and self._proc.stdin is not None
        while True:
            frame = self._queue.get()
            if frame is None:
                break
            if self.write_delay_seconds > 0:
                time.sleep(self.write_delay_seconds)
            self._proc.stdin.write(frame.tobytes())
            self.stats.written_frames += 1


__all__ = ['FfmpegVideoWriter', 'VideoWriterStats']
