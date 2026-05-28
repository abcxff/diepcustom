from python.pettingzoo_env import DiepCustomParallelEnv


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
    finally:
        env.close()


if __name__ == '__main__':
    main()
