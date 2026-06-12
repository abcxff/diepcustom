from __future__ import annotations

import numpy as np

from observability.core.observation_schema import COMBAT_GRID_CHANNELS, channel_index


def _normalize(channel: np.ndarray) -> np.ndarray:
    array = np.asarray(channel, dtype=np.float32)
    if array.size == 0:
        return array
    max_value = float(np.max(np.abs(array)))
    if max_value <= 1e-6:
        return np.zeros_like(array)
    return np.clip(array / max_value, 0.0, 1.0)


def _resize_nearest(image: np.ndarray, scale: int) -> np.ndarray:
    if scale <= 1:
        return image
    return np.repeat(np.repeat(image, scale, axis=0), scale, axis=1)


def render_grid_composite(grid_obs: np.ndarray, *, cell_scale: int = 8) -> np.ndarray:
    grid = np.asarray(grid_obs, dtype=np.float32)
    if grid.ndim != 3 or grid.shape[0] != len(COMBAT_GRID_CHANNELS):
        raise ValueError(f'grid_obs must have shape ({len(COMBAT_GRID_CHANNELS)}, rows, cols)')
    wall = _normalize(grid[channel_index('wall')])
    farm_presence = _normalize(grid[channel_index('farmable_presence')])
    farm_value = _normalize(grid[channel_index('farmable_value')])
    enemy_presence = _normalize(grid[channel_index('enemy_presence')])
    enemy_threat = _normalize(grid[channel_index('enemy_threat')])
    projectile_presence = _normalize(grid[channel_index('projectile_presence')])

    rows, cols = grid.shape[1:]
    frame = np.zeros((rows, cols, 3), dtype=np.float32)
    frame[..., 2] += wall * 0.45
    frame[..., 1] += farm_presence * 0.35 + farm_value * 0.45
    frame[..., 0] += enemy_presence * 0.55 + enemy_threat * 0.45
    frame[..., 1] += projectile_presence * 0.55
    frame[..., 0] += projectile_presence * 0.35
    frame = np.clip(frame, 0.0, 1.0)
    rgb = (frame * 255.0).astype(np.uint8)
    return _resize_nearest(rgb, cell_scale)


__all__ = ['render_grid_composite']
