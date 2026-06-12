"""Gymnasium wrapper: one SB3-controlled combat agent against random dummy bots."""

from __future__ import annotations

from typing import Any
from collections.abc import Mapping

try:
    import gymnasium as gym
except ImportError as exc:  # optional dependency for the SB3 test harness
    raise ImportError('gymnasium is required for RL_testing/SB3_test. Install RL_testing/requirements.txt in your venv.') from exc
import numpy as np

from RL_training import DiepCustomParallelEnv
from RL_testing.sb3_single_agent_env import (
    ACTION_HIGH,
    ACTION_LOW,
    AGENT_NAME,
    DEFAULT_REWARD_CONFIG,
    agent_observation,
    rounded_upgrade_action,
    unwrap_agent_value,
)

from .dummy_bots import RandomCombatBots


_DEFAULT_BUILD_ORDER = ('predator', 'pentashot', 'fighter', 'annihilator')


def _zero_observation_from_space(space):
    if hasattr(space, 'spaces') and isinstance(getattr(space, 'spaces'), Mapping):
        return {key: _zero_observation_from_space(child) for key, child in space.spaces.items()}
    low = getattr(space, 'low', None)
    shape = getattr(space, 'shape', None)
    dtype = getattr(space, 'dtype', np.float32)
    if low is not None:
        arr = np.asarray(low, dtype=dtype)
        return np.zeros(shape if shape is not None else arr.shape, dtype=dtype)
    if shape is None:
        return np.asarray(0.0, dtype=dtype)
    return np.zeros(shape, dtype=dtype)


class CombatSB3DummyBotsEnv(gym.Env):
    """Expose one combat-mode learner while random bots drive the other agents."""

    metadata = {'render_modes': ['snapshot'], 'render_fps': 30}

    def __init__(
        self,
        *,
        seed: int = 1,
        agents: int = 4,
        controlled_agent: str = AGENT_NAME,
        max_ticks: int = 1000,
        scenario: str = 'upgrade-ready',
        reward_config: dict[str, float] | None = None,
        raw_rewards: bool = False,
        render_mode: str | None = None,
        include_snapshot_info: bool = False,
        combat_builds: tuple[str, ...] | list[str] = _DEFAULT_BUILD_ORDER,
        bot_fire_probability: float = 0.35,
        bot_alt_fire_probability: float = 0.05,
    ):
        super().__init__()
        if agents < 2:
            raise ValueError('agents must be at least 2 when using dummy bots')
        self.seed_value = int(seed)
        self.controlled_agent = str(controlled_agent)
        self.render_mode = render_mode
        self._terminated = False
        self._last_observations: dict[str, Any] = {}
        self._last_infos: dict[str, Any] = {}
        self._env = DiepCustomParallelEnv(
            seed=self.seed_value,
            agents=agents,
            max_ticks=max_ticks,
            scenario=scenario,
            reward_config=dict(DEFAULT_REWARD_CONFIG) if reward_config is None else reward_config,
            raw_rewards=raw_rewards,
            render_mode=render_mode,
            fast_reward_state=True,
            include_snapshot_info=include_snapshot_info,
            combat_builds=tuple(combat_builds),
        )
        if self.controlled_agent not in self._env.possible_agents:
            raise ValueError(f'controlled_agent {self.controlled_agent!r} is not in {self._env.possible_agents!r}')
        self._dummy_bots = RandomCombatBots(
            [name for name in self._env.possible_agents if name != self.controlled_agent],
            seed=self.seed_value,
            fire_probability=bot_fire_probability,
            alt_fire_probability=bot_alt_fire_probability,
        )
        self.observation_space = self._env.observation_space(self.controlled_agent)
        self.action_space = gym.spaces.Box(low=ACTION_LOW, high=ACTION_HIGH, dtype=np.float32)
        self._zero_observation = _zero_observation_from_space(self.observation_space)

    @property
    def pettingzoo_env(self) -> DiepCustomParallelEnv:
        return self._env

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        if seed is not None:
            self.seed_value = int(seed)
        observations, infos = self._env.reset(seed=seed, options=options)
        self._dummy_bots.reset(seed=self.seed_value if seed is None else int(seed))
        self._last_observations = dict(observations)
        self._last_infos = dict(infos)
        self._terminated = False
        observation = agent_observation(observations, self.controlled_agent)
        info = dict(unwrap_agent_value(infos, self.controlled_agent, {}) or {})
        info['dummy_agents'] = [name for name in self._env.possible_agents if name != self.controlled_agent]
        return observation, info

    def step(self, action: Any):
        if self._terminated:
            raise RuntimeError('step() called after episode ended; call reset() first')
        if self.controlled_agent not in self._env.agents:
            raise RuntimeError(f'{self.controlled_agent!r} is no longer alive; call reset() first')

        live_dummy_agents = [name for name in self._env.agents if name != self.controlled_agent]
        actions = self._dummy_bots.actions_for(self._last_observations, live_dummy_agents)
        actions[self.controlled_agent] = rounded_upgrade_action(action)

        observations, rewards, terminations, truncations, infos = self._env.step(actions)
        self._last_observations = dict(observations)
        self._last_infos = dict(infos)

        terminated = bool(unwrap_agent_value(terminations, self.controlled_agent, False))
        truncated = bool(unwrap_agent_value(truncations, self.controlled_agent, False))
        self._terminated = terminated or truncated

        if self.controlled_agent in observations:
            observation = agent_observation(observations, self.controlled_agent)
        else:
            observation = _zero_observation_from_space(self.observation_space)
        reward = float(unwrap_agent_value(rewards, self.controlled_agent, 0.0))
        info = dict(unwrap_agent_value(infos, self.controlled_agent, {}) or {})
        info['dummy_actions'] = {agent_name: actions[agent_name] for agent_name in live_dummy_agents}
        info['live_agents'] = list(self._env.agents)
        return observation, reward, terminated, truncated, info

    def render(self):
        return self._env.render()

    def close(self):
        self._env.close()


__all__ = ['CombatSB3DummyBotsEnv', 'DEFAULT_REWARD_CONFIG']
