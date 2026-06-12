from __future__ import annotations

from collections.abc import Sequence
import math
from typing import Any

import numpy as np

_FONT = {
    ' ': ['000', '000', '000', '000', '000'],
    ':': ['0', '1', '0', '1', '0'],
    '.': ['0', '0', '0', '0', '1'],
    '-': ['000', '000', '111', '000', '000'],
    '/': ['001', '001', '010', '100', '100'],
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '001', '001', '001'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'],
    'A': ['111', '101', '111', '101', '101'],
    'F': ['111', '100', '110', '100', '100'],
    'H': ['101', '101', '111', '101', '101'],
    'L': ['100', '100', '100', '100', '111'],
    'M': ['101', '111', '111', '101', '101'],
    'P': ['111', '101', '111', '100', '100'],
    'R': ['110', '101', '110', '101', '101'],
    'S': ['111', '100', '111', '001', '111'],
    'T': ['111', '010', '010', '010', '010'],
    'U': ['101', '101', '101', '101', '111'],
    'V': ['101', '101', '101', '101', '010'],
}


def _draw_pixel(frame: np.ndarray, x: int, y: int, color: Sequence[int]) -> None:
    if 0 <= y < frame.shape[0] and 0 <= x < frame.shape[1]:
        frame[y, x] = color


def draw_text(frame: np.ndarray, x: int, y: int, text: str, *, color: Sequence[int] = (255, 255, 255), scale: int = 2) -> None:
    cursor = x
    for char in text.upper():
        glyph = _FONT.get(char, _FONT[' '])
        for row_index, row in enumerate(glyph):
            for col_index, bit in enumerate(row):
                if bit != '1':
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        _draw_pixel(frame, cursor + col_index * scale + dx, y + row_index * scale + dy, color)
        cursor += (len(glyph[0]) + 1) * scale


def _draw_line(frame: np.ndarray, start: tuple[int, int], end: tuple[int, int], color: Sequence[int]) -> None:
    x0, y0 = start
    x1, y1 = end
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        _draw_pixel(frame, x0, y0, color)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def _snapshot_agent(snapshot: dict[str, Any] | None, agent_id: int) -> dict[str, Any] | None:
    if not snapshot:
        return None
    for entity in snapshot.get('entities', ()):
        if entity.get('kind') == 'agent' and entity.get('id') == agent_id:
            return entity
    return None


def _agent_health(agent: dict[str, Any] | None) -> tuple[float, float]:
    health = (agent or {}).get('health') or {}
    return float(health.get('health', 0.0)), float(health.get('maxHealth', 0.0))


def overlay_frame(
    frame: np.ndarray,
    *,
    snapshot: dict[str, Any] | None,
    agent_id: int,
    prev_action_obs: Sequence[float] | None,
    step_reward: float,
    total_reward: float,
    stats: Any,
    trail: Sequence[tuple[int, int]],
) -> np.ndarray:
    out = np.asarray(frame, dtype=np.uint8).copy()
    agent = _snapshot_agent(snapshot, agent_id)
    if trail:
        for point in trail:
            _draw_pixel(out, point[0], point[1], (128, 255, 255))
        if len(trail) >= 2:
            for start, end in zip(trail[:-1], trail[1:]):
                _draw_line(out, start, end, (80, 220, 255))
    center = (out.shape[1] // 2, out.shape[0] // 2)
    if prev_action_obs is not None and len(prev_action_obs) >= 4:
        aim_x = float(prev_action_obs[2])
        aim_y = float(prev_action_obs[3])
        aim_mag = max(1.0, math.hypot(aim_x, aim_y))
        aim_end = (
            int(center[0] + (aim_x / aim_mag) * min(32, out.shape[1] // 4)),
            int(center[1] + (aim_y / aim_mag) * min(32, out.shape[0] // 4)),
        )
        _draw_line(out, center, aim_end, (255, 255, 0))
        if len(prev_action_obs) >= 5 and float(prev_action_obs[4]) > 0.5:
            _draw_pixel(out, aim_end[0], aim_end[1], (255, 80, 80))
    tick = int((snapshot or {}).get('tick', 0))
    health, max_health = _agent_health(agent)
    lines = [
        f'T:{tick}',
        f'HP:{health:.0f}/{max_health:.0f}',
        f'LV:{getattr(stats, "level_reached", 0)}',
        f'R:{step_reward:.2f}',
        f'SUM:{total_reward:.2f}',
        f'F:{getattr(stats, "score_from_farming", 0):.0f}',
        f'P:{getattr(stats, "score_from_pvp", 0):.0f}',
        f'H:{getattr(stats, "hit_rate", 0):.2f}',
    ]
    for index, line in enumerate(lines):
        draw_text(out, 6, 6 + index * 12, line, color=(255, 255, 255), scale=2)
    return out


__all__ = ['draw_text', 'overlay_frame']
