"""Run eval-only playback with overlays and FFmpeg MP4 output."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from types import SimpleNamespace
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from RL_testing.SB3_test.single_agent_vs_bots_env import CombatSB3DummyBotsEnv, DEFAULT_REWARD_CONFIG
from RL_training.rewards import REWARD_FIELDS, weighted_rewards
from observability.config import ObservabilityConfig
from observability.core.metrics_schema import build_episode_payload
from observability.core.stats_bridge import EpisodeStatsSummary
from observability.logging.wandb_logger import WandbLogger
from observability.video.render_grid_obs import render_grid_composite
from observability.video.render_overlay import overlay_frame
from observability.video.video_writer import FfmpegVideoWriter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Render eval episodes with stat overlays and MP4 output.')
    parser.add_argument('--model', default='RL_testing/SB3_test/models/rppo_combat_dummy_bots.zip', help='path to saved model zip')
    parser.add_argument('--episodes', type=int, default=1, help='number of evaluation episodes')
    parser.add_argument('--seed', type=int, default=1, help='base environment seed')
    parser.add_argument('--agents', type=int, default=4, help='total agents in the arena including the learner')
    parser.add_argument('--max-ticks', type=int, default=1000, help='episode tick limit')
    parser.add_argument('--scenario', default='upgrade-ready', help='headless scenario name')
    parser.add_argument('--bot-fire-probability', type=float, default=0.35, help='dummy bot fire probability')
    parser.add_argument('--bot-alt-fire-probability', type=float, default=0.05, help='dummy bot alt-fire probability')
    parser.add_argument('--stochastic', action='store_true', help='sample actions instead of using deterministic actions')
    parser.add_argument('--fps', type=int, default=20, help='output MP4 frames per second')
    parser.add_argument('--run-id', default=None, help='explicit observability run id under observability/runs/')
    parser.add_argument('--wandb-mode', default='offline', choices=('offline', 'online'), help='Weights & Biases mode when enabled')
    parser.add_argument('--no-wandb', action='store_true', help='disable Weights & Biases logging for eval artifacts')
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


def _world_to_frame(history: list[tuple[float, float]], current: tuple[float, float], frame_shape: tuple[int, int, int], *, cell_scale: int = 8, cell_size: float = 100.0) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    cx = frame_shape[1] // 2
    cy = frame_shape[0] // 2
    for x, y in history[-24:]:
        dx = (x - current[0]) / cell_size
        dy = (y - current[1]) / cell_size
        px = int(round(cx + dx * cell_scale))
        py = int(round(cy + dy * cell_scale))
        points.append((px, py))
    return points


def _agent_position(snapshot: dict, agent_id: int) -> tuple[float, float] | None:
    for entity in snapshot.get('entities', ()):  # pragma: no branch - tiny collections here
        if entity.get('kind') == 'agent' and entity.get('id') == agent_id:
            position = entity.get('position') or {}
            return float(position.get('x', 0.0)), float(position.get('y', 0.0))
    return None


def _episode_payload(env: CombatSB3DummyBotsEnv, episode_index: int, total_reward: float, reward_sums: dict[str, float], step_count: int) -> dict:
    row = env.pettingzoo_env._sim.episode_stats_array()[0]
    reward_means = {field: (reward_sums[field] / step_count if step_count > 0 else 0.0) for field in REWARD_FIELDS}
    summary = EpisodeStatsSummary.from_row(
        row,
        episode_id=f'episode_{episode_index:06d}',
        controlled_agent=env.controlled_agent,
        episode_length=step_count,
        total_reward=total_reward,
    )
    return build_episode_payload(summary, reward_sums=reward_sums, reward_means=reward_means, steps_per_second=0.0)


def run(args: argparse.Namespace) -> None:
    try:
        from sb3_contrib import RecurrentPPO
    except ImportError as exc:  # pragma: no cover - runtime guard
        raise SystemExit('sb3_contrib is not installed in .venv.') from exc

    model_path = Path(args.model)
    if not model_path.exists():
        raise SystemExit(f'model file not found: {model_path}')

    observability = ObservabilityConfig(
        run_id=args.run_id or ObservabilityConfig().run_id,
        wandb_enabled=not args.no_wandb,
        wandb_mode=args.wandb_mode,
        stats_log_agents=('agent_0',),
        learner_agent='agent_0',
    )
    logger = WandbLogger(observability)
    logger.start({
        'mode': 'eval',
        'model': str(model_path),
        'scenario': args.scenario,
        'seed': args.seed,
        'agents': args.agents,
        'episodes': args.episodes,
        'reward_config': dict(DEFAULT_REWARD_CONFIG),
    })

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
            reward_sums = {field: 0.0 for field in REWARD_FIELDS}
            trail_world: list[tuple[float, float]] = []
            episode_id = f'episode_{episode:06d}'
            episode_dir = observability.eval_episode_dir(episode_id)
            episode_dir.mkdir(parents=True, exist_ok=True)
            writer: FfmpegVideoWriter | None = None
            try:
                while not done:
                    action, lstm_states = model.predict(
                        observation,
                        state=lstm_states,
                        episode_start=episode_starts,
                        deterministic=not args.stochastic,
                    )
                    observation, reward, terminated, truncated, info = env.step(action)
                    snapshot = env.render()
                    current_position = _agent_position(snapshot, info['agent_id'])
                    if current_position is not None:
                        trail_world.append(current_position)
                    stats_row = env.pettingzoo_env._sim.episode_stats_array()[0]
                    stats_view = SimpleNamespace(
                        level_reached=int(stats_row[11]),
                        score_from_farming=float(stats_row[2]),
                        score_from_pvp=float(stats_row[3]),
                        hit_rate=(0.0 if stats_row[6] <= 0 else float(stats_row[7] / stats_row[6])),
                    )
                    components = dict(info.get('reward_components') or {})
                    weighted = weighted_rewards(env.pettingzoo_env.reward_config, {env.controlled_agent: components})[env.controlled_agent]
                    for field in REWARD_FIELDS:
                        reward_sums[field] += float(components.get(field, 0.0))
                    total_reward += float(weighted if reward is None else reward)
                    steps += 1
                    grid_frame = render_grid_composite(observation['grid_obs'])
                    if writer is None:
                        writer = FfmpegVideoWriter(episode_dir / 'eval.mp4', width=grid_frame.shape[1], height=grid_frame.shape[0], fps=args.fps)
                    trail_frame = _world_to_frame(trail_world, current_position or (0.0, 0.0), grid_frame.shape)
                    frame = overlay_frame(
                        grid_frame,
                        snapshot=snapshot,
                        agent_id=info['agent_id'],
                        prev_action_obs=observation['prev_action_obs'],
                        step_reward=float(reward),
                        total_reward=total_reward,
                        stats=stats_view,
                        trail=trail_frame,
                    )
                    writer.write(frame)
                    done = bool(terminated or truncated)
                    episode_starts = done
                payload = _episode_payload(env, episode, total_reward, reward_sums, steps)
                summary_path = episode_dir / 'episode_summary.json'
                summary_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n')
                if writer is not None:
                    writer.close()
                    logger.log_video('gameplay/eval_video', episode_dir / 'eval.mp4', fps=args.fps)
                print(f'episode={episode + 1} reward={total_reward:.6f} steps={steps} out={episode_dir}')
            finally:
                if writer is not None:
                    writer.close()
    finally:
        logger.finish()
        env.close()


def main() -> None:
    run(parse_args())


if __name__ == '__main__':
    main()
