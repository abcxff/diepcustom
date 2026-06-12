"""Combat observation helpers for RL_training."""

from .combat import (
    COMBAT_GRID_CHANNELS,
    COMBAT_GRID_SHAPE,
    COMBAT_PREV_ACTION_FIELDS,
    COMBAT_SELF_FIELDS,
    COMBAT_TANK_TYPE_COUNT,
    COMBAT_UNKNOWN_TANK_TYPE,
    CombatObservationBuilder,
    build_combat_observation,
    build_upgrade_observation_package,
)
from .spaces import make_combat_observation_space

__all__ = [
    'COMBAT_GRID_CHANNELS',
    'COMBAT_GRID_SHAPE',
    'COMBAT_PREV_ACTION_FIELDS',
    'COMBAT_SELF_FIELDS',
    'COMBAT_TANK_TYPE_COUNT',
    'COMBAT_UNKNOWN_TANK_TYPE',
    'CombatObservationBuilder',
    'build_combat_observation',
    'build_upgrade_observation_package',
    'make_combat_observation_space',
]
