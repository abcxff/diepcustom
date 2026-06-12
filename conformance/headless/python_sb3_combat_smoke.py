from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from sb3_contrib import RecurrentPPO
    from stable_baselines3.common.env_checker import check_env
except ImportError:
    print('skip: stable-baselines3/sb3-contrib not installed')
    raise SystemExit(0)

from RL_testing.sb3_single_agent_env import DEFAULT_REWARD_CONFIG, DiepCustomSB3SingleAgentEnv


def main() -> None:
    env = DiepCustomSB3SingleAgentEnv(
        seed=123,
        max_ticks=16,
        scenario='upgrade-ready',
        reward_config=dict(DEFAULT_REWARD_CONFIG),
        include_snapshot_info=False,
    )
    try:
        check_env(env, warn=True, skip_render_check=True)
        model = RecurrentPPO(
            'MultiInputLstmPolicy',
            env,
            seed=123,
            verbose=0,
            n_steps=8,
            batch_size=8,
            learning_rate=3e-4,
        )
        model.learn(total_timesteps=32)
        observation, _info = env.reset(seed=123)
        action, _state = model.predict(observation, deterministic=True)
        next_observation, reward, terminated, truncated, info = env.step(action)
        assert set(next_observation) == {'grid_obs', 'self_obs', 'prev_action_obs', 'tank_type_obs'}
        assert next_observation['grid_obs'].shape == (18, 21, 21)
        assert next_observation['self_obs'].shape == (27,)
        assert next_observation['prev_action_obs'].shape == (5,)
        assert isinstance(reward, float)
        assert isinstance(terminated, bool)
        assert isinstance(truncated, bool)
        assert isinstance(info, dict)
    finally:
        env.close()
    print('sb3 combat smoke passed')


if __name__ == '__main__':
    main()
