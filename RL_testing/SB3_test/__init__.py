"""SB3 combat-mode test harnesses for DiepCustom."""

from .dummy_bots import RandomCombatBot, RandomCombatBots
from .single_agent_vs_bots_env import CombatSB3DummyBotsEnv

__all__ = ['RandomCombatBot', 'RandomCombatBots', 'CombatSB3DummyBotsEnv']
