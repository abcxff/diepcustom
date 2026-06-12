"""Gymnasium/PettingZoo combat action helpers with tiny fallbacks for smoke tests."""

try:
    import numpy as np
except ImportError:  # pragma: no cover - exercised only in minimal Python installs
    np = None

try:
    from gymnasium import spaces
except ImportError:  # optional dependency; local smoke tests use fallbacks
    spaces = None

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
    'np', 'spaces', 'FallbackBox', 'FallbackMultiBinary', 'FallbackDict',
    '_float_dtype', '_dict_space', 'make_action_space',
]
