import time

from python.diep_headless import DiepAction, HeadlessSim

try:
    import numpy as np
except ImportError:
    np = None


def elapsed_rate(count, started):
    elapsed = max(time.perf_counter() - started, 1e-9)
    return count / elapsed


def make_actions(agent_ids):
    return [DiepAction(agent_id, 0.25, 0.0, 1.0, 0.0, 0, 0, -1, -1) for agent_id in agent_ids]


def main():
    ticks = 1000
    agents = 4
    with HeadlessSim(seed=123, agents=agents, max_ticks=ticks + 10, scenario='agents-no-fire') as sim:
        actions = make_actions(sim.agent_ids())
        started = time.perf_counter()
        for _ in range(ticks):
            sim.step(actions)
        step_rate = elapsed_rate(ticks, started)

    with HeadlessSim(seed=123, agents=agents, max_ticks=ticks + 10, scenario='agents-no-fire') as sim:
        actions = make_actions(sim.agent_ids())
        started = time.perf_counter()
        result = sim.step_many(actions, ticks)
        step_many_rate = elapsed_rate(result['tick'], started)
        assert result['tick'] == ticks

    with HeadlessSim(seed=123, agents=agents, max_ticks=ticks + 10, scenario='agents-no-fire') as sim:
        actions = make_actions(sim.agent_ids())
        if np is not None:
            out = None
            started = time.perf_counter()
            for _ in range(ticks):
                sim.step(actions)
                try:
                    observations = sim.combat_observations_array(out=out)
                except ValueError:
                    out = None
                    observations = sim.combat_observations_array(out=out)
                out = observations
            obs_rate = elapsed_rate(ticks, started)
            assert observations.shape[1:] == (18, 21, 21)
            assert observations.dtype == np.float32
            assert np.isfinite(observations).all()
        else:
            started = time.perf_counter()
            for _ in range(ticks):
                sim.step(actions)
                observations = sim.combat_observations()
            obs_rate = elapsed_rate(ticks, started)
            assert len(observations) == agents * 18 * 21 * 21

    with HeadlessSim(seed=123, agents=agents, max_ticks=ticks + 10, scenario='agents-no-fire') as sim:
        actions = make_actions(sim.agent_ids())
        if np is not None:
            out = None
            started = time.perf_counter()
            for _ in range(ticks):
                sim.step(actions)
                states = sim.agent_states_array(out=out)
                out = states
            state_rate = elapsed_rate(ticks, started)
            assert states.shape == (agents, 10)
            assert states.dtype == np.float32
            assert np.isfinite(states).all()
        else:
            state_rate = 0.0

    print({
        'benchmark': 'python-tickless-training-loop',
        'ticks': ticks,
        'agents': agents,
        'step_ticks_per_second': round(step_rate, 2),
        'step_many_ticks_per_second': round(step_many_rate, 2),
        'step_plus_combat_observations_ticks_per_second': round(obs_rate, 2),
        'step_plus_agent_states_ticks_per_second': round(state_rate, 2),
        'numpy': np is not None,
    })


if __name__ == '__main__':
    main()
