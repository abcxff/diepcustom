from __future__ import annotations

from RL_training.headless import ABI_VERSION, EPISODE_STATS_FIELDS, DiepAction, HeadlessSim, abi_version, episode_stats_shape


def test_episode_stats_shape_matches_abi():
    assert ABI_VERSION == 10
    assert abi_version() == 10
    shape = episode_stats_shape()
    assert shape['fields'] == len(EPISODE_STATS_FIELDS) == 14
    assert shape['field_names'] == EPISODE_STATS_FIELDS


def test_episode_stats_reset_and_shots_fired():
    with HeadlessSim(seed=123, agents=1, max_ticks=8, scenario='rl-grid-smoke') as sim:
        initial = sim.episode_stats_array()
        assert initial.shape == (1, len(EPISODE_STATS_FIELDS))
        assert float(initial[0, 6]) == 0.0
        sim.step([DiepAction(0, 1.0, 0.0, 1.0, 0.0, 1, 0, -1, -1)])
        after_fire = sim.episode_stats_array()
        assert float(after_fire[0, 0]) == 1.0
        assert float(after_fire[0, 6]) == 1.0
        sim.reset(123)
        reset = sim.episode_stats_array()
        assert float(reset[0, 0]) == 0.0
        assert float(reset[0, 6]) == 0.0


def test_episode_stats_damage_death_and_sim_isolation():
    with HeadlessSim(seed=1, agents=4, max_ticks=200, scenario='dense-collision') as dense_a, \
         HeadlessSim(seed=1, agents=4, max_ticks=200, scenario='dense-collision') as dense_b:
        idle = [DiepAction(agent_id, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, -1) for agent_id in dense_a.agent_ids()]
        dense_a.step_many(idle, 10)
        stats_a = dense_a.episode_stats_array()
        stats_b = dense_b.episode_stats_array()
        assert float(stats_a[:, 9].sum()) == 4.0
        assert float(stats_a[:, 4].sum()) > 0.0
        assert float(stats_a[:, 5].sum()) > 0.0
        assert float(stats_b[:, 9].sum()) == 0.0
        assert float(stats_b[:, 4].sum()) == 0.0
        assert float(stats_b[:, 5].sum()) == 0.0
