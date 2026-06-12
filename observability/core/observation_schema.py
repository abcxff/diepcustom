from __future__ import annotations

from RL_training.observations.combat import COMBAT_GRID_CHANNELS, COMBAT_PREV_ACTION_FIELDS, COMBAT_SELF_FIELDS

VIDEO_GRID_CHANNELS = (
    'enemy_presence',
    'enemy_threat',
    'projectile_presence',
    'farmable_presence',
    'farmable_value',
    'wall',
)


def channel_index(name: str) -> int:
    return COMBAT_GRID_CHANNELS.index(name)


__all__ = ['COMBAT_GRID_CHANNELS', 'COMBAT_PREV_ACTION_FIELDS', 'COMBAT_SELF_FIELDS', 'VIDEO_GRID_CHANNELS', 'channel_index']
