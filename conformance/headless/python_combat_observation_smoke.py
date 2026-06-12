from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np

from RL_training import COMBAT_GRID_CHANNELS, COMBAT_SELF_FIELDS, CombatObservationBuilder, DiepCustomParallelEnv


CHANNEL = {name: index for index, name in enumerate(COMBAT_GRID_CHANNELS)}
SELF = {name: index for index, name in enumerate(COMBAT_SELF_FIELDS)}
CENTER = 10


def entity(*, entity_id: int, kind: str, team_id: int, x: float, y: float, angle: float = 0.0, vx: float = 0.0, vy: float = 0.0, health: float = 10.0, max_health: float = 10.0, score: float = 0.0, score_reward: float = 0.0):
    return {
        'id': entity_id,
        'kind': kind,
        'teamId': team_id,
        'ownerId': -1,
        'position': {'x': x, 'y': y, 'angle': angle},
        'velocity': {'x': vx, 'y': vy},
        'health': {'health': health, 'maxHealth': max_health},
        'score': {'score': score, 'scoreReward': score_reward},
        'lifecycle': {'deleting': False, 'removed': False},
    }


PROGRESSION = {
    'level': 10.0,
    'current_tank': 6.0,
    'stats_available': 2.0,
    'can_stat_upgrade': 1.0,
    'can_tank_upgrade': 1.0,
    'stat_levels': np.asarray([1, 2, 3, 4, 5, 6, 7, 0], dtype=np.float32),
    'legal_stat_upgrades': np.asarray([1, 0, 1, 0, 1, 0, 1, 0], dtype=np.float32),
    'legal_tank_upgrades': np.asarray([1, 0, 0, 1, 0, 0], dtype=np.float32),
}
STATE_ROW = np.asarray([1, 1, 0, 0, 5, -5, 40, 50, 250, 1], dtype=np.float32)


builder = CombatObservationBuilder()
base_snapshot = {
    'tick': 0,
    'arena': {'leftX': -1000, 'rightX': 1000, 'topY': -1000, 'bottomY': 1000},
    'entities': [
        entity(entity_id=1, kind='agent', team_id=1, x=0, y=0, angle=0.0, vx=5, vy=-5, health=40, max_health=50, score=250),
        entity(entity_id=2, kind='shape', team_id=-1, x=0, y=-100, score_reward=25),
        entity(entity_id=3, kind='agent', team_id=2, x=100, y=0, vx=-10, vy=0, health=30, max_health=50, score=400),
        entity(entity_id=4, kind='projectile', team_id=1, x=0, y=100, vx=40, vy=0),
        entity(entity_id=5, kind='projectile', team_id=2, x=-100, y=0, vx=0, vy=30),
        entity(entity_id=6, kind='crasher', team_id=-1, x=100, y=100),
    ],
}
obs = builder.build(snapshot=base_snapshot, agent_id=1, state_row=STATE_ROW, progression=PROGRESSION, prev_action={'move': [1.0, -1.0], 'aim': [0.0, 1.0], 'buttons': [1, 0]})
assert set(obs) == {'grid_obs', 'self_obs', 'prev_action_obs', 'tank_type_obs'}
assert obs['grid_obs'].shape == (len(COMBAT_GRID_CHANNELS), 21, 21)
assert obs['grid_obs'].dtype == np.float32
assert obs['self_obs'].shape == (len(COMBAT_SELF_FIELDS),)
assert obs['prev_action_obs'].shape == (5,)
assert obs['tank_type_obs'].shape == ()
assert int(obs['tank_type_obs']) == 6
assert np.all((obs['self_obs'] >= -1.0) & (obs['self_obs'] <= 1.0))
assert obs['prev_action_obs'].tolist() == [1.0, -1.0, 0.0, 1.0, 1.0]
assert obs['grid_obs'][CHANNEL['farmable_presence'], CENTER - 1, CENTER] == 1.0
assert obs['grid_obs'][CHANNEL['farmable_value'], CENTER - 1, CENTER] > 0.0
assert obs['grid_obs'][CHANNEL['enemy_presence'], CENTER, CENTER + 1] == 1.0
assert obs['grid_obs'][CHANNEL['enemy_threat'], CENTER, CENTER + 1] > 0.0
assert obs['grid_obs'][CHANNEL['enemy_opportunity'], CENTER, CENTER + 1] > 0.0
assert np.isclose(obs['grid_obs'][CHANNEL['enemy_health_ratio'], CENTER, CENTER + 1], 0.6)
assert obs['grid_obs'][CHANNEL['enemy_type_balanced'], CENTER, CENTER + 1] == 1.0
assert obs['grid_obs'][CHANNEL['projectile_presence'], CENTER, CENTER - 1] == 1.0
assert obs['grid_obs'][CHANNEL['projectile_relative_velocity_y'], CENTER, CENTER - 1] > 0.0
assert obs['grid_obs'][CHANNEL['enemy_presence'], CENTER + 1, CENTER + 1] == 1.0
assert np.isclose(obs['grid_obs'][CHANNEL['enemy_health_ratio'], CENTER + 1, CENTER + 1], 1.0)
assert obs['grid_obs'][CHANNEL['enemy_type_rammer'], CENTER + 1, CENTER + 1] == 1.0
assert obs['grid_obs'][CHANNEL['projectile_presence'], CENTER + 1, CENTER] == 0.0
assert obs['grid_obs'][CHANNEL['enemy_health_ratio'], CENTER, CENTER] == 0.0
assert obs['self_obs'][SELF['health_ratio']] > 0.0
assert obs['self_obs'][SELF['current_velocity_x_norm']] > 0.0
assert obs['self_obs'][SELF['current_velocity_y_norm']] < 0.0

