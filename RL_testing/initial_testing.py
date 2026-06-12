# From diepcustom/:  python3 -m RL_testing.initial_testing

import json
from pathlib import Path
import numpy as np

from RL_training import AgentProfile, AgentRoster, DiepCustomParallelEnv


def make_random_controller(_profile):
    def policy(_agent_name, _observation):
        return {
            'move': (float(np.random.randint(-1, 2)), float(np.random.randint(-1, 2))),
            'aim': (float(np.random.randint(-1, 2)), float(np.random.randint(-1, 2))),
            'buttons': (1, 0),
        }

    return policy


PROFILES = [
    AgentProfile(key='predator_alpha', controller_factory=make_random_controller),
    AgentProfile(key='pentashot_bravo', controller_factory=make_random_controller),
    AgentProfile(key='fighter_charlie', controller_factory=make_random_controller),
    AgentProfile(key='annihilator_delta', controller_factory=make_random_controller),
]


env = DiepCustomParallelEnv(
    seed=1,
    agents=len(PROFILES),
    max_ticks=5000,
    reward_config={'score_delta': 0.005,
                   'health_delta': 0.003,
                   'damage_taken': 0.001,
                   'alive': 0.05,
                   'death': -5,
                   'truncation': 1,
                   'step': -0.001},
    scenario='upgrade-ready',   # or 'rl-grid-smoke'
    combat_builds=('predator', 'pentashot', 'fighter', 'annihilator'),
)
roster = AgentRoster(PROFILES)

observations, infos = env.reset(seed=1)
roster.bind(env.possible_agents)
step = 0

while env.agents:
    actions = roster.actions_for(observations, env.agents)
    observations, rewards, terminations, truncations, infos = env.step(actions)
    step += 1
    for agent in observations:
        grid = observations[agent]['grid_obs']
        self_obs = observations[agent]['self_obs']
        health_ratio = self_obs[0]
        profile_key = roster.controller_for(agent).profile.key
        print(f'step {step} {agent} profile={profile_key} center={grid.shape} hp_ratio={health_ratio:.3f} reward={rewards[agent]:.3f}')

print(f'done in {step} steps')
Path(__file__).resolve().parents[1].joinpath('last_snapshot.json').write_text(
    json.dumps(env.snapshot(), indent=2),
    encoding='utf-8',
)
print('wrote diepcustom/last_snapshot.json')
env.close()
