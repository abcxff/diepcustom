from python.agents import AgentProfile, AgentRoster
from python.pettingzoo_env import DiepCustomParallelEnv, RewardConfig, make_reward_config


def main():
    env = DiepCustomParallelEnv(seed=123, agents=2, max_ticks=4, scenario='rl-grid-smoke')
    try:
        observations, infos = env.reset(seed=123)
        assert env.possible_agents == ['agent_0', 'agent_1']
        assert env.agents == ['agent_0', 'agent_1']
        assert set(observations) == set(env.agents)
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
            observation_mode='state',
            fast_reward_state=True,
            include_snapshot_info=False,
            reward_config={'alive': 0.25, 'truncation': -0.5, 'step': -0.01},
        )
        try:
            observations, _infos = fast.reset(seed=123)
            assert observations['agent_0'].shape == (10,)
            _obs, fast_rewards, _terms, _truncs, fast_infos = fast.step({})
            assert fast_rewards == {'agent_0': -0.26, 'agent_1': -0.26}
            assert fast_infos['agent_0']['snapshot'] is None
            assert fast_infos['agent_0']['reward_components']['alive'] == 1.0
        finally:
            fast.close()
        grid_hud = DiepCustomParallelEnv(
            seed=123,
            agents=2,
            max_ticks=4,
            scenario='rl-grid-smoke',
            observation_mode='grid_hud',
            include_snapshot_info=False,
        )
        try:
            observations, _infos = grid_hud.reset(seed=123)
            assert set(observations['agent_0']) == {'grid', 'self', 'progression'}
            assert observations['agent_0']['grid'].shape == (21, 21, 8)
            assert observations['agent_0']['self'].shape == (5,)
            assert set(observations['agent_0']['progression']) == {'level', 'current_tank', 'stats_available', 'can_stat_upgrade', 'can_tank_upgrade', 'stat_levels', 'legal_stat_upgrades', 'legal_tank_upgrades'}
            health_norm, health, max_health, score, alive = observations['agent_0']['self']
            assert alive == 1.0
            assert score >= 0.0
            if max_health > 0.0:
                assert health_norm == health / max_health
            progression = observations['agent_0']['progression']
            assert progression['level'] == 1.0
            assert progression['current_tank'] == 0.0
            assert progression['stats_available'] == 0.0
            assert progression['can_stat_upgrade'] == 0.0
            assert progression['can_tank_upgrade'] == 0.0
            assert progression['stat_levels'].shape == (8,)
            assert progression['legal_stat_upgrades'].shape == (8,)
            assert progression['legal_tank_upgrades'].shape == (6,)
            assert progression['legal_stat_upgrades'].sum() == 0.0
            assert progression['legal_tank_upgrades'].sum() == 0.0
            step_observations, _rewards, _terms, _truncs, _infos = grid_hud.step({'agent_0': {'stat_upgrade_choice': 0, 'tank_upgrade_choice': 0}})
            assert set(step_observations['agent_1']) == {'grid', 'self', 'progression'}
            assert step_observations['agent_1']['self'].shape == (5,)
            assert step_observations['agent_1']['progression']['stat_levels'].shape == (8,)
            assert step_observations['agent_1']['progression']['legal_stat_upgrades'].shape == (8,)
            assert step_observations['agent_1']['progression']['legal_tank_upgrades'].shape == (6,)
        finally:
            grid_hud.close()
        upgrade_ready = DiepCustomParallelEnv(
            seed=123,
            agents=1,
            max_ticks=4,
            scenario='upgrade-ready',
            observation_mode='grid_hud',
            include_snapshot_info=False,
        )
        try:
            observations, _infos = upgrade_ready.reset(seed=123)
            progression = observations['agent_0']['progression']
            assert progression['level'] == 45.0
            assert progression['stats_available'] > 0.0
            assert progression['legal_stat_upgrades'][0] == 1.0
            assert progression['legal_tank_upgrades'][0] == 1.0
            step_observations, _rewards, _terms, _truncs, _infos = upgrade_ready.step({'agent_0': {'stat_upgrade_choice': 0, 'tank_upgrade_choice': 0}})
            stepped = step_observations['agent_0']['progression']
            assert stepped['current_tank'] == 1.0
            assert stepped['stat_levels'][0] == 1.0
        finally:
            upgrade_ready.close()
        rostered = DiepCustomParallelEnv(
            seed=123,
            agents=4,
            max_ticks=4,
            scenario='upgrade-ready',
            observation_mode='grid_hud',
            include_snapshot_info=False,
        )
        try:
            observations, _infos = rostered.reset(seed=123)
            roster = AgentRoster([
                AgentProfile(key='predator', build_name='predator', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
                AgentProfile(key='pentashot', build_name='pentashot', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
                AgentProfile(key='fighter', build_name='fighter', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
                AgentProfile(key='annihilator', build_name='annihilator', controller=lambda _agent, _obs: {'buttons': [1, 0]}),
            ])
            roster.bind(rostered.possible_agents)
            actions = roster.actions_for(observations, rostered.agents)
            assert actions['agent_0']['tank_upgrade_choice'] == 1
            assert actions['agent_1']['tank_upgrade_choice'] == 0
            assert actions['agent_2']['tank_upgrade_choice'] == 3
            assert actions['agent_3']['tank_upgrade_choice'] == 2
            stepped, _rewards, _terms, _truncs, _infos = rostered.step(actions)
            assert stepped['agent_0']['progression']['current_tank'] == 6.0
            assert stepped['agent_1']['progression']['current_tank'] == 1.0
            assert stepped['agent_2']['progression']['current_tank'] == 8.0
            assert stepped['agent_3']['progression']['current_tank'] == 7.0
        finally:
            rostered.close()
        terminated = DiepCustomParallelEnv(
            seed=123,
            agents=4,
            max_ticks=200,
            scenario='dense-collision',
            observation_mode='grid_hud',
            include_snapshot_info=False,
        )
        try:
            terminated.reset(seed=123)
            for _ in range(6):
                observations, _rewards, terminations, truncations, _infos = terminated.step({})
            assert all(terminations.values())
            assert all(truncations.values())
            for agent in ('agent_0', 'agent_1', 'agent_2', 'agent_3'):
                assert set(observations[agent]) == {'grid', 'self', 'progression'}
                assert observations[agent]['grid'].shape == (21, 21, 8)
                assert observations[agent]['self'].shape == (5,)
                assert observations[agent]['self'][-1] == 0.0
                assert observations[agent]['progression']['stat_levels'].shape == (8,)
                assert observations[agent]['progression']['legal_stat_upgrades'].shape == (8,)
                assert observations[agent]['progression']['legal_tank_upgrades'].shape == (6,)
        finally:
            terminated.close()
        assert make_reward_config(RewardConfig(raw=1.0), step=-0.1) == RewardConfig(raw=1.0, step=-0.1)
    finally:
        env.close()


if __name__ == '__main__':
    main()
