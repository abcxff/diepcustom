"""Gymnasium/PettingZoo spaces for combat observations."""

from __future__ import annotations

from ..spaces import FallbackBox, _dict_space, _float_dtype, np, spaces
from .combat import (
    COMBAT_GRID_HIGH,
    COMBAT_GRID_LOW,
    COMBAT_GRID_SHAPE,
    COMBAT_PREV_ACTION_FIELDS,
    COMBAT_PREV_ACTION_HIGH,
    COMBAT_PREV_ACTION_LOW,
    COMBAT_SELF_FIELDS,
    COMBAT_SELF_HIGH,
    COMBAT_SELF_LOW,
    COMBAT_TANK_TYPE_COUNT,
    COMBAT_UNKNOWN_TANK_TYPE,
)


def make_combat_observation_space():
    if spaces is not None:
        return spaces.Dict({
            'grid_obs': spaces.Box(low=COMBAT_GRID_LOW, high=COMBAT_GRID_HIGH, shape=COMBAT_GRID_SHAPE, dtype=_float_dtype()),
            'self_obs': spaces.Box(low=COMBAT_SELF_LOW, high=COMBAT_SELF_HIGH, shape=(len(COMBAT_SELF_FIELDS),), dtype=_float_dtype()),
            'prev_action_obs': spaces.Box(
                low=COMBAT_PREV_ACTION_LOW,
                high=COMBAT_PREV_ACTION_HIGH,
                shape=(len(COMBAT_PREV_ACTION_FIELDS),),
                dtype=_float_dtype(),
            ),
            'tank_type_obs': spaces.Discrete(COMBAT_TANK_TYPE_COUNT),
        })
    return _dict_space({
        'grid_obs': FallbackBox(low=COMBAT_GRID_LOW, high=COMBAT_GRID_HIGH, shape=COMBAT_GRID_SHAPE, dtype=float),
        'self_obs': FallbackBox(low=COMBAT_SELF_LOW, high=COMBAT_SELF_HIGH, shape=(len(COMBAT_SELF_FIELDS),), dtype=float),
        'prev_action_obs': FallbackBox(
            low=COMBAT_PREV_ACTION_LOW,
            high=COMBAT_PREV_ACTION_HIGH,
            shape=(len(COMBAT_PREV_ACTION_FIELDS),),
            dtype=float,
        ),
        'tank_type_obs': FallbackBox(low=0, high=COMBAT_UNKNOWN_TANK_TYPE, shape=(), dtype=int),
    })


__all__ = ['make_combat_observation_space']
