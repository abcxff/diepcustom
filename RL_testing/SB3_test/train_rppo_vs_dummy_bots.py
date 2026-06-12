"""Basic SB3-Contrib RecurrentPPO trainer for one combat agent vs random bots."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from RL_testing.SB3_test.single_agent_vs_bots_env import CombatSB3DummyBotsEnv, DEFAULT_REWARD_CONFIG
from observability.config import ObservabilityConfig
from observability.logging.diep_metrics_callback import DiepMetricsCallback


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Train a single combat-mode RecurrentPPO agent against hardcoded random dummy bots.')
    parser.add_argument('--timesteps', type=int, default=4096, help='timesteps to train on this run')
    parser.add_argument('--seed', type=int, default=1, help='environment and model seed')
    parser.add_argument('--agents', type=int, default=4, help='total agents in the arena including the learner')
    parser.add_argument('--max-ticks', type=int, default=1000, help='episode tick limit')
    parser.add_argument('--scenario', default='upgrade-ready', help='headless scenario name')
    parser.add_argument('--output', default='RL_testing/SB3_test/models/rppo_combat_dummy_bots', help='model output path without .zip')
    parser.add_argument('--save-freq', type=int, default=256, help='checkpoint frequency in environment steps; 0 disables checkpoints')
    parser.add_argument('--no-resume', action='store_true', help='start a fresh model even if output.zip already exists')
    parser.add_argument('--learning-rate', type=float, default=3e-4, help='PPO learning rate')
    parser.add_argument('--n-steps', type=int, default=64, help='rollout steps per update')
    parser.add_argument('--batch-size', type=int, default=64, help='minibatch size')
    parser.add_argument('--bot-fire-probability', type=float, default=0.35, help='dummy bot fire probability')
    parser.add_argument('--bot-alt-fire-probability', type=float, default=0.05, help='dummy bot alt-fire probability')
    parser.add_argument('--progress-bar', action='store_true', help='enable SB3 progress bar when optional deps are installed')
    parser.add_argument('--no-wandb', action='store_true', help='disable Weights & Biases and write JSONL episode logs only')
    parser.add_argument('--wandb-mode', default='offline', choices=('offline', 'online'), help='Weights & Biases mode')
    parser.add_argument('--stats-log-agents', default='agent_0', help='comma-separated agent names to flush from episode stats')
    parser.add_argument('--observability-run-id', default=None, help='explicit observability run id under observability/runs/')
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


def _make_model(args: argparse.Namespace, env: CombatSB3DummyBotsEnv, output: Path):
    from sb3_contrib import RecurrentPPO

    model_path = output.with_suffix('.zip')
    if not args.no_resume and model_path.exists():
        model = RecurrentPPO.load(model_path, env=env)
        print(f'resuming model from {model_path}')
        return model, True

    model = RecurrentPPO(
        'MultiInputLstmPolicy',
        env,
        seed=args.seed,
        verbose=1,
        learning_rate=args.learning_rate,
        n_steps=args.n_steps,
        batch_size=args.batch_size,
    )
    return model, False


def _make_observability_config(args: argparse.Namespace) -> ObservabilityConfig:
    agents = tuple(value.strip() for value in str(args.stats_log_agents).split(',') if value.strip())
    return ObservabilityConfig(
        run_id=args.observability_run_id or ObservabilityConfig().run_id,
        wandb_enabled=not args.no_wandb,
        wandb_mode=args.wandb_mode,
        stats_log_agents=agents or ('agent_0',),
        learner_agent='agent_0',
    )


def _make_callback(args: argparse.Namespace, output: Path):
    from stable_baselines3.common.callbacks import CallbackList, CheckpointCallback

    callbacks = [DiepMetricsCallback(_make_observability_config(args))]
    if args.save_freq > 0:
        checkpoint_dir = output.parent / f'{output.name}_checkpoints'
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        callbacks.append(CheckpointCallback(
            save_freq=args.save_freq,
            save_path=str(checkpoint_dir),
            name_prefix=output.name,
        ))
    return callbacks[0] if len(callbacks) == 1 else CallbackList(callbacks)


def train(args: argparse.Namespace) -> Path:
    try:
        import sb3_contrib  # noqa: F401
    except ImportError as exc:
        raise SystemExit('sb3_contrib is not installed. Install stable-baselines3 and sb3-contrib to run this trainer.') from exc

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    env = make_env(args)
    try:
        model, resumed = _make_model(args, env, output)
        callback = _make_callback(args, output)
        model.learn(
            total_timesteps=args.timesteps,
            progress_bar=args.progress_bar,
            reset_num_timesteps=not resumed,
            callback=callback,
        )
        model.save(output)
    finally:
        env.close()
    return output.with_suffix('.zip')


def main() -> None:
    saved_path = train(parse_args())
    print(f'saved model to {saved_path}')


if __name__ == '__main__':
    main()
