"""Combat-only PettingZoo ParallelEnv wrapper for DiepCustom headless training."""

from collections import OrderedDict

try:
    from pettingzoo import ParallelEnv
except ImportError:  # optional dependency; class still follows ParallelEnv contract
    class ParallelEnv:  # type: ignore
        metadata = {}

from .actions import action_to_diep
from .auto_upgrade import preset_auto_upgrade_policy
from .headless import AGENT_STATE_FIELDS, HeadlessSim, action_shape
from .observations import make_combat_observation_space
from .observations.combat import COMBAT_UNKNOWN_TANK_TYPE
from .rewards import (
    REWARD_FIELDS,
    RewardConfig,
    configured_rewards,
    make_reward_config,
    reward_components,
    weighted_rewards,
)
from .spaces import (
    make_action_space,
    np,
)

_AGENT_STATE_INDEX = {name: index for index, name in enumerate(AGENT_STATE_FIELDS)}
_HEALTH_INDEX = _AGENT_STATE_INDEX['health']
_SCORE_INDEX = _AGENT_STATE_INDEX['score']
_ALIVE_INDEX = _AGENT_STATE_INDEX['alive']
_PROGRESSION_LEVEL_INDEX = 0
_PROGRESSION_CURRENT_TANK_INDEX = 1
_PROGRESSION_STATS_AVAILABLE_INDEX = 2
_PROGRESSION_CAN_STAT_UPGRADE_INDEX = 3
_PROGRESSION_CAN_TANK_UPGRADE_INDEX = 4
_PROGRESSION_STAT_LEVELS_START_INDEX = 5
_PROGRESSION_LEGAL_STAT_LEVELS_START_INDEX = 13
_PROGRESSION_LEGAL_TANK_LEVELS_START_INDEX = 21
_DEFAULT_COMBAT_BUILDS = ('predator', 'pentashot', 'fighter', 'annihilator')


def agent_name(agent_index):
    return f'agent_{agent_index}'


def agent_index(agent_name_value):
    return int(agent_name_value.split('_', 1)[1])


