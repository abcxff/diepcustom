"""Minimal example showing automatic upgrades layered onto agent actions.

Run from repo root:

    python3 -m RL_training.auto_upgrade_example
"""

import numpy as np

from RL_training import DiepCustomParallelEnv
from RL_training.auto_upgrade import preset_auto_upgrade_policy


UPGRADE_POLICY = preset_auto_upgrade_policy('predator')


def base_policy(_agent_name, _observation):
    return {
        'move': (float(np.random.uniform(-1.0, 1.0)), float(np.random.uniform(-1.0, 1.0))),
        'aim': (float(np.random.uniform(-1.0, 1.0)), float(np.random.uniform(-1.0, 1.0))),
        'buttons': (1, 0),
    }


def policy(agent_name, observation):
    action = base_policy(agent_name, observation)
    return UPGRADE_POLICY.apply(action, observation['progression'])


def main():
    env = DiepCustomParallelEnv(
        seed=1,
        agents=2,
        max_ticks=128,
        scenario='upgrade-ready',
        observation_mode='grid_hud',
        include_snapshot_info=False,
    )
    observations, _infos = env.reset(seed=1)
    step = 0
    try:
        while env.agents and step < 16:
            actions = {agent: policy(agent, observations[agent]) for agent in env.agents}
            observations, rewards, _terminations, _truncations, _infos = env.step(actions)
            step += 1
            for agent in observations:
                progression = observations[agent]['progression']
                print(
                    f"step={step} {agent} "
                    f"tank={int(progression['current_tank'])} "
                    f"stats={int(progression['stats_available'])} "
                    f"stat0={int(progression['stat_levels'][0])} "
                    f"reward={rewards[agent]:.3f}"
                )
    finally:
        env.close()


if __name__ == '__main__':
    main()
