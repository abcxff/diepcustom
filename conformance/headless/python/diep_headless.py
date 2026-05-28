import ctypes
import json
from pathlib import Path

try:
    import numpy as np
except ImportError:  # optional fast path dependency
    np = None

ROOT = Path(__file__).resolve().parents[3]

DIEP_OK = 0
DIEP_ERROR_NULL = -1
DIEP_ERROR_INVALID_ARGUMENT = -2
DIEP_ERROR_EXCEPTION = -3
DIEP_ERROR_INVALID_AGENT = -4
DIEP_LAYOUT_CHANNEL_LAST = 1
DIEP_ACTION_LAYOUT_V1_STRUCT = 1
ABI_VERSION = 3


def _library_path():
    candidates = [
        ROOT / 'build/cpp/libdiepcustom_headless_c.dylib',
        ROOT / 'build/cpp/libdiepcustom_headless_c.so',
        ROOT / 'build/cpp/Debug/diepcustom_headless_c.dll',
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError('diepcustom_headless_c shared library not found; run npm run test:cpp first')


class DiepConfig(ctypes.Structure):
    _fields_ = [('seed', ctypes.c_uint64), ('agents', ctypes.c_int), ('max_ticks', ctypes.c_int), ('scenario', ctypes.c_char_p)]


class DiepAction(ctypes.Structure):
    _fields_ = [
        ('agent_id', ctypes.c_int), ('move_x', ctypes.c_double), ('move_y', ctypes.c_double),
        ('aim_x', ctypes.c_double), ('aim_y', ctypes.c_double), ('fire', ctypes.c_int),
        ('alt_fire', ctypes.c_int), ('upgrade_choice', ctypes.c_int),
    ]


class DiepStepResult(ctypes.Structure):
    _fields_ = [('tick', ctypes.c_int), ('done', ctypes.c_int), ('reward_count', ctypes.c_int), ('rewards', ctypes.POINTER(ctypes.c_double))]


class DiepObservationShape(ctypes.Structure):
    _fields_ = [('rows', ctypes.c_int), ('cols', ctypes.c_int), ('channels', ctypes.c_int), ('layout', ctypes.c_int)]


class DiepActionShape(ctypes.Structure):
    _fields_ = [
        ('fields', ctypes.c_int), ('layout', ctypes.c_int), ('continuous_start', ctypes.c_int),
        ('continuous_count', ctypes.c_int), ('discrete_start', ctypes.c_int), ('discrete_count', ctypes.c_int),
    ]


_LIB = None


def load_library():
    global _LIB
    if _LIB is None:
        lib = ctypes.CDLL(str(_library_path()))
        lib.diep_abi_version.argtypes = []
        lib.diep_abi_version.restype = ctypes.c_int
        lib.diep_last_error.argtypes = [ctypes.c_void_p]
        lib.diep_last_error.restype = ctypes.c_int
        lib.diep_get_observation_shape.argtypes = []
        lib.diep_get_observation_shape.restype = DiepObservationShape
        lib.diep_get_action_shape.argtypes = []
        lib.diep_get_action_shape.restype = DiepActionShape
        lib.diep_agent_ids.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.c_int]
        lib.diep_agent_ids.restype = ctypes.c_int
        lib.diep_alive_mask.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.c_int]
        lib.diep_alive_mask.restype = ctypes.c_int
        lib.diep_create.argtypes = [ctypes.POINTER(DiepConfig)]
        lib.diep_create.restype = ctypes.c_void_p
        lib.diep_destroy.argtypes = [ctypes.c_void_p]
        lib.diep_destroy.restype = None
        lib.diep_reset.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
        lib.diep_reset.restype = None
        lib.diep_step.argtypes = [ctypes.c_void_p, ctypes.POINTER(DiepAction), ctypes.c_int]
        lib.diep_step.restype = DiepStepResult
        lib.diep_step_many.argtypes = [ctypes.c_void_p, ctypes.POINTER(DiepAction), ctypes.c_int, ctypes.c_int]
        lib.diep_step_many.restype = DiepStepResult
        lib.diep_snapshot_json.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
        lib.diep_snapshot_json.restype = ctypes.c_int
        lib.diep_observation.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_float), ctypes.c_int]
        lib.diep_observation.restype = ctypes.c_int
        lib.diep_observations.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_int]
        lib.diep_observations.restype = ctypes.c_int
        _LIB = lib
    return _LIB


def abi_version():
    return load_library().diep_abi_version()


def observation_shape():
    shape = load_library().diep_get_observation_shape()
    return {'rows': shape.rows, 'cols': shape.cols, 'channels': shape.channels, 'layout': shape.layout}


def action_shape():
    shape = load_library().diep_get_action_shape()
    return {
        'fields': shape.fields,
        'layout': shape.layout,
        'continuous_start': shape.continuous_start,
        'continuous_count': shape.continuous_count,
        'discrete_start': shape.discrete_start,
        'discrete_count': shape.discrete_count,
    }


def noop_action(agent_id):
    return DiepAction(agent_id, 0.0, 0.0, 1.0, 0.0, 0, 0, 0)


