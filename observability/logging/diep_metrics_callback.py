from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, is_dataclass
import time
from typing import Any

from RL_training.rewards import REWARD_FIELDS, weighted_rewards

from observability.config import ObservabilityConfig
from observability.core.metrics_schema import build_episode_payload
from observability.core.stats_bridge import EpisodeStatsSummary
from observability.logging.wandb_logger import WandbLogger

try:
    from stable_baselines3.common.callbacks import BaseCallback
except ImportError:  # pragma: no cover - enables lightweight unit tests outside .venv
    class BaseCallback:  # type: ignore
        def __init__(self, verbose: int = 0):
            self.verbose = verbose
            self.locals: dict[str, Any] = {}
            self.num_timesteps = 0
            self.training_env = None
            self.model = None


class DiepMetricsCallback(BaseCallback):
    def __init__(self, observability: ObservabilityConfig, *, verbose: int = 0):
        super().__init__(verbose=verbose)
        self.observability = observability
        self.logger_backend = WandbLogger(observability)
        self._episode_index = 0
        self._episode_started_at = time.perf_counter()
        self._reward_sums: dict[str, dict[str, float]] = defaultdict(lambda: {field: 0.0 for field in REWARD_FIELDS})
        self._reward_means: dict[str, dict[str, float]] = defaultdict(lambda: {field: 0.0 for field in REWARD_FIELDS})
        self._total_rewards: dict[str, float] = defaultdict(float)
        self._step_counts: dict[str, int] = defaultdict(int)
        self._started = False

    def _on_training_start(self) -> None:
        if self._started:
            return
        env = self._base_env()
        pz_env = getattr(env, 'pettingzoo_env', env)
        reward_config = getattr(pz_env, 'reward_config', None)
        if is_dataclass(reward_config):
            reward_config = asdict(reward_config)
        run_config = {
            'run_id': self.observability.run_id,
            'wandb_mode': self.observability.wandb_mode,
            'stats_log_agents': list(self.observability.stats_log_agents),
            'learner_agent': getattr(env, 'controlled_agent', self.observability.learner_agent),
            'scenario': getattr(env, 'scenario', getattr(pz_env, 'scenario', None)),
            'seed': getattr(env, 'seed_value', getattr(pz_env, 'seed_value', None)),
            'agents': getattr(env, 'agent_count', getattr(pz_env, 'agent_count', None)),
            'reward_config': reward_config,
        }
        self.logger_backend.start(run_config)
        self._episode_started_at = time.perf_counter()
        self._started = True

    def _on_step(self) -> bool:
        if not self._started:
            self._on_training_start()
        env = self._base_env()
        pz_env = getattr(env, 'pettingzoo_env', env)
        reward_config = getattr(pz_env, 'reward_config', None)
        per_agent_infos = dict(getattr(pz_env, '_last_infos', {}) or {})
        if not per_agent_infos:
            infos = self.locals.get('infos') or []
            if infos:
                per_agent_infos = {getattr(env, 'controlled_agent', self.observability.learner_agent): dict(infos[0])}
        requested_agents = self.observability.stats_log_agents
        components_by_agent = {
            agent: {
                field: float(((per_agent_infos.get(agent) or {}).get('reward_components') or {}).get(field, 0.0))
                for field in REWARD_FIELDS
            }
            for agent in requested_agents
            if (per_agent_infos.get(agent) or {}).get('reward_components') is not None
        }
        if components_by_agent:
            weighted = weighted_rewards(reward_config, components_by_agent) if reward_config is not None else {
                agent: float(values.get('raw', 0.0)) for agent, values in components_by_agent.items()
            }
            for agent, components in components_by_agent.items():
                for field in REWARD_FIELDS:
                    self._reward_sums[agent][field] += float(components.get(field, 0.0))
                self._total_rewards[agent] += float(weighted.get(agent, 0.0))
                self._step_counts[agent] += 1
        dones = self.locals.get('dones') or []
        if bool(dones[0]) if dones else False:
            self.flush_pending(reason='done')
        return True

    def _on_training_end(self) -> None:
        self.logger_backend.finish()

    def flush_pending(self, *, reason: str = 'reset') -> list[dict[str, Any]]:
        env = self._base_env()
        pz_env = getattr(env, 'pettingzoo_env', env)
        if not hasattr(pz_env, '_sim'):
            return []
        rows = pz_env._sim.episode_stats_array()
        emitted: list[dict[str, Any]] = []
        elapsed = max(time.perf_counter() - self._episode_started_at, 1e-9)
        logger_values = getattr(getattr(self.model, 'logger', None), 'name_to_value', {}) or {}
        entropy_loss = logger_values.get('train/entropy_loss')
        policy_entropy = None if entropy_loss is None else float(-entropy_loss)
        explained_variance = logger_values.get('train/explained_variance')
        for agent in self.observability.stats_log_agents:
            index = int(str(agent).split('_', 1)[1])
            episode_length = int(self._step_counts.get(agent, 0))
            if episode_length <= 0 and reason != 'done':
                continue
            reward_sums = dict(self._reward_sums.get(agent, {field: 0.0 for field in REWARD_FIELDS}))
            reward_means = {
                field: (reward_sums[field] / episode_length if episode_length > 0 else 0.0)
                for field in REWARD_FIELDS
            }
            summary = EpisodeStatsSummary.from_row(
                rows[index],
                episode_id=f'episode_{self._episode_index:06d}_{agent}',
                controlled_agent=agent,
                episode_length=episode_length,
                total_reward=float(self._total_rewards.get(agent, 0.0)),
            )
            payload = build_episode_payload(
                summary,
                reward_sums=reward_sums,
                reward_means=reward_means,
                steps_per_second=(episode_length / elapsed) if episode_length > 0 else 0.0,
                policy_entropy=policy_entropy,
                explained_variance=None if explained_variance is None else float(explained_variance),
            )
            payload['episode_flush_reason'] = reason
            self.logger_backend.log_episode(payload, step=getattr(self, 'num_timesteps', None))
            emitted.append(payload)
        self._reward_sums = defaultdict(lambda: {field: 0.0 for field in REWARD_FIELDS})
        self._reward_means = defaultdict(lambda: {field: 0.0 for field in REWARD_FIELDS})
        self._total_rewards = defaultdict(float)
        self._step_counts = defaultdict(int)
        self._episode_index += 1
        self._episode_started_at = time.perf_counter()
        return emitted

    def _base_env(self) -> Any:
        env = getattr(self, 'training_env', None)
        if env is None:
            raise RuntimeError('training_env is not attached')
        if hasattr(env, 'envs') and env.envs:
            env = env.envs[0]
        visited: set[int] = set()
        while True:
            identity = id(env)
            if identity in visited:
                break
            visited.add(identity)
            if hasattr(env, 'unwrapped') and env.unwrapped is not env:
                env = env.unwrapped
                continue
            if hasattr(env, 'env'):
                env = env.env
                continue
            break
        return env


__all__ = ['DiepMetricsCallback']
