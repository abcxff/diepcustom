from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np

from RL_training import COMBAT_GRID_CHANNELS, CombatObservationBuilder, DiepAction, HeadlessSim

CHANNEL = {name: index for index, name in enumerate(COMBAT_GRID_CHANNELS)}
PROGRESSION_STAT_LEVELS_START = 5
PROGRESSION_LEGAL_STAT_LEVELS_START = 13
PROGRESSION_LEGAL_TANK_LEVELS_START = 21


def progression_dict(row: np.ndarray) -> dict[str, object]:
    return {
        'level': float(row[0]),
        'current_tank': float(row[1]),
        'stats_available': float(row[2]),
        'can_stat_upgrade': float(row[3]),
        'can_tank_upgrade': float(row[4]),
        'stat_levels': row[PROGRESSION_STAT_LEVELS_START:PROGRESSION_LEGAL_STAT_LEVELS_START].astype(np.float32, copy=False),
        'legal_stat_upgrades': row[PROGRESSION_LEGAL_STAT_LEVELS_START:PROGRESSION_LEGAL_TANK_LEVELS_START].astype(np.float32, copy=False),
        'legal_tank_upgrades': row[PROGRESSION_LEGAL_TANK_LEVELS_START:].astype(np.float32, copy=False),
    }


def builder_oracle(sim: HeadlessSim, builder: CombatObservationBuilder, agent_id: int, prev_action):
    snapshot = sim.snapshot()
    states = sim.agent_states_array()
    progressions = sim.agent_progressions_array()
    return builder.build(
        snapshot=snapshot,
        agent_id=agent_id,
        state_row=states[agent_id],
        progression=progression_dict(progressions[agent_id]),
        prev_action=prev_action,
        max_episode_ticks=sim.max_ticks,
    )


def assert_parity(sim: HeadlessSim, builder: CombatObservationBuilder, agent_id: int, prev_action, *, required_channels: tuple[str, ...] = ()):
    oracle = builder_oracle(sim, builder, agent_id, prev_action)
    cpp_grid = sim.combat_observations_array()[agent_id]
    cpp_self = sim.combat_self_observations_array()[agent_id]
    cpp_prev = sim.combat_prev_action_observations_array()[agent_id]
    cpp_tank_type = int(sim.agent_progressions_array()[agent_id, 1])
    np.testing.assert_equal(cpp_grid.shape, oracle['grid_obs'].shape)
    np.testing.assert_equal(cpp_self.shape, oracle['self_obs'].shape)
    np.testing.assert_equal(cpp_prev.shape, oracle['prev_action_obs'].shape)
    np.testing.assert_allclose(cpp_grid, oracle['grid_obs'], rtol=0.0, atol=1e-6)
    np.testing.assert_allclose(cpp_self, oracle['self_obs'], rtol=0.0, atol=1e-6)
    np.testing.assert_allclose(cpp_prev, oracle['prev_action_obs'], rtol=0.0, atol=1e-6)
    assert cpp_tank_type == int(oracle['tank_type_obs'])
    for channel_name in required_channels:
        oracle_cells = np.argwhere(oracle['grid_obs'][CHANNEL[channel_name]] > 0.0)
        cpp_cells = np.argwhere(cpp_grid[CHANNEL[channel_name]] > 0.0)
        assert oracle_cells.size > 0, f'expected oracle occupancy for channel {channel_name}'
        np.testing.assert_array_equal(cpp_cells, oracle_cells)


def main() -> None:
    builder = CombatObservationBuilder()

    with HeadlessSim(seed=123, agents=2, max_ticks=8, scenario='rl-grid-smoke') as sim:
        assert_parity(
            sim,
            builder,
            agent_id=0,
            prev_action=None,
            required_channels=('enemy_presence', 'enemy_health_ratio', 'farmable_presence', 'enemy_type_balanced', 'enemy_type_rammer'),
        )
        step_action = DiepAction(0, 1.0, -1.0, 0.0, 1.0, 1, 0, -1, -1)
        sim.step([step_action, DiepAction(1, 0.0, 0.0, -1.0, 0.0, 0, 0, -1, -1)])
        assert_parity(sim, builder, agent_id=0, prev_action=[1.0, -1.0, 0.0, 1.0, 1.0])

    with HeadlessSim(seed=321, agents=1, max_ticks=8, scenario='upgrade-ready') as sim:
        assert_parity(sim, builder, agent_id=0, prev_action=None)
        upgrade_action = DiepAction(0, -0.25, 0.75, -1.0, 0.5, 0, 0, 0, 0)
        sim.step([upgrade_action])
        assert_parity(sim, builder, agent_id=0, prev_action=[-0.25, 0.75, -1.0, 0.5, 0.0])

    print('combat observation parity passed')


if __name__ == '__main__':
    main()
