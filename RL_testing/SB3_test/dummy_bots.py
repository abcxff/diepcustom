"""Hardcoded dummy bots for combat-mode smoke and SB3 training loops."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


ActionDict = dict[str, Any]


def _random_unit_pair(rng: np.random.Generator) -> tuple[float, float]:
    values = rng.uniform(-1.0, 1.0, size=2).astype(np.float32, copy=False)
    norm = float(np.linalg.norm(values))
    if norm < 1e-6:
        return 1.0, 0.0
    clipped = np.clip(values / max(1.0, norm), -1.0, 1.0)
    return float(clipped[0]), float(clipped[1])


@dataclass
class RandomCombatBot:
    """Very simple bot that samples random move/aim/fire commands."""

    fire_probability: float = 0.35
    alt_fire_probability: float = 0.05

    def act(self, _agent_name: str, _observation: Any, *, rng: np.random.Generator) -> ActionDict:
        move_x, move_y = _random_unit_pair(rng)
        aim_x, aim_y = _random_unit_pair(rng)
        fire = 1 if float(rng.random()) < self.fire_probability else 0
        alt_fire = 1 if float(rng.random()) < self.alt_fire_probability else 0
        return {
            'move': (move_x, move_y),
            'aim': (aim_x, aim_y),
            'buttons': (fire, alt_fire),
        }


class RandomCombatBots:
    """Stable per-agent random bots backed by deterministic per-agent RNGs."""

    def __init__(
        self,
        agent_names: list[str] | tuple[str, ...],
        *,
        seed: int = 1,
        fire_probability: float = 0.35,
        alt_fire_probability: float = 0.05,
    ):
        self.agent_names = tuple(agent_names)
        self.seed = int(seed)
        self.fire_probability = float(fire_probability)
        self.alt_fire_probability = float(alt_fire_probability)
        self._bot = RandomCombatBot(
            fire_probability=self.fire_probability,
            alt_fire_probability=self.alt_fire_probability,
        )
        self._rngs: dict[str, np.random.Generator] = {}
        self.reset(seed=self.seed)

    def reset(self, *, seed: int | None = None) -> None:
        if seed is not None:
            self.seed = int(seed)
        base = self.seed
        self._rngs = {
            agent_name: np.random.default_rng(base + index + 1)
            for index, agent_name in enumerate(self.agent_names)
        }

    def action(self, agent_name: str, observation: Any) -> ActionDict:
        try:
            rng = self._rngs[agent_name]
        except KeyError as exc:
            raise KeyError(f'no dummy bot configured for {agent_name!r}') from exc
        return self._bot.act(agent_name, observation, rng=rng)

    def actions_for(self, observations: dict[str, Any], agents: list[str] | tuple[str, ...]) -> dict[str, ActionDict]:
        return {
            agent_name: self.action(agent_name, observations.get(agent_name))
            for agent_name in agents
            if agent_name in self._rngs
        }


__all__ = ['ActionDict', 'RandomCombatBot', 'RandomCombatBots']