class HeadlessSim:
    def __init__(self, seed=1, agents=1, max_ticks=1000, scenario='basic-ffa'):
        self.lib = load_library()
        self.agents = agents
        self.max_ticks = max_ticks
        self.scenario = scenario
        config = DiepConfig(seed, agents, max_ticks, scenario.encode())
        self.handle = self.lib.diep_create(ctypes.byref(config))
        if not self.handle:
            raise RuntimeError('diep_create failed')
        self.possible_agent_count = agents

    def close(self):
        if getattr(self, 'handle', None):
            self.lib.diep_destroy(self.handle)
            self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def _require_open(self):
        if not getattr(self, 'handle', None):
            raise RuntimeError('HeadlessSim is closed')

    def last_error(self):
        handle = getattr(self, 'handle', None)
        return self.lib.diep_last_error(handle) if handle else DIEP_ERROR_NULL

    def reset(self, seed):
        self._require_open()
        self.lib.diep_reset(self.handle, seed)

    def agent_ids(self):
        self._require_open()
        needed = self.lib.diep_agent_ids(self.handle, None, 0)
        if needed < 0:
            raise RuntimeError(f'diep_agent_ids failed: {needed}')
        arr = (ctypes.c_int * needed)()
        written = self.lib.diep_agent_ids(self.handle, arr, needed)
        if written != needed:
            raise RuntimeError(f'diep_agent_ids wrote {written}, expected {needed}')
        return [arr[i] for i in range(written)]

    def alive_mask(self):
        self._require_open()
        needed = self.lib.diep_alive_mask(self.handle, None, 0)
        if needed < 0:
            raise RuntimeError(f'diep_alive_mask failed: {needed}')
        arr = (ctypes.c_int * needed)()
        written = self.lib.diep_alive_mask(self.handle, arr, needed)
        if written != needed:
            raise RuntimeError(f'diep_alive_mask wrote {written}, expected {needed}')
        return [int(arr[i]) for i in range(written)]

    def step(self, actions=()):
        self._require_open()
        arr, count = self._action_array(actions)
        result = self.lib.diep_step(self.handle, arr, count)
        return self._step_result(result)

    def step_many(self, actions=(), ticks=1):
        self._require_open()
        if ticks < 0:
            raise ValueError('ticks must be non-negative')
        arr, count = self._action_array(actions)
        result = self.lib.diep_step_many(self.handle, arr, count, ticks)
        return self._step_result(result)

    def _action_array(self, actions):
        action_list = list(actions)
        return ((DiepAction * len(action_list))(*action_list) if action_list else None, len(action_list))

    def _step_result(self, result):
        rewards = [result.rewards[i] for i in range(result.reward_count)] if result.rewards else []
        return {'tick': result.tick, 'done': bool(result.done), 'rewards': rewards}

    def snapshot(self):
        self._require_open()
        needed = self.lib.diep_snapshot_json(self.handle, None, 0)
        if needed < 0:
            raise RuntimeError(f'diep_snapshot_json failed: {needed}')
        buf = ctypes.create_string_buffer(needed)
        written = self.lib.diep_snapshot_json(self.handle, buf, needed)
        if written < 0:
            raise RuntimeError(f'diep_snapshot_json failed: {written}')
        return json.loads(buf.value.decode())

    def observation(self, agent_id):
        self._require_open()
        needed = self.lib.diep_observation(self.handle, agent_id, None, 0)
        if needed < 0:
            raise ValueError(f'invalid agent id: {agent_id}')
        arr = (ctypes.c_float * needed)()
        written = self.lib.diep_observation(self.handle, agent_id, arr, needed)
        if written != needed:
            raise RuntimeError(f'diep_observation wrote {written}, expected {needed}')
        return list(arr)

    def observations(self):
        self._require_open()
        needed = self.lib.diep_observations(self.handle, None, 0)
        if needed < 0:
            raise RuntimeError(f'diep_observations failed: {needed}')
        arr = (ctypes.c_float * needed)()
        written = self.lib.diep_observations(self.handle, arr, needed)
        if written != needed:
            raise RuntimeError(f'diep_observations wrote {written}, expected {needed}')
        return list(arr)

    def observations_array(self, out=None):
        if np is None:
            raise RuntimeError('NumPy is required for observations_array')
        self._require_open()
        shape = observation_shape()
        expected_shape = (self.possible_agent_count, shape['rows'], shape['cols'], shape['channels'])
        if out is None:
            out = np.empty(expected_shape, dtype=np.float32)
        if out.shape != expected_shape or out.dtype != np.float32:
            raise ValueError(f'out must have shape {expected_shape} and dtype float32')
        ptr = out.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
        written = self.lib.diep_observations(self.handle, ptr, int(out.size))
        if written != int(out.size):
            raise RuntimeError(f'diep_observations wrote {written}, expected {out.size}')
        return out

    def step_many_observations_array(self, actions=(), ticks=1, out=None):
        result = self.step_many(actions, ticks)
        observations = self.observations_array(out=out)
        return result, observations

    def observation_shape(self):
        return observation_shape()

    def action_shape(self):
        return action_shape()
