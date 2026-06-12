"""Convenient Python entrypoint for DiepCustom RL training."""

from .actions import action_to_diep
from .agents import AgentProfile, AgentRoster, ConfiguredAgent
from .auto_upgrade import AutoUpgradePolicy, NO_UPGRADE, PRESET_BUILDS, apply_auto_upgrades, preset_auto_upgrade_policy
from .headless import AGENT_STATE_FIELDS, PROGRESSION_STATE_FIELDS, DiepAction, HeadlessSim, action_shape, agent_progression_shape, agent_state_shape, combat_observation_shape, noop_action
from .observations import COMBAT_GRID_CHANNELS, COMBAT_GRID_SHAPE, COMBAT_PREV_ACTION_FIELDS, COMBAT_SELF_FIELDS, COMBAT_TANK_TYPE_COUNT, COMBAT_UNKNOWN_TANK_TYPE, CombatObservationBuilder, build_combat_observation, build_upgrade_observation_package, make_combat_observation_space
from .pettingzoo_env import DiepCustomParallelEnv, parallel_env
from .rewards import REWARD_FIELDS, RewardConfig, configured_rewards, make_reward_config, reward_components

__all__ = [
    'AGENT_STATE_FIELDS', 'PROGRESSION_STATE_FIELDS', 'DiepAction', 'HeadlessSim', 'action_shape', 'agent_progression_shape', 'agent_state_shape',
    'noop_action', 'combat_observation_shape', 'DiepCustomParallelEnv', 'parallel_env',
    'COMBAT_GRID_CHANNELS', 'COMBAT_GRID_SHAPE', 'COMBAT_PREV_ACTION_FIELDS', 'COMBAT_SELF_FIELDS', 'COMBAT_TANK_TYPE_COUNT', 'COMBAT_UNKNOWN_TANK_TYPE', 'CombatObservationBuilder', 'build_combat_observation', 'build_upgrade_observation_package', 'make_combat_observation_space',
    'REWARD_FIELDS', 'RewardConfig', 'configured_rewards', 'make_reward_config',
    'reward_components', 'action_to_diep', 'AgentProfile', 'AgentRoster', 'ConfiguredAgent', 'AutoUpgradePolicy', 'NO_UPGRADE', 'PRESET_BUILDS', 'apply_auto_upgrades', 'preset_auto_upgrade_policy',
]