class DiepCustomParallelEnv(ParallelEnv):
    """PettingZoo ParallelEnv-compatible wrapper for combat-only Python RL training."""

    metadata = {'name': 'diepcustom_headless_v1', 'render_modes': ['snapshot'], 'is_parallelizable': True}

    def __init__(
        self,
        seed=1,
        agents=1,
        max_ticks=1000,
        scenario='rl-grid-smoke',
        reward_fn=None,
        reward_config=None,
        raw_rewards=False,
        render_mode=None,
        observation_mode='combat',
        fast_reward_state=False,
        include_snapshot_info=True,
        combat_builds=_DEFAULT_COMBAT_BUILDS,
    ):
        if agents <= 0:
            raise ValueError('agents must be positive')
        if observation_mode != 'combat':
            raise ValueError("observation_mode must be 'combat'")

        self.seed_value = seed
        self.agent_count = agents
        self.max_ticks = max_ticks
        self.scenario = scenario
        self.reward_fn = reward_fn
        self.reward_config = make_reward_config(reward_config) if reward_config is not None else None
        self.raw_rewards = raw_rewards
        self.render_mode = render_mode
        self.observation_mode = 'combat'
        self.fast_reward_state = bool(fast_reward_state)
        self.include_snapshot_info = include_snapshot_info
        self.combat_builds = tuple(combat_builds or _DEFAULT_COMBAT_BUILDS)

        self._sim = HeadlessSim(seed=seed, agents=agents, max_ticks=max_ticks, scenario=scenario)
        self.possible_agents = [agent_name(i) for i in range(agents)]
        self.agents = list(self.possible_agents)
        self._action_shape = action_shape()
        self._combat_upgrade_policies = {
            name: preset_auto_upgrade_policy(self.combat_builds[index % len(self.combat_builds)])
            for index, name in enumerate(self.possible_agents)
        } if self.combat_builds else {}
        observation_space = make_combat_observation_space()
        self._observation_spaces = {name: observation_space for name in self.possible_agents}
        self._action_spaces = {name: make_action_space() for name in self.possible_agents}
        self._last_snapshot = None
        self._last_agent_states = None
        self._agent_state_buffer = None
        self._agent_progression_buffer = None
        self._combat_grid_buffer = None
        self._combat_self_buffer = None
        self._combat_prev_action_buffer = None
        self._refresh_agent_ids()

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
        self._refresh_agent_ids()
        current_agent_states = self._agent_states_array() if self.fast_reward_state else None
        snapshot = self._sim.snapshot() if self._needs_snapshot_for_step() else None
        observations = self._observations_for(self.agents)
        self._last_agent_states = current_agent_states.copy() if current_agent_states is not None else None
        self._last_snapshot = snapshot
        snapshot_tick = self._last_snapshot.get('tick', 0) if self._last_snapshot else 0
        infos = {agent: {'agent_id': self._name_to_id[agent], 'snapshot_tick': snapshot_tick} for agent in self.agents}
        return observations, infos

    def step(self, actions):
        if not self.agents:
            return {}, {}, {}, {}, {}

        step_agents = list(self.agents)
        previous_snapshot = self._last_snapshot
        previous_agent_states = self._last_agent_states.copy() if self._last_agent_states is not None else None
        result = self._sim.step(self._action_structs(step_agents, actions))
        current_agent_states = self._agent_states_array() if self.fast_reward_state else None
        snapshot = self._sim.snapshot() if self._needs_snapshot_for_step() else None

        self._last_snapshot = snapshot
        self._last_agent_states = current_agent_states.copy() if current_agent_states is not None else None
        live_agents = self._alive_agent_names(current_agent_states)
        live_ids = {self._name_to_id[agent] for agent in live_agents}
        observations = self._observations_for(step_agents)
        self.agents = [] if result['done'] else live_agents

        rewards = self._rewards(result, snapshot, previous_snapshot, step_agents, previous_agent_states, current_agent_states)
        terminations = {agent: self._name_to_id[agent] not in live_ids for agent in step_agents}
        truncations = {agent: bool(result['done']) for agent in step_agents}
        infos = self._infos(result, snapshot, previous_snapshot, step_agents, previous_agent_states, current_agent_states)
        return observations, rewards, terminations, truncations, infos

    def render(self):
        return self.snapshot()

    def snapshot(self):
        return self._sim.snapshot()

    def close(self):
        self._sim.close()

    def set_reward_config(self, config=None, **overrides):
        self.reward_config = make_reward_config(config, **overrides) if config is not None or overrides else None
        return self.reward_config

    def reward_components(self, result, snapshot, previous_snapshot=None, agents=None, previous_agent_states=None, current_agent_states=None):
        if previous_agent_states is not None and current_agent_states is not None:
            return self._state_reward_components(result, agents, previous_agent_states, current_agent_states)
        return reward_components(self, result, snapshot, previous_snapshot, agents)

    def _refresh_agent_ids(self):
        self._agent_ids = self._sim.agent_ids()
        self._name_to_id = {name: self._agent_ids[i] for i, name in enumerate(self.possible_agents)}

    def _action_structs(self, agents, actions):
        actions = actions or {}
        enriched_actions = self._combat_actions_for(agents, actions)
        return [action_to_diep(self._name_to_id[agent], enriched_actions.get(agent)) for agent in agents]

    def _observations_for(self, agents):
        grid_observations = self._sim.combat_observations_array(out=self._combat_grid_buffer)
        self._combat_grid_buffer = grid_observations
        self_observations = self._sim.combat_self_observations_array(out=self._combat_self_buffer)
        self._combat_self_buffer = self_observations
        prev_action_observations = self._sim.combat_prev_action_observations_array(out=self._combat_prev_action_buffer)
        self._combat_prev_action_buffer = prev_action_observations
        progressions = self._agent_progressions_array()
        return OrderedDict(
            (
                agent,
                {
                    'grid_obs': grid_observations[agent_index(agent)].copy(),
                    'self_obs': self_observations[agent_index(agent)].copy(),
                    'prev_action_obs': prev_action_observations[agent_index(agent)].copy(),
                    'tank_type_obs': self._tank_type_observation(progressions[agent_index(agent)]),
                },
            )
            for agent in agents
        )

    @staticmethod
    def _tank_type_observation(progression_row):
        tank_id = int(progression_row[_PROGRESSION_CURRENT_TANK_INDEX])
        if tank_id < 0 or tank_id >= COMBAT_UNKNOWN_TANK_TYPE:
            return COMBAT_UNKNOWN_TANK_TYPE
        return tank_id

    def _agent_states_array(self):
        states = self._sim.agent_states_array(out=self._agent_state_buffer)
        self._agent_state_buffer = states
        return states

    def _agent_progressions_array(self):
        progressions = self._sim.agent_progressions_array(out=self._agent_progression_buffer)
        self._agent_progression_buffer = progressions
        return progressions

    def _progression_observation(self, progression_row):
        stat_levels = progression_row[_PROGRESSION_STAT_LEVELS_START_INDEX:_PROGRESSION_LEGAL_STAT_LEVELS_START_INDEX].copy()
        legal_stat_upgrades = progression_row[_PROGRESSION_LEGAL_STAT_LEVELS_START_INDEX:_PROGRESSION_LEGAL_TANK_LEVELS_START_INDEX].copy()
        legal_tank_upgrades = progression_row[_PROGRESSION_LEGAL_TANK_LEVELS_START_INDEX:].copy()
        if np is not None:
            stat_levels = stat_levels.astype(np.float32, copy=False)
            legal_stat_upgrades = legal_stat_upgrades.astype(np.float32, copy=False)
            legal_tank_upgrades = legal_tank_upgrades.astype(np.float32, copy=False)
        return {
            'level': float(progression_row[_PROGRESSION_LEVEL_INDEX]),
            'current_tank': float(progression_row[_PROGRESSION_CURRENT_TANK_INDEX]),
            'stats_available': float(progression_row[_PROGRESSION_STATS_AVAILABLE_INDEX]),
            'can_stat_upgrade': float(progression_row[_PROGRESSION_CAN_STAT_UPGRADE_INDEX]),
            'can_tank_upgrade': float(progression_row[_PROGRESSION_CAN_TANK_UPGRADE_INDEX]),
            'stat_levels': stat_levels,
            'legal_stat_upgrades': legal_stat_upgrades,
            'legal_tank_upgrades': legal_tank_upgrades,
        }

    def _progression_observations_for(self, agents):
        progressions = self._agent_progressions_array()
        return OrderedDict((agent, self._progression_observation(progressions[agent_index(agent)])) for agent in agents)

    def _combat_actions_for(self, agents, actions):
        progressions = self._progression_observations_for(agents)
        enriched = OrderedDict()
        for agent in agents:
            source_action = actions.get(agent)
            action_value = self._combat_action_with_auto_upgrade(agent, source_action, progressions[agent])
            enriched[agent] = action_value
        return enriched

    def _combat_action_with_auto_upgrade(self, agent, action, progression):
        policy = self._combat_upgrade_policies.get(agent)
        if policy is None:
            return action
        if isinstance(action, dict):
            return policy.apply(action, progression)
        defaults = [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0, -1.0]
        try:
            raw_values = list(action)
        except TypeError:
            raw_values = []
        values = list(defaults)
        for index, value in enumerate(raw_values[:8]):
            values[index] = value
        upgrade_action = policy.apply({}, progression)
        values[6] = float(upgrade_action['stat_upgrade_choice'])
        values[7] = float(upgrade_action['tank_upgrade_choice'])
        return values

    def _raw_reward_map(self, result, agents=None):
        agents = self.agents if agents is None else agents
        raw = result.get('rewards', [])
        return {agent: float(raw[agent_index(agent)]) if agent_index(agent) < len(raw) else 0.0 for agent in agents}

    def _alive_agent_names(self, agent_states=None):
        if np is not None and agent_states is not None and hasattr(agent_states, 'shape'):
            return [agent for agent in self.possible_agents if bool(agent_states[agent_index(agent), _ALIVE_INDEX])]
        alive = self._sim.alive_mask()
        return [agent for agent in self.possible_agents if agent_index(agent) < len(alive) and alive[agent_index(agent)]]

    def _state_reward_components(self, result, agents, previous_agent_states, current_agent_states):
        agents = self.agents if agents is None else agents
        raw_rewards = self._raw_reward_map(result, agents)
        done = bool(result.get('done', False))
        components = {}
        for agent in agents:
            idx = agent_index(agent)
            previous = previous_agent_states[idx]
            current = current_agent_states[idx]
            previous_health = float(previous[_HEALTH_INDEX])
            current_health = float(current[_HEALTH_INDEX])
            is_alive = bool(current[_ALIVE_INDEX])
            components[agent] = {
                'raw': raw_rewards.get(agent, 0.0),
                'score_delta': float(current[_SCORE_INDEX] - previous[_SCORE_INDEX]),
                'health_delta': current_health - previous_health,
                'damage_taken': max(0.0, previous_health - current_health),
                'alive': 1.0 if is_alive else 0.0,
                'death': 0.0 if is_alive else 1.0,
                'truncation': 1.0 if done else 0.0,
                'step': 1.0,
            }
        return components

    def _needs_snapshot_for_step(self):
        return (
            self.include_snapshot_info
            or self.reward_fn is not None
            or (self.reward_config is not None and not self.fast_reward_state)
        )

    def _rewards(self, result, snapshot, previous_snapshot=None, agents=None, previous_agent_states=None, current_agent_states=None):
        agents = self.agents if agents is None else agents
        if self.reward_fn is not None:
            produced = self.reward_fn(self, result, snapshot)
            return {agent: float(produced.get(agent, 0.0)) for agent in agents}
        if self.reward_config is not None:
            if self.fast_reward_state and previous_agent_states is not None and current_agent_states is not None:
                return weighted_rewards(self.reward_config, self._state_reward_components(result, agents, previous_agent_states, current_agent_states))
            return configured_rewards(self.reward_config, self, result, snapshot, previous_snapshot, agents)
        if self.raw_rewards:
            return self._raw_reward_map(result, agents)
        return {agent: 0.0 for agent in agents}

    def _infos(self, result, snapshot, previous_snapshot=None, agents=None, previous_agent_states=None, current_agent_states=None):
        agents = self.agents if agents is None else agents
        raw_rewards = self._raw_reward_map(result, agents)
        components = self.reward_components(result, snapshot, previous_snapshot, agents, previous_agent_states, current_agent_states)
        tick = int(result.get('tick', snapshot.get('tick', 0) if snapshot else 0))
        return {
            agent: {
                'agent_id': self._name_to_id[agent],
                'tick': tick,
                'raw_reward': raw_rewards[agent],
                'snapshot': snapshot if self.include_snapshot_info else None,
                'action_shape': self._action_shape,
                'reward_config': self.reward_config,
                'reward_components': components[agent],
            }
            for agent in agents
        }


parallel_env = DiepCustomParallelEnv


__all__ = [
    'DiepCustomParallelEnv', 'parallel_env', 'RewardConfig', 'REWARD_FIELDS',
    'make_reward_config', 'reward_components', 'configured_rewards', 'action_to_diep',
    'agent_name', 'agent_index',
]
