from python.diep_headless import DiepAction, HeadlessSim, abi_version, action_shape, observation_shape

assert abi_version() == 3
assert action_shape()['fields'] == 8
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
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)
    assert any(v > 0 for v in obs)
    result = sim.step([DiepAction(0, 1.0, 0.0, 1.0, 0.0, 1, 0, 0)])
    assert result['tick'] == 1
    result = sim.step_many([DiepAction(0, 1.0, 0.0, 1.0, 0.0, 0, 0, 0)], 3)
    assert result['tick'] == 4
    sim.reset(123)
    assert sim.snapshot() == snap0

with HeadlessSim(seed=1, agents=4, max_ticks=200, scenario='dense-collision') as sim:
    initial_needed = len(sim.observations())
    assert sim.alive_mask() == [1, 1, 1, 1]
    result = sim.step_many([DiepAction(agent_id, 0.0, 0.0, 1.0, 0.0, 0, 0, 0) for agent_id in sim.agent_ids()], 10)
    assert 6 <= result['tick'] <= 10
    assert sim.alive_mask() == [0, 0, 0, 0]
    padded = sim.observations()
    assert len(padded) == initial_needed == 4 * 21 * 21 * 8
    assert all(value == 0.0 for value in padded)
    try:
        padded_array = sim.observations_array()
        assert padded_array.shape == (4, 21, 21, 8)
        assert padded_array.sum() == 0.0
    except RuntimeError as exc:
        assert 'NumPy' in str(exc)
