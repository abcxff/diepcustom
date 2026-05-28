from collections import OrderedDict

try:
    import numpy as np
except ImportError:  # pragma: no cover - exercised only in minimal Python installs
    np = None

try:
    from gymnasium import spaces
except ImportError:  # optional dependency; the local smoke tests use the fallback spaces
    spaces = None

try:
    from pettingzoo import ParallelEnv
except ImportError:  # optional dependency; this class still follows the ParallelEnv contract
    class ParallelEnv:  # type: ignore
        metadata = {}

from .diep_headless import HeadlessSim, DiepAction, noop_action, action_shape, observation_shape


class _FallbackBox:
    def __init__(self, low, high, shape, dtype=float):
        self.low = low
        self.high = high
        self.shape = tuple(shape)
        self.dtype = dtype

    def sample(self):
        if np is not None:
            return np.zeros(self.shape, dtype=self.dtype)
        size = 1
        for value in self.shape:
            size *= value
        return [0.0] * size


class _FallbackMultiBinary:
    def __init__(self, n):
        self.n = int(n)
        self.shape = (self.n,)

    def sample(self):
        if np is not None:
            return np.zeros(self.shape, dtype=np.int8)
        return [0] * self.n


class _FallbackDict(dict):
    def sample(self):
        return {key: space.sample() for key, space in self.items()}


def _agent_name(agent_index):
    return f'agent_{agent_index}'


def _agent_index(agent_name):
    return int(agent_name.split('_', 1)[1])


def _make_observation_space(shape):
    obs_shape = (shape['rows'], shape['cols'], shape['channels'])
    if spaces is not None:
        dtype = np.float32 if np is not None else float
        return spaces.Box(low=0.0, high=1.0, shape=obs_shape, dtype=dtype)
    return _FallbackBox(low=0.0, high=1.0, shape=obs_shape, dtype=float)


def _make_action_space():
    if spaces is not None:
        dtype = np.float32 if np is not None else float
        return spaces.Dict({
            'move': spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=dtype),
            'aim': spaces.Box(low=-1.0, high=1.0, shape=(2,), dtype=dtype),
            'buttons': spaces.MultiBinary(2),
        })
    return _FallbackDict({'move': _FallbackBox(-1.0, 1.0, (2,), float), 'aim': _FallbackBox(-1.0, 1.0, (2,), float), 'buttons': _FallbackMultiBinary(2)})


def _pair(values, default):
    if values is None:
        return default
    try:
        return float(values[0]), float(values[1])
    except (TypeError, IndexError, ValueError):
        return default


def action_to_diep(agent_id, action):
    """Convert a trainer action into the frozen C ABI action struct.

    Accepted forms:
    - dict: {'move': [x, y], 'aim': [x, y], 'buttons': [fire, alt_fire]}
    - flat sequence: [move_x, move_y, aim_x, aim_y, fire, alt_fire]
    Missing or malformed values become no-op components. No C++ AI/autopilot action is injected.
    """
    if action is None:
        return noop_action(agent_id)
    if isinstance(action, dict):
        move_x, move_y = _pair(action.get('move'), (0.0, 0.0))
        aim_x, aim_y = _pair(action.get('aim'), (1.0, 0.0))
        buttons = action.get('buttons', (0, 0))
        if buttons is None:
            buttons = (0, 0)
        fire = int(bool(buttons[0])) if len(buttons) > 0 else 0
        alt_fire = int(bool(buttons[1])) if len(buttons) > 1 else 0
        return DiepAction(agent_id, move_x, move_y, aim_x, aim_y, fire, alt_fire, 0)
    try:
        values = list(action)
    except TypeError:
        return noop_action(agent_id)
    values = values + [0.0] * max(0, 6 - len(values))
    aim_x = float(values[2]) if len(values) > 2 else 1.0
    aim_y = float(values[3]) if len(values) > 3 else 0.0
    return DiepAction(agent_id, float(values[0]), float(values[1]), aim_x, aim_y, int(bool(values[4])), int(bool(values[5])), 0)