same_cell_snapshot = {
    'tick': 0,
    'arena': {'leftX': -1000, 'rightX': 1000, 'topY': -1000, 'bottomY': 1000},
    'entities': [
        entity(entity_id=1, kind='agent', team_id=1, x=0, y=0, angle=0.0, health=40, max_health=50, score=250),
        entity(entity_id=2, kind='crasher', team_id=-1, x=100, y=0, health=2, max_health=10, score=200),
        entity(entity_id=3, kind='agent', team_id=2, x=199, y=0, health=50, max_health=50, score=0),
    ],
}
same_cell_obs = builder.build(snapshot=same_cell_snapshot, agent_id=1, state_row=STATE_ROW, progression=PROGRESSION, prev_action=None)
assert same_cell_obs['grid_obs'][CHANNEL['enemy_presence'], CENTER, CENTER + 1] == 1.0
assert np.isclose(same_cell_obs['grid_obs'][CHANNEL['enemy_health_ratio'], CENTER, CENTER + 1], 0.2)
assert same_cell_obs['grid_obs'][CHANNEL['enemy_type_rammer'], CENTER, CENTER + 1] == 1.0
assert same_cell_obs['grid_obs'][CHANNEL['enemy_type_balanced'], CENTER, CENTER + 1] == 0.0

wall_snapshot = {
    'tick': 0,
    'arena': {'leftX': -1000, 'rightX': 1000, 'topY': -1000, 'bottomY': 1000},
    'entities': [entity(entity_id=1, kind='agent', team_id=1, x=950, y=0, angle=0.0, health=40, max_health=50, score=250)],
}
wall_obs = builder.build(snapshot=wall_snapshot, agent_id=1, state_row=np.asarray([1, 1, 950, 0, 0, 0, 40, 50, 250, 1], dtype=np.float32), progression=PROGRESSION, prev_action=None)
assert wall_obs['grid_obs'][CHANNEL['wall'], CENTER, CENTER + 1] == 1.0
assert wall_obs['prev_action_obs'].tolist() == [0.0, 0.0, 0.0, 0.0, 0.0]

combat_env = DiepCustomParallelEnv(seed=123, agents=1, max_ticks=4, scenario='upgrade-ready', observation_mode='combat', include_snapshot_info=False)
try:
    observations, infos = combat_env.reset(seed=123)
    assert infos['agent_0']['agent_id'] == 0
    first = observations['agent_0']
    assert first['grid_obs'].shape == (len(COMBAT_GRID_CHANNELS), 21, 21)
    assert first['self_obs'].shape == (27,)
    assert first['prev_action_obs'].shape == (5,)
    assert int(first['tank_type_obs']) == 0
    assert np.all(first['prev_action_obs'] == 0.0)
    step_obs, rewards, terms, truncs, _infos = combat_env.step({'agent_0': np.asarray([1.0, 0.0, 0.0, 1.0, 1.0, 0.0, -1.0, -1.0], dtype=np.float32)})
    stepped = step_obs['agent_0']
    assert rewards['agent_0'] == 0.0
    assert isinstance(terms['agent_0'], bool)
    assert isinstance(truncs['agent_0'], bool)
    assert stepped['prev_action_obs'].tolist() == [1.0, 0.0, 0.0, 1.0, 1.0]
    assert stepped['self_obs'].shape == first['self_obs'].shape
    assert int(stepped['tank_type_obs']) >= 0
    assert stepped['self_obs'][SELF['time_alive_norm']] > first['self_obs'][SELF['time_alive_norm']]
    assert stepped['self_obs'][SELF['reload_cooldown_norm']] >= first['self_obs'][SELF['reload_cooldown_norm']]
finally:
    combat_env.close()

print('combat observation smoke passed')
