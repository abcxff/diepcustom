from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np

from RL_training.headless import EPISODE_STATS_FIELDS, HeadlessSim

from .metrics_schema import death_cause_name


@dataclass(frozen=True)
class EpisodeStatsSummary:
    episode_id: str
    controlled_agent: str
    episode_length: int
    total_reward: float
    lifetime_steps: int
    score_total: float
    score_from_farming: float
    score_from_pvp: float
    damage_dealt: float
    damage_taken: float
    shots_fired: int
    shots_hit: int
    kills: int
    death_count: int
    death_cause: int
    level_reached: int
    tank_class: int
    upgrade_choices: float
    hit_rate: float
    farm_vs_pvp_ratio: float
    death_cause_name: str

    @classmethod
    def from_row(
        cls,
        row: Sequence[float],
        *,
        episode_id: str,
        controlled_agent: str,
        episode_length: int,
        total_reward: float,
    ) -> 'EpisodeStatsSummary':
        converted = [float(value) for value in row]
        if len(converted) != len(EPISODE_STATS_FIELDS):
            raise ValueError(f'expected {len(EPISODE_STATS_FIELDS)} episode stats values, got {len(converted)}')
        values = dict(zip(EPISODE_STATS_FIELDS, converted))
        shots_fired = int(values['shots_fired'])
        shots_hit = int(values['shots_hit'])
        farming = float(values['score_from_farming'])
        pvp = float(values['score_from_pvp'])
        return cls(
            episode_id=str(episode_id),
            controlled_agent=str(controlled_agent),
            episode_length=int(episode_length),
            total_reward=float(total_reward),
            lifetime_steps=int(values['lifetime_steps']),
            score_total=float(values['score_total']),
            score_from_farming=farming,
            score_from_pvp=pvp,
            damage_dealt=float(values['damage_dealt']),
            damage_taken=float(values['damage_taken']),
            shots_fired=shots_fired,
            shots_hit=shots_hit,
            kills=int(values['kills']),
            death_count=int(values['death_count']),
            death_cause=int(values['death_cause']),
            level_reached=int(values['level_reached']),
            tank_class=int(values['tank_class']),
            upgrade_choices=float(values['upgrade_choices']),
            hit_rate=0.0 if shots_fired <= 0 else shots_hit / shots_fired,
            farm_vs_pvp_ratio=0.0 if (farming + pvp) <= 1e-9 else farming / (farming + pvp),
            death_cause_name=death_cause_name(values['death_cause']),
        )


def episode_stats_array(sim: HeadlessSim, out: np.ndarray | None = None) -> np.ndarray:
    return sim.episode_stats_array(out=out)


def episode_stats_by_agent(sim: HeadlessSim, possible_agents: Sequence[str], out: np.ndarray | None = None) -> Mapping[str, np.ndarray]:
    rows = episode_stats_array(sim, out=out)
    return {agent: rows[index] for index, agent in enumerate(possible_agents)}


__all__ = ['EPISODE_STATS_FIELDS', 'EpisodeStatsSummary', 'episode_stats_array', 'episode_stats_by_agent']