class DiepCustomParallelEnv(ParallelEnv):
    """PettingZoo ParallelEnv-compatible wrapper for the C headless simulator.

    The wrapper intentionally does not shape rewards and does not tamper with AI/action logic.
    Callers pass every controlled agent action through the PettingZoo parallel action dict.
    Reward ownership is external via reward_fn; by default rewards are zero.
    """

    metadata = {'name': 'diepcustom_headless_v1', 'render_modes': ['snapshot'], 'is_parallelizable': True}

    def __init__(self, seed=1, agents=1, max_ticks=1000, scenario='rl-grid-smoke', reward_fn=None, raw_rewards=False, render_mode=None):
        if agents <= 0:
            raise ValueError('agents must be positive')
        self.seed_value = seed
        self.agent_count = agents
        self.max_ticks = max_ticks
        self.scenario = scenario
        self.reward_fn = reward_fn
        self.raw_rewards = raw_rewards
        self.render_mode = render_mode
        self._sim = HeadlessSim(seed=seed, agents=agents, max_ticks=max_ticks, scenario=scenario)
        self.possible_agents = [_agent_name(i) for i in range(agents)]
        self.agents = list(self.possible_agents)
        self._agent_ids = self._sim.agent_ids()
        self._name_to_id = {name: self._agent_ids[i] for i, name in enumerate(self.possible_agents)}
        self._observation_shape = observation_shape()
        self._action_shape = action_shape()
        self._observation_spaces = {name: _make_observation_space(self._observation_shape) for name in self.possible_agents}
        self._action_spaces = {name: _make_action_space() for name in self.possible_agents}
        self._last_snapshot = None

    @property
    def unwrapped(self):
        return self

    def observation_space(self, agent):
        return self._observation_spaces[agent]

    def action_space(self, agent):
        return self._action_spaces[agent]

    def reset(self, seed=None, options=None):
        if seed is not None:
            self.seed_value = seed
        self._sim.reset(self.seed_value)
        self.agents = list(self.possible_agents)
        self._agent_ids = self._sim.agent_ids()
        self._name_to_id = {name: self._agent_ids[i] for i, name in enumerate(self.possible_agents)}
        observations = self._observations()
        self._last_snapshot = self._sim.snapshot()
        infos = {agent: {'agent_id': self._name_to_id[agent], 'snapshot_tick': self._last_snapshot.get('tick', 0)} for agent in self.agents}
        return observations, infos

    def step(self, actions):
        if not self.agents:
            return {}, {}, {}, {}, {}
        step_agents = list(self.agents)
        action_structs = []
        for agent in step_agents:
            agent_id = self._name_to_id[agent]
            action_structs.append(action_to_diep(agent_id, actions.get(agent) if actions else None))
        result = self._sim.step(action_structs)
        snapshot = self._sim.snapshot()
        self._last_snapshot = snapshot
        done = bool(result['done'])
        alive = self._sim.alive_mask()
        live_agents = [agent for agent in self.possible_agents if _agent_index(agent) < len(alive) and alive[_agent_index(agent)]]
        live_ids = {self._name_to_id[agent] for agent in live_agents}
        self.agents = [] if done else live_agents
        observations = {} if done else self._observations()
        rewards = self._rewards(result, snapshot, step_agents)
        terminations = {agent: self._name_to_id[agent] not in live_ids for agent in step_agents}
        truncations = {agent: done for agent in step_agents}
        infos = self._infos(result, snapshot, step_agents)
        return observations, rewards, terminations, truncations, infos

    def render(self):
        return self.snapshot()

    def snapshot(self):
        return self._sim.snapshot()

    def close(self):
        self._sim.close()

    def _observations(self):
        if np is not None:
            all_observations = self._sim.observations_array()
            return OrderedDict((agent, all_observations[_agent_index(agent)]) for agent in self.agents)
        return OrderedDict((agent, self._format_observation(self._sim.observation(self._name_to_id[agent]))) for agent in self.agents)

    def _format_observation(self, flat):
        shape = (self._observation_shape['rows'], self._observation_shape['cols'], self._observation_shape['channels'])
        if np is not None:
            return np.asarray(flat, dtype=np.float32).reshape(shape)
        return flat

    def _raw_reward_map(self, result, agents=None):
        agents = self.agents if agents is None else agents
        raw = result.get('rewards', [])
        return {agent: float(raw[_agent_index(agent)]) if _agent_index(agent) < len(raw) else 0.0 for agent in agents}

    def _rewards(self, result, snapshot, agents=None):
        agents = self.agents if agents is None else agents
        if self.reward_fn is not None:
            produced = self.reward_fn(self, result, snapshot)
            return {agent: float(produced.get(agent, 0.0)) for agent in agents}
        if self.raw_rewards:
            return self._raw_reward_map(result, agents)
        return {agent: 0.0 for agent in agents}

    def _infos(self, result, snapshot, agents=None):
        agents = self.agents if agents is None else agents
        raw_rewards = self._raw_reward_map(result, agents)
        tick = int(result.get('tick', snapshot.get('tick', 0)))
        return {
            agent: {
                'agent_id': self._name_to_id[agent],
                'tick': tick,
                'raw_reward': raw_rewards[agent],
                'snapshot': snapshot,
                'action_shape': self._action_shape,
            }
            for agent in agents
        }


parallel_env = DiepCustomParallelEnv
