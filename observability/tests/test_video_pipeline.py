from __future__ import annotations

import numpy as np

from observability.core.observation_schema import COMBAT_GRID_CHANNELS
from observability.video.render_grid_obs import render_grid_composite
from observability.video.video_writer import FfmpegVideoWriter


def test_render_grid_composite_shape():
    grid = np.zeros((len(COMBAT_GRID_CHANNELS), 21, 21), dtype=np.float32)
    grid[0, :, :] = 1.0
    grid[3, 10, 10] = 1.0
    frame = render_grid_composite(grid, cell_scale=4)
    assert frame.shape == (84, 84, 3)
    assert frame.dtype == np.uint8
    assert frame[..., 0].max() > 0
    assert frame[..., 2].max() > 0


def test_video_writer_smoke(tmp_path):
    output = tmp_path / 'eval.mp4'
    frame = np.zeros((64, 64, 3), dtype=np.uint8)
    frame[:, :, 1] = 255
    with FfmpegVideoWriter(output, width=64, height=64, fps=10) as writer:
        for _ in range(4):
            assert writer.write(frame) is True
    assert output.exists()
    assert output.stat().st_size > 0


def test_video_writer_drops_frames_when_queue_is_full(tmp_path):
    output = tmp_path / 'drops.mp4'
    frame = np.zeros((32, 32, 3), dtype=np.uint8)
    with FfmpegVideoWriter(output, width=32, height=32, fps=10, max_queue=1, write_delay_seconds=0.05) as writer:
        results = [writer.write(frame) for _ in range(10)]
        stats = writer.close()
    assert any(result is False for result in results) or stats.dropped_frames > 0
    assert output.exists()
