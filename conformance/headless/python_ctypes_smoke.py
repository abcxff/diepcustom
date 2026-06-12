from python.diep_headless import (
    ABI_VERSION,
    DiepAction,
    EPISODE_STATS_FIELDS,
    HeadlessSim,
    abi_version,
    action_shape,
    combat_observation_shape,
    combat_prev_action_shape,
    combat_self_shape,
    episode_stats_shape,
)

assert ABI_VERSION == 10
assert abi_version() == 10
assert action_shape()['fields'] == 9
assert action_shape()['continuous_count'] == 4
assert combat_observation_shape() == {'channels': 18, 'rows': 21, 'cols': 21, 'layout': 2}
assert combat_self_shape() == {'agents': None, 'fields': 27}
assert combat_prev_action_shape() == {'agents': None, 'fields': 5}
assert episode_stats_shape() == {'agents': None, 'fields': len(EPISODE_STATS_FIELDS), 'field_names': EPISODE_STATS_FIELDS}

with HeadlessSim(seed=123, agents=1, max_ticks=8, scenario='rl-grid-smoke') as sim:
    assert sim.agent_ids() == [0]
    assert sim.alive_mask() == [1]
    snap0 = sim.snapshot()
    combat_obs = sim.combat_observation(0)
    assert len(combat_obs) == 18 * 21 * 21
    combat_self = sim.combat_self_observation(0)
    assert len(combat_self) == 27
    assert combat_self[0] == 1.0
    combat_prev = sim.combat_prev_action_observation(0)
    assert combat_prev == [0.0] * 5
    episode_stats = sim.episode_stats()
    assert len(episode_stats) == len(EPISODE_STATS_FIELDS)
    assert episode_stats[0] == 0.0
    assert episode_stats[11] == 1.0
    assert episode_stats[12] == 0.0
    assert episode_stats[13] == 0.0
    try:
        combat_obs_array = sim.combat_observations_array()
        assert combat_obs_array.shape == (1, 18, 21, 21)
        assert str(combat_obs_array.dtype) == 'float32'
        state_array = sim.agent_states_array()
        assert state_array.shape == (1, 10)
        assert str(state_array.dtype) == 'float32'
        assert state_array[0, 0] == 0.0
        assert state_array[0, 1] == 1.0
        assert state_array[0, 6] > 0.0
        progression_array = sim.agent_progressions_array()
        assert progression_array.shape == (1, 27)
        assert str(progression_array.dtype) == 'float32'
        assert progression_array[0, 0] == 1.0
        assert progression_array[0, 1] == 0.0
        assert progression_array[0, 2] == 0.0
        assert progression_array[0, 3] == 0.0
        assert progression_array[0, 4] == 0.0
        assert progression_array[0, 5:].sum() == 0.0
        combat_self_array = sim.combat_self_observations_array()
        assert combat_self_array.shape == (1, 27)
        assert combat_self_array[0, 0] == 1.0
        combat_prev_array = sim.combat_prev_action_observations_array()
        assert combat_prev_array.shape == (1, 5)
        assert combat_prev_array[0].tolist() == [0.0] * 5
        episode_stats_array = sim.episode_stats_array()
        assert episode_stats_array.shape == (1, len(EPISODE_STATS_FIELDS))
        assert str(episode_stats_array.dtype) == 'float64'
        assert episode_stats_array[0, 13] == 0.0
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)
    assert any(v > 0 for v in combat_obs)
    result = sim.step([DiepAction(0, 1.0, 0.0, 1.0, 0.0, 1, 0, -1, -1)])
    assert result['tick'] == 1
    assert sim.combat_prev_action_observation(0) == [1.0, 0.0, 1.0, 0.0, 1.0]
    episode_stats = sim.episode_stats()
    assert episode_stats[0] == 1.0
    assert episode_stats[6] == 1.0
    result = sim.step_many([DiepAction(0, 1.0, 0.0, 1.0, 0.0, 0, 0, -1, -1)], 3)
    assert result['tick'] == 4
    sim.reset(123)
    assert sim.snapshot() == snap0
    assert sim.combat_prev_action_observation(0) == [0.0] * 5
    assert sim.episode_stats()[6] == 0.0

