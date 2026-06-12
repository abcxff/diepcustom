"""Run a saved SB3-Contrib RecurrentPPO combat policy against random dummy bots."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from RL_testing.SB3_test.single_agent_vs_bots_env import CombatSB3DummyBotsEnv, DEFAULT_REWARD_CONFIG


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Load a saved RecurrentPPO combat policy and run it against random dummy bots.')
    parser.add_argument('--model', default='RL_testing/SB3_test/models/rppo_combat_dummy_bots.zip', help='path to saved model zip')
    parser.add_argument('--episodes', type=int, default=3, help='number of evaluation episodes')
    parser.add_argument('--seed', type=int, default=1, help='base environment seed')
    parser.add_argument('--agents', type=int, default=4, help='total agents in the arena including the learner')
    parser.add_argument('--max-ticks', type=int, default=1000, help='episode tick limit')
    parser.add_argument('--scenario', default='upgrade-ready', help='headless scenario name')
    parser.add_argument('--bot-fire-probability', type=float, default=0.35, help='dummy bot fire probability')
    parser.add_argument('--bot-alt-fire-probability', type=float, default=0.05, help='dummy bot alt-fire probability')
    parser.add_argument('--stochastic', action='store_true', help='sample actions instead of using deterministic actions')
    return parser.parse_args()


def make_env(args: argparse.Namespace) -> CombatSB3DummyBotsEnv:
    return CombatSB3DummyBotsEnv(
        seed=args.seed,
        agents=args.agents,
        max_ticks=args.max_ticks,
        scenario=args.scenario,
        reward_config=dict(DEFAULT_REWARD_CONFIG),
        include_snapshot_info=False,
        bot_fire_probability=args.bot_fire_probability,
        bot_alt_fire_probability=args.bot_alt_fire_probability,
    )


def run(args: argparse.Namespace) -> None:
    try:
        from sb3_contrib import RecurrentPPO
    except ImportError as exc:
        raise SystemExit('sb3_contrib is not installed in .venv.') from exc

    model_path = Path(args.model)
    if not model_path.exists():
        raise SystemExit(f'model file not found: {model_path}')

    env = make_env(args)
    try:
        model = RecurrentPPO.load(model_path, env=env)
        for episode in range(args.episodes):
            observation, _info = env.reset(seed=args.seed + episode)
            lstm_states = None
            episode_starts = True
            total_reward = 0.0
            steps = 0
            done = False
            while not done:
                action, lstm_states = model.predict(
                    observation,
                    state=lstm_states,
                    episode_start=episode_starts,
                    deterministic=not args.stochastic,
                )
                observation, reward, terminated, truncated, _info = env.step(action)
                total_reward += float(reward)
                steps += 1
                done = bool(terminated or truncated)
                episode_starts = done
            print(f'episode={episode + 1} reward={total_reward:.6f} steps={steps}')
    finally:
        env.close()


def main() -> None:
    run(parse_args())


if __name__ == '__main__':
    main()
