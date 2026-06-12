"""Gymnasium single-agent adapter for the DiepCustom PettingZoo env."""

from __future__ import annotations

from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from RL_training import DiepCustomParallelEnv

AGENT_NAME = 'agent_0'
ACTION_LOW = np.asarray([-1.0, -1.0, -1.0, -1.0, 0.0, 0.0, -1.0, -1.0], dtype=np.float32)
ACTION_HIGH = np.asarray([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 7.0, 5.0], dtype=np.float32)
NOOP_ACTION = np.asarray([0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0, -1.0], dtype=np.float32)
DEFAULT_REWARD_CONFIG = {
    'score_delta': 0.005,
    'health_delta': 0.003,
    'damage_taken': -0.001,
    'alive': 0.05,
    'death': -5.0,
    'truncation': 1.0,
    'step': -0.001,
}


def clipped_action(action: Any) -> np.ndarray:
    """Return an 8D float32 action clipped to the Diep action ABI bounds."""
    values = np.asarray(action, dtype=np.float32).reshape(-1)
    if values.size < NOOP_ACTION.size:
        padded = NOOP_ACTION.copy()
        padded[: values.size] = values
        values = padded
    return np.clip(values[: NOOP_ACTION.size], ACTION_LOW, ACTION_HIGH).astype(np.float32, copy=False)


def rounded_upgrade_action(action: Any) -> np.ndarray:
    """Clip continuous policy output and round discrete upgrade channels."""
    values = clipped_action(action).copy()
    values[4] = 1.0 if values[4] >= 0.5 else 0.0
    values[5] = 1.0 if values[5] >= 0.5 else 0.0
    values[6] = float(int(np.rint(values[6])))
    values[7] = float(int(np.rint(values[7])))
    return values


def unwrap_agent_value(values: dict[str, Any], agent_name: str = AGENT_NAME, default: Any = None) -> Any:
    """Read the single PettingZoo agent value from a returned agent dictionary."""
    return values.get(agent_name, default)


def _observation_tree(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: int(child) if key == 'tank_type_obs' else _observation_tree(child)
            for key, child in value.items()
        }
    return np.asarray(value, dtype=np.float32)


def agent_observation(observations: dict[str, Any], agent_name: str = AGENT_NAME) -> Any:
    """Return a Gymnasium-compatible float32 observation for one agent."""
    observation = unwrap_agent_value(observations, agent_name)
    if observation is None:
        raise KeyError(f'missing observation for {agent_name!r}')
    return _observation_tree(observation)


class DiepCustomSB3SingleAgentEnv(gym.Env):
    """Single-agent Gymnasium wrapper around :class:`DiepCustomParallelEnv`.

    The wrapper exposes a single-agent Gymnasium view over the flat 8D action ABI
    used by ``RL_training.actions.action_to_diep`` and always returns the combat
    observation dict for quick SB3/RecurrentPPO smoke validation.
    """

    metadata = {'render_modes': ['snapshot'], 'render_fps': 30}

    def __init__(
        self,
        *,
        seed: int = 1,
        max_ticks: int = 1000,
        scenario: str = 'rl-grid-smoke',
        reward_config: dict[str, float] | None = None,
        raw_rewards: bool = False,
        render_mode: str | None = None,
        include_snapshot_info: bool = False,
    ):
        super().__init__()
        self.agent_name = AGENT_NAME
        self.render_mode = render_mode
        self._env = DiepCustomParallelEnv(
            seed=seed,
            agents=1,
            max_ticks=max_ticks,
            scenario=scenario,
            reward_config=reward_config,
            raw_rewards=raw_rewards,
            render_mode=render_mode,
            fast_reward_state=True,
            include_snapshot_info=include_snapshot_info,
        )
        self.observation_space = self._env.observation_space(self.agent_name)
        self.action_space = spaces.Box(low=ACTION_LOW, high=ACTION_HIGH, dtype=np.float32)
        self._last_observation: np.ndarray | None = None

    @property
    def pettingzoo_env(self) -> DiepCustomParallelEnv:
        """Expose the wrapped env for debugging without changing the public adapter."""
        return self._env

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        observations, infos = self._env.reset(seed=seed, options=options)
        observation = agent_observation(observations, self.agent_name)
        self._last_observation = observation
        return observation, dict(unwrap_agent_value(infos, self.agent_name, {}) or {})

    def step(self, action: Any):
        if not self._env.agents:
            raise RuntimeError('step() called after episode ended; call reset() first')
        action_values = rounded_upgrade_action(action)
        observations, rewards, terminations, truncations, infos = self._env.step({self.agent_name: action_values})
        observation = agent_observation(observations, self.agent_name)
        self._last_observation = observation
        reward = float(unwrap_agent_value(rewards, self.agent_name, 0.0))
        terminated = bool(unwrap_agent_value(terminations, self.agent_name, False))
        truncated = bool(unwrap_agent_value(truncations, self.agent_name, False))
        info = dict(unwrap_agent_value(infos, self.agent_name, {}) or {})
        return observation, reward, terminated, truncated, info

    def render(self):
        return self._env.render()

    def close(self):
        self._env.close()


__all__ = [
    'ACTION_HIGH',
    'ACTION_LOW',
    'AGENT_NAME',
    'DEFAULT_REWARD_CONFIG',
    'DiepCustomSB3SingleAgentEnv',
    'agent_observation',
    'clipped_action',
    'rounded_upgrade_action',
    'unwrap_agent_value',
]
