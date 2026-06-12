from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any

from RL_training.headless import EPISODE_STATS_FIELDS
from RL_training.rewards import REWARD_FIELDS

DEATH_CAUSE_LABELS = {
    0: 'none',
    1: 'projectile',
    2: 'collision',
    3: 'boundary',
    4: 'unknown',
}
GAME_STAT_KEYS = tuple(f'game/{name}' for name in EPISODE_STATS_FIELDS)


def death_cause_name(value: int | float) -> str:
    return DEATH_CAUSE_LABELS.get(int(value), 'unknown')


def _clean_dict(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


def reward_component_metrics(reward_sums: dict[str, float], reward_means: dict[str, float], total_reward: float) -> dict[str, float]:
    metrics: dict[str, float] = {}
    for field in REWARD_FIELDS:
        metrics[f'reward/{field}_sum'] = float(reward_sums.get(field, 0.0))
        metrics[f'reward/{field}_mean'] = float(reward_means.get(field, 0.0))
    score_delta_sum = float(reward_sums.get('score_delta', 0.0))
    metrics['reward/score_delta_fraction'] = 0.0 if abs(total_reward) <= 1e-9 else score_delta_sum / total_reward
    return metrics


def summary_metadata(summary: Any) -> dict[str, Any]:
    if is_dataclass(summary):
        return asdict(summary)
    if isinstance(summary, dict):
        return dict(summary)
    raise TypeError('summary must be a dataclass or dict')


def build_episode_payload(
    summary: Any,
    *,
    reward_sums: dict[str, float],
    reward_means: dict[str, float],
    steps_per_second: float,
    policy_entropy: float | None = None,
    explained_variance: float | None = None,
) -> dict[str, Any]:
    raw = summary_metadata(summary)
    payload: dict[str, Any] = {
        'episode_id': raw['episode_id'],
        'controlled_agent': raw['controlled_agent'],
        'train/episode_reward': float(raw['total_reward']),
        'train/episode_length': int(raw['episode_length']),
        'game/hit_rate': float(raw['hit_rate']),
        'game/farm_vs_pvp_ratio': float(raw['farm_vs_pvp_ratio']),
        'game/death_cause_name': raw['death_cause_name'],
        'env/steps_per_second': float(steps_per_second),
        'train/policy_entropy': None if policy_entropy is None else float(policy_entropy),
        'train/explained_variance': None if explained_variance is None else float(explained_variance),
    }
    for field in EPISODE_STATS_FIELDS:
        payload[f'game/{field}'] = raw[field]
    payload.update(reward_component_metrics(reward_sums, reward_means, float(raw['total_reward'])))
    return _clean_dict(payload)


__all__ = ['DEATH_CAUSE_LABELS', 'EPISODE_STATS_FIELDS', 'GAME_STAT_KEYS', 'REWARD_FIELDS', 'build_episode_payload', 'death_cause_name', 'reward_component_metrics', 'summary_metadata']
