"""Convenient Python entrypoint for DiepCustom RL training."""

from .actions import action_to_diep
from .agents import AgentProfile, AgentRoster, ConfiguredAgent
from .auto_upgrade import AutoUpgradePolicy, NO_UPGRADE, PRESET_BUILDS, apply_auto_upgrades, preset_auto_upgrade_policy
from .headless import AGENT_STATE_FIELDS, PROGRESSION_STATE_FIELDS, DiepAction, HeadlessSim, action_shape, agent_progression_shape, agent_state_shape, noop_action, observation_shape
from .pettingzoo_env import DiepCustomParallelEnv, SELF_OBSERVATION_FIELDS, parallel_env
from .rewards import REWARD_FIELDS, RewardConfig, configured_rewards, make_reward_config, reward_components

__all__ = [
    'AGENT_STATE_FIELDS', 'PROGRESSION_STATE_FIELDS', 'SELF_OBSERVATION_FIELDS', 'DiepAction', 'HeadlessSim', 'action_shape', 'agent_progression_shape', 'agent_state_shape',
    'noop_action', 'observation_shape', 'DiepCustomParallelEnv', 'parallel_env',
    'REWARD_FIELDS', 'RewardConfig', 'configured_rewards', 'make_reward_config',
    'reward_components', 'action_to_diep', 'AgentProfile', 'AgentRoster', 'ConfiguredAgent', 'AutoUpgradePolicy', 'NO_UPGRADE', 'PRESET_BUILDS', 'apply_auto_upgrades', 'preset_auto_upgrade_policy',
]
