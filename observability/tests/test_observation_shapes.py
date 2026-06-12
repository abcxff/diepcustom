from __future__ import annotations

from observability.core.observation_schema import COMBAT_GRID_CHANNELS, COMBAT_PREV_ACTION_FIELDS, COMBAT_SELF_FIELDS, VIDEO_GRID_CHANNELS
from RL_training.observations.combat import COMBAT_GRID_CHANNELS as SOURCE_GRID_CHANNELS
from RL_training.observations.combat import COMBAT_PREV_ACTION_FIELDS as SOURCE_PREV_ACTION_FIELDS
from RL_training.observations.combat import COMBAT_SELF_FIELDS as SOURCE_SELF_FIELDS


def test_observation_schema_reexports_match_training_contract():
    assert COMBAT_GRID_CHANNELS == SOURCE_GRID_CHANNELS
    assert COMBAT_SELF_FIELDS == SOURCE_SELF_FIELDS
    assert COMBAT_PREV_ACTION_FIELDS == SOURCE_PREV_ACTION_FIELDS


def test_combat_grid_schema_includes_enemy_health_ratio():
    assert len(COMBAT_GRID_CHANNELS) == 18
    assert COMBAT_GRID_CHANNELS[6] == 'enemy_health_ratio'


def test_video_channels_are_valid_training_channels():
    assert VIDEO_GRID_CHANNELS
    for name in VIDEO_GRID_CHANNELS:
        assert name in SOURCE_GRID_CHANNELS