with HeadlessSim(seed=123, agents=1, max_ticks=8, scenario='upgrade-ready') as sim:
    try:
        progression_array = sim.agent_progressions_array()
        assert progression_array.shape == (1, 27)
        assert progression_array[0, 0] == 45.0
        assert progression_array[0, 2] > 0.0
        assert progression_array[0, 13] == 1.0
        assert progression_array[0, 21] == 1.0
        combat_self_array = sim.combat_self_observations_array()
        assert combat_self_array.shape == (1, 27)
        assert combat_self_array[0, 1] == 1.0
        assert combat_self_array[0, 2] == 1.0
        assert combat_self_array[0, 3] == 1.0
        assert combat_self_array[0, 9] == 0.0
        initial_stats_available = progression_array[0, 2]
        sim.step([DiepAction(0, 0.0, 0.0, 1.0, 0.0, 0, 0, 0, -1)])
        progression_array = sim.agent_progressions_array()
        assert progression_array[0, 2] == initial_stats_available - 1.0
        assert progression_array[0, 5] == 1.0
        sim.step([DiepAction(0, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, 0)])
        progression_array = sim.agent_progressions_array()
        assert progression_array[0, 1] == 1.0
        episode_stats_array = sim.episode_stats_array()
        assert episode_stats_array[0, 12] == 1.0
        assert episode_stats_array[0, 13] > 0.0
        previous_tank = progression_array[0, 1]
        sim.step([DiepAction(0, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, 5)])
        progression_array = sim.agent_progressions_array()
        assert progression_array[0, 1] == previous_tank
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)

with HeadlessSim(seed=1, agents=4, max_ticks=200, scenario='dense-collision') as sim:
    initial_needed = len(sim.combat_observations())
    assert sim.alive_mask() == [1, 1, 1, 1]
    result = sim.step_many([DiepAction(agent_id, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, -1) for agent_id in sim.agent_ids()], 10)
    assert 6 <= result['tick'] <= 10
    assert sim.alive_mask() == [0, 0, 0, 0]
    padded_combat = sim.combat_observations()
    assert len(padded_combat) == 4 * 18 * 21 * 21
    assert len(padded_combat) == initial_needed
    assert all(value == 0.0 for value in padded_combat)
    episode_stats = sim.episode_stats()
    assert len(episode_stats) == 4 * len(EPISODE_STATS_FIELDS)
    death_count_sum = sum(episode_stats[index] for index in range(9, len(episode_stats), len(EPISODE_STATS_FIELDS)))
    damage_dealt_sum = sum(episode_stats[index] for index in range(4, len(episode_stats), len(EPISODE_STATS_FIELDS)))
    damage_taken_sum = sum(episode_stats[index] for index in range(5, len(episode_stats), len(EPISODE_STATS_FIELDS)))
    assert death_count_sum == 4.0
    assert damage_dealt_sum > 0.0
    assert damage_taken_sum > 0.0
    try:
        padded_combat_array = sim.combat_observations_array()
        assert padded_combat_array.shape == (4, 18, 21, 21)
        assert padded_combat_array.sum() == 0.0
        state_array = sim.agent_states_array()
        assert state_array.shape == (4, 10)
        assert state_array[:, 1].sum() == 0.0
        progression_array = sim.agent_progressions_array()
        assert progression_array.shape == (4, 27)
        assert progression_array[:, 2].sum() == 0.0
        assert progression_array[:, 5:].sum() == 0.0
        combat_self_array = sim.combat_self_observations_array()
        assert combat_self_array.shape == (4, 27)
        assert combat_self_array[:, 0].sum() == 0.0
        combat_prev_array = sim.combat_prev_action_observations_array()
        assert combat_prev_array.shape == (4, 5)
        episode_stats_array = sim.episode_stats_array()
        assert episode_stats_array.shape == (4, len(EPISODE_STATS_FIELDS))
        assert episode_stats_array[:, 9].sum() == 4.0
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)
