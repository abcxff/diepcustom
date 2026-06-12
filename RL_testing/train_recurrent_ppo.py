"""Tiny SB3-Contrib RecurrentPPO smoke trainer for DiepCustom."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sb3_contrib import RecurrentPPO

from RL_testing.sb3_single_agent_env import DEFAULT_REWARD_CONFIG, DiepCustomSB3SingleAgentEnv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Run a minimal RecurrentPPO smoke train against DiepCustom.')
    parser.add_argument('--timesteps', type=int, default=1024, help='total training timesteps')
    parser.add_argument('--seed', type=int, default=1, help='environment and model seed')
    parser.add_argument('--max-ticks', type=int, default=1000, help='episode tick limit')
    parser.add_argument('--scenario', default='rl-grid-smoke', help='headless scenario name')
    parser.add_argument('--output', default='RL_testing/recurrent_ppo_debug_model', help='model output path without .zip')
    parser.add_argument('--learning-rate', type=float, default=3e-4, help='PPO learning rate')
    parser.add_argument('--n-steps', type=int, default=32, help='rollout steps per update')
    parser.add_argument('--batch-size', type=int, default=32, help='minibatch size')
    parser.add_argument('--progress-bar', action='store_true', help='enable SB3 progress bar if optional progress dependencies are installed')
    return parser.parse_args()


def make_env(args: argparse.Namespace) -> DiepCustomSB3SingleAgentEnv:
    return DiepCustomSB3SingleAgentEnv(
        seed=args.seed,
        max_ticks=args.max_ticks,
        scenario=args.scenario,
        reward_config=dict(DEFAULT_REWARD_CONFIG),
        include_snapshot_info=False,
    )


def train(args: argparse.Namespace) -> Path:
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    env = make_env(args)
    try:
        model = RecurrentPPO(
            'MultiInputLstmPolicy',
            env,
            seed=args.seed,
            verbose=1,
            learning_rate=args.learning_rate,
            n_steps=args.n_steps,
            batch_size=args.batch_size,
        )
        model.learn(total_timesteps=args.timesteps, progress_bar=args.progress_bar)
        model.save(output)
    finally:
        env.close()
    return output.with_suffix('.zip')


def main() -> None:
    saved_path = train(parse_args())
    print(f'saved model to {saved_path}')


if __name__ == '__main__':
    main()
