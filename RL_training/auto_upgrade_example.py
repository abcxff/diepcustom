"""Minimal example showing combat-mode automatic upgrades layered onto agent actions.

Run from repo root:

    python3 -m RL_training.auto_upgrade_example
"""

import numpy as np

from RL_training import DiepCustomParallelEnv


def base_policy(_agent_name, _observation):
    return {
        'move': (float(np.random.uniform(-1.0, 1.0)), float(np.random.uniform(-1.0, 1.0))),
        'aim': (float(np.random.uniform(-1.0, 1.0)), float(np.random.uniform(-1.0, 1.0))),
        'buttons': (1, 0),
    }


def main():
    env = DiepCustomParallelEnv(
        seed=1,
        agents=2,
        max_ticks=128,
        scenario='upgrade-ready',
        include_snapshot_info=False,
        combat_builds=('predator', 'fighter'),
    )
    observations, _infos = env.reset(seed=1)
    step = 0
    try:
        while env.agents and step < 16:
            actions = {agent: base_policy(agent, observations[agent]) for agent in env.agents}
            observations, rewards, _terminations, _truncations, _infos = env.step(actions)
            step += 1
            for agent in observations:
                print(
                    f"step={step} {agent} "
                    f"level_norm={observations[agent]['self_obs'][1]:.3f} "
                    f"prev_fire={int(observations[agent]['prev_action_obs'][-1])} "
                    f"reward={rewards[agent]:.3f}"
                )
    finally:
        env.close()


if __name__ == '__main__':
    main()
