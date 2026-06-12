from python.agents import AgentProfile, AgentRoster
from python.pettingzoo_env import DiepCustomParallelEnv, RewardConfig, make_reward_config


def main():
    env = DiepCustomParallelEnv(seed=123, agents=2, max_ticks=4, scenario='rl-grid-smoke')
    try:
        observations, infos = env.reset(seed=123)
        assert env.possible_agents == ['agent_0', 'agent_1']
        assert env.agents == ['agent_0', 'agent_1']
        assert set(observations) == set(env.agents)
        assert set(observations['agent_0']) == {'grid_obs', 'self_obs', 'prev_action_obs', 'tank_type_obs'}
        assert observations['agent_0']['grid_obs'].shape == (18, 21, 21)
        assert observations['agent_0']['self_obs'].shape == (27,)
        assert observations['agent_0']['prev_action_obs'].shape == (5,)
        assert int(observations['agent_0']['tank_type_obs']) == 0
        assert infos['agent_0']['agent_id'] == 0
        first_snapshot = env.snapshot()
        observations, rewards, terminations, truncations, infos = env.step({
            'agent_0': {'move': [1.0, 0.0], 'aim': [1.0, 0.0], 'buttons': [1, 0]},
            # Missing agent_1 is an explicit no-op, not an AI fallback.
        })
        assert rewards == {'agent_0': 0.0, 'agent_1': 0.0}
        assert set(terminations) == {'agent_0', 'agent_1'}
        assert set(truncations) == {'agent_0', 'agent_1'}
        assert infos['agent_0']['tick'] == 1
        assert infos['agent_0']['raw_reward'] == 0.0
        assert first_snapshot['tick'] == 0
        assert env.snapshot()['tick'] == 1
        shaped = DiepCustomParallelEnv(seed=123, agents=2, max_ticks=4, scenario='rl-grid-smoke', reward_fn=lambda _env, _result, _snapshot: {'agent_1': 2.5})
        try:
            shaped.reset(seed=123)
            _obs, shaped_rewards, _terms, _truncs, _infos = shaped.step({})
            assert shaped_rewards == {'agent_0': 0.0, 'agent_1': 2.5}
        finally:
            shaped.close()
        configured = DiepCustomParallelEnv(
            seed=123,
            agents=2,
            max_ticks=1,
            scenario='rl-grid-smoke',
            reward_config={'alive': 0.25, 'death': -1.0, 'truncation': -0.5, 'step': -0.01},
        )
        try:
            configured.reset(seed=123)
            assert configured.set_reward_config(alive=0.25, death=-1.0, truncation=-0.5, step=-0.01) == make_reward_config(alive=0.25, death=-1.0, truncation=-0.5, step=-0.01)
            _obs, configured_rewards, _terms, truncs, infos = configured.step({})
            assert configured_rewards == {'agent_0': -0.26, 'agent_1': -0.26}
            assert infos['agent_0']['reward_components']['alive'] == 1.0
            assert infos['agent_0']['reward_components']['truncation'] == 1.0
            assert infos['agent_0']['reward_config'] == make_reward_config(alive=0.25, death=-1.0, truncation=-0.5, step=-0.01)
            assert all(truncs.values())
        finally:
            configured.close()
        fast = DiepCustomParallelEnv(
            seed=123,
            agents=2,
            max_ticks=1,
            scenario='rl-grid-smoke',
            observation_mode='combat',
            fast_reward_state=True,
            include_snapshot_info=False,
            reward_config={'alive': 0.25, 'truncation': -0.5, 'step': -0.01},
        )
        try:
            observations, _infos = fast.reset(seed=123)
            assert set(observations['agent_0']) == {'grid_obs', 'self_obs', 'prev_action_obs', 'tank_type_obs'}
            _obs, fast_rewards, _terms, _truncs, fast_infos = fast.step({})
            assert fast_rewards == {'agent_0': -0.26, 'agent_1': -0.26}
            assert fast_infos['agent_0']['snapshot'] is None
            assert fast_infos['agent_0']['reward_components']['alive'] == 1.0
        finally:
            fast.close()
        upgrade_ready = DiepCustomParallelEnv(
            seed=123,
            agents=1,
            max_ticks=4,
            scenario='upgrade-ready',
            observation_mode='combat',
            include_snapshot_info=False,
        )
        try:
            observations, _infos = upgrade_ready.reset(seed=123)
            self_obs = observations['agent_0']['self_obs']
            assert self_obs.shape == (27,)
            assert int(observations['agent_0']['tank_type_obs']) == 0
            assert self_obs[1] == 1.0
            assert self_obs[2] == 1.0
            assert self_obs[3] == 1.0
            step_observations, _rewards, _terms, _truncs, _infos = upgrade_ready.step({'agent_0': {'stat_upgrade_choice': 0, 'tank_upgrade_choice': 0}})
            stepped = step_observations['agent_0']
            assert stepped['prev_action_obs'].shape == (5,)
        finally:
            upgrade_ready.close()
        rostered = DiepCustomParallelEnv(
            seed=123,
            agents=4,
            max_ticks=4,
            scenario='upgrade-ready',
            observation_mode='combat',
            include_snapshot_info=False,
            combat_builds=('predator', 'pentashot', 'fighter', 'annihilator'),
        )
        try:
            observations, _infos = rostered.reset(seed=123)
            roster = AgentRoster([
                AgentProfile(key='predator', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
                AgentProfile(key='pentashot', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
                AgentProfile(key='fighter', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
                AgentProfile(key='annihilator', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
            ])
            roster.bind(rostered.possible_agents)
            actions = roster.actions_for(observations, rostered.agents)
            assert actions['agent_0']['buttons'] == [1, 0]
            assert actions['agent_1']['buttons'] == [1, 0]
            assert actions['agent_2']['buttons'] == [1, 0]
            assert actions['agent_3']['buttons'] == [1, 0]
            stepped, _rewards, _terms, _truncs, _infos = rostered.step(actions)
            assert stepped['agent_0']['prev_action_obs'].shape == (5,)
            assert stepped['agent_1']['prev_action_obs'].shape == (5,)
            assert stepped['agent_2']['prev_action_obs'].shape == (5,)
            assert stepped['agent_3']['prev_action_obs'].shape == (5,)
        finally:
            rostered.close()
        terminated = DiepCustomParallelEnv(
            seed=123,
            agents=4,
            max_ticks=200,
            scenario='dense-collision',
            observation_mode='combat',
            include_snapshot_info=False,
        )
        try:
            terminated.reset(seed=123)
            for _ in range(6):
                observations, _rewards, terminations, truncations, _infos = terminated.step({})
            assert all(terminations.values())
            assert all(truncations.values())
            for agent in ('agent_0', 'agent_1', 'agent_2', 'agent_3'):
                assert set(observations[agent]) == {'grid_obs', 'self_obs', 'prev_action_obs', 'tank_type_obs'}
                assert observations[agent]['grid_obs'].shape == (18, 21, 21)
                assert observations[agent]['self_obs'].shape == (27,)
                assert observations[agent]['prev_action_obs'].shape == (5,)
            for legacy_mode in ('grid', 'state', 'grid_hud'):
                try:
                    DiepCustomParallelEnv(observation_mode=legacy_mode)
                except ValueError:
                    pass
                else:
                    raise AssertionError(f'expected {legacy_mode!r} to be rejected')
        finally:
            terminated.close()
        assert make_reward_config(RewardConfig(raw=1.0), step=-0.1) == RewardConfig(raw=1.0, step=-0.1)
    finally:
        env.close()


if __name__ == '__main__':
    main()
