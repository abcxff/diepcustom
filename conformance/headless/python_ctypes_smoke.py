from python.diep_headless import DiepAction, HeadlessSim, abi_version, action_shape, observation_shape

assert abi_version() == 6
assert action_shape()['fields'] == 9
assert action_shape()['continuous_count'] == 4
assert observation_shape() == {'rows': 21, 'cols': 21, 'channels': 8, 'layout': 1}

with HeadlessSim(seed=123, agents=1, max_ticks=8, scenario='rl-grid-smoke') as sim:
    assert sim.agent_ids() == [0]
    assert sim.alive_mask() == [1]
    snap0 = sim.snapshot()
    obs = sim.observation(0)
    assert len(obs) == 21 * 21 * 8
    all_obs = sim.observations()
    assert len(all_obs) == 21 * 21 * 8
    assert all_obs == obs
    try:
        obs_array = sim.observations_array()
        assert obs_array.shape == (1, 21, 21, 8)
        assert str(obs_array.dtype) == 'float32'
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
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)
    assert any(v > 0 for v in obs)
    result = sim.step([DiepAction(0, 1.0, 0.0, 1.0, 0.0, 1, 0, -1, -1)])
    assert result['tick'] == 1
    result = sim.step_many([DiepAction(0, 1.0, 0.0, 1.0, 0.0, 0, 0, -1, -1)], 3)
    assert result['tick'] == 4
    sim.reset(123)
    assert sim.snapshot() == snap0

with HeadlessSim(seed=123, agents=1, max_ticks=8, scenario='upgrade-ready') as sim:
    try:
        progression_array = sim.agent_progressions_array()
        assert progression_array.shape == (1, 27)
        assert progression_array[0, 0] == 45.0
        assert progression_array[0, 2] > 0.0
        assert progression_array[0, 13] == 1.0
        assert progression_array[0, 21] == 1.0
        initial_stats_available = progression_array[0, 2]
        sim.step([DiepAction(0, 0.0, 0.0, 1.0, 0.0, 0, 0, 0, -1)])
        progression_array = sim.agent_progressions_array()
        assert progression_array[0, 2] == initial_stats_available - 1.0
        assert progression_array[0, 5] == 1.0
        sim.step([DiepAction(0, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, 0)])
        progression_array = sim.agent_progressions_array()
        assert progression_array[0, 1] == 1.0
        previous_tank = progression_array[0, 1]
        sim.step([DiepAction(0, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, 5)])
        progression_array = sim.agent_progressions_array()
        assert progression_array[0, 1] == previous_tank
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)

with HeadlessSim(seed=1, agents=4, max_ticks=200, scenario='dense-collision') as sim:
    initial_needed = len(sim.observations())
    assert sim.alive_mask() == [1, 1, 1, 1]
    result = sim.step_many([DiepAction(agent_id, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, -1) for agent_id in sim.agent_ids()], 10)
    assert 6 <= result['tick'] <= 10
    assert sim.alive_mask() == [0, 0, 0, 0]
    padded = sim.observations()
    assert len(padded) == initial_needed == 4 * 21 * 21 * 8
    assert all(value == 0.0 for value in padded)
    try:
        padded_array = sim.observations_array()
        assert padded_array.shape == (4, 21, 21, 8)
        assert padded_array.sum() == 0.0
        state_array = sim.agent_states_array()
        assert state_array.shape == (4, 10)
        assert state_array[:, 1].sum() == 0.0
        progression_array = sim.agent_progressions_array()
        assert progression_array.shape == (4, 27)
        assert progression_array[:, 2].sum() == 0.0
        assert progression_array[:, 5:].sum() == 0.0
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)
