"""Gymnasium/PettingZoo space helpers with tiny fallbacks for smoke tests."""

try:
    import numpy as np
except ImportError:  # pragma: no cover - exercised only in minimal Python installs
    np = None

try:
    from gymnasium import spaces
except ImportError:  # optional dependency; local smoke tests use fallbacks
    spaces = None

from .headless import AGENT_STATE_FIELDS

SELF_OBSERVATION_FIELDS = ('health_norm', 'health', 'max_health', 'score', 'alive')
PROGRESSION_SCALAR_FIELDS = ('level', 'current_tank', 'stats_available', 'can_stat_upgrade', 'can_tank_upgrade')
STAT_UPGRADE_COUNT = 8
TANK_UPGRADE_SLOT_COUNT = 6


class FallbackBox:
    def __init__(self, low, high, shape, dtype=float):
        self.low = low
        self.high = high
        self.shape = tuple(shape)
        self.dtype = dtype

    def sample(self):
        if np is not None:
            return np.zeros(self.shape, dtype=self.dtype)
        if len(self.shape) == 0:
            return 0.0
        size = 1
        for value in self.shape:
            size *= value
        return [0.0] * size


class FallbackMultiBinary:
    def __init__(self, n):
        self.n = int(n)
        self.shape = (self.n,)

    def sample(self):
        if np is not None:
            return np.zeros(self.shape, dtype=np.int8)
        return [0] * self.n


class FallbackDict(dict):
    def sample(self):
        return {key: space.sample() for key, space in self.items()}


def _float_dtype():
    return np.float32 if np is not None else float


def _dict_space(mapping):
    if spaces is not None:
        return spaces.Dict(mapping)
    return FallbackDict(mapping)


def _scalar_space(low=-float('inf'), high=float('inf')):
    if spaces is not None:
        return spaces.Box(low=low, high=high, shape=(), dtype=_float_dtype())
    return FallbackBox(low=low, high=high, shape=(), dtype=float)


def make_observation_space(shape):
    obs_shape = (shape['rows'], shape['cols'], shape['channels'])
    if spaces is not None:
        return spaces.Box(low=0.0, high=1.0, shape=obs_shape, dtype=_float_dtype())
    return FallbackBox(low=0.0, high=1.0, shape=obs_shape, dtype=float)


def make_agent_state_space():
    state_shape = (len(AGENT_STATE_FIELDS),)
    if spaces is not None:
        return spaces.Box(low=-float('inf'), high=float('inf'), shape=state_shape, dtype=_float_dtype())
    return FallbackBox(low=-float('inf'), high=float('inf'), shape=state_shape, dtype=float)


def make_self_observation_space():
    self_shape = (len(SELF_OBSERVATION_FIELDS),)
    if spaces is not None:
        return spaces.Box(low=-float('inf'), high=float('inf'), shape=self_shape, dtype=_float_dtype())
    return FallbackBox(low=-float('inf'), high=float('inf'), shape=self_shape, dtype=float)


def make_progression_observation_space():
    if spaces is not None:
        stat_levels = spaces.Box(low=0.0, high=float('inf'), shape=(STAT_UPGRADE_COUNT,), dtype=_float_dtype())
        legal_stat_upgrades = spaces.Box(low=0.0, high=1.0, shape=(STAT_UPGRADE_COUNT,), dtype=_float_dtype())
        legal_tank_upgrades = spaces.Box(low=0.0, high=1.0, shape=(TANK_UPGRADE_SLOT_COUNT,), dtype=_float_dtype())
    else:
        stat_levels = FallbackBox(low=0.0, high=float('inf'), shape=(STAT_UPGRADE_COUNT,), dtype=float)
        legal_stat_upgrades = FallbackBox(low=0.0, high=1.0, shape=(STAT_UPGRADE_COUNT,), dtype=float)
        legal_tank_upgrades = FallbackBox(low=0.0, high=1.0, shape=(TANK_UPGRADE_SLOT_COUNT,), dtype=float)
    return _dict_space({
        'level': _scalar_space(0.0, float('inf')),
        'current_tank': _scalar_space(0.0, float('inf')),
        'stats_available': _scalar_space(0.0, float('inf')),
        'can_stat_upgrade': _scalar_space(0.0, 1.0),
        'can_tank_upgrade': _scalar_space(0.0, 1.0),
        'stat_levels': stat_levels,
        'legal_stat_upgrades': legal_stat_upgrades,
        'legal_tank_upgrades': legal_tank_upgrades,
    })


def make_grid_hud_observation_space(shape):
    return _dict_space({
        'grid': make_observation_space(shape),
        'self': make_self_observation_space(),
        'progression': make_progression_observation_space(),
    })


def make_action_space():
    if spaces is not None:
        dtype = _float_dtype()
        return spaces.Dict({
            'move': spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=dtype),
            'aim': spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=dtype),
            'buttons': spaces.MultiBinary(2),
            'stat_upgrade_choice': spaces.Box(low=-1.0, high=float(STAT_UPGRADE_COUNT - 1), shape=(), dtype=dtype),
            'tank_upgrade_choice': spaces.Box(low=-1.0, high=float(TANK_UPGRADE_SLOT_COUNT - 1), shape=(), dtype=dtype),
        })
    return FallbackDict({
        'move': FallbackBox(-1.0, 1.0, (2,), float),
        'aim': FallbackBox(-1.0, 1.0, (2,), float),
        'buttons': FallbackMultiBinary(2),
        'stat_upgrade_choice': FallbackBox(-1.0, float(STAT_UPGRADE_COUNT - 1), (), float),
        'tank_upgrade_choice': FallbackBox(-1.0, float(TANK_UPGRADE_SLOT_COUNT - 1), (), float),
    })


__all__ = [
    'np', 'spaces', 'SELF_OBSERVATION_FIELDS', 'PROGRESSION_SCALAR_FIELDS',
    'make_observation_space', 'make_agent_state_space', 'make_self_observation_space',
    'make_progression_observation_space', 'make_grid_hud_observation_space', 'make_action_space',
]
