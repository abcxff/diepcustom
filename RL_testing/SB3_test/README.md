# SB3 combat testing

`RL_testing/SB3_test/` contains the simplest SB3-focused combat training harness in this repo. It wraps `DiepCustomParallelEnv(observation_mode="combat")`, exposes one Gymnasium/SB3 learner, and drives the other agents with hardcoded random dummy bots.

## Requirements

Install the RL testing extras into the repo virtualenv:

```bash
.venv/bin/python -m pip install -r RL_testing/requirements.txt
```

The current scripts expect `sb3_contrib`, `stable-baselines3`, and `gymnasium` to be importable from `.venv`.

## Files

- `single_agent_vs_bots_env.py` — one controlled combat agent vs random dummy bots
- `dummy_bots.py` — deterministic seeded random-action bots
- `train_rppo_vs_dummy_bots.py` — recurrent PPO training with save/resume support
- `play_saved_model.py` — load a saved recurrent PPO model and run evaluation episodes
- `eval_with_visuals.py` — write eval MP4s + JSON summaries under `observability/runs/<run_id>/`
- `random_dummy_bots_smoke.py` — minimal env smoke test

## Quickstart

Smoke-test the env:

```bash
.venv/bin/python RL_testing/SB3_test/random_dummy_bots_smoke.py
```

Train a recurrent PPO policy:

```bash
.venv/bin/python RL_testing/SB3_test/train_rppo_vs_dummy_bots.py \
  --timesteps 4096 \
  --output RL_testing/SB3_test/models/rppo_combat_dummy_bots
```

The trainer writes the final model to `--output.zip`. If that file already exists, training resumes from it automatically.
Observability is wired in by default with local-first run metadata under `observability/runs/` and W&B defaulting to offline mode; use `--no-wandb` for JSONL-only logging.

To force a fresh model:

```bash
.venv/bin/python RL_testing/SB3_test/train_rppo_vs_dummy_bots.py \
  --timesteps 4096 \
  --output RL_testing/SB3_test/models/rppo_combat_dummy_bots \
  --no-resume
```

## Checkpoints

Use `--save-freq` to write periodic checkpoints during training:

```bash
.venv/bin/python RL_testing/SB3_test/train_rppo_vs_dummy_bots.py \
  --timesteps 4096 \
  --save-freq 256 \
  --output RL_testing/SB3_test/models/rppo_combat_dummy_bots
```

That creates files under:

```text
RL_testing/SB3_test/models/rppo_combat_dummy_bots_checkpoints/
```

Set `--save-freq 0` to disable periodic checkpoints.

## Evaluate a saved model

```bash
.venv/bin/python RL_testing/SB3_test/play_saved_model.py \
  --model RL_testing/SB3_test/models/rppo_combat_dummy_bots.zip \
  --episodes 3
```

By default evaluation uses deterministic actions. Add `--stochastic` to sample from the policy instead.

To render an eval MP4 with overlays:

```bash
.venv/bin/python RL_testing/SB3_test/eval_with_visuals.py \
  --model RL_testing/SB3_test/models/rppo_combat_dummy_bots.zip \
  --episodes 1 \
  --run-id eval-smoke \
  --no-wandb
```

## Notes

- The learner sees the full combat observation dict: `grid_obs`, `self_obs`, and `prev_action_obs`.
- Dummy bots are intentionally weak and random; this harness is for smoke testing and early iteration, not serious benchmarking.
- The environment resumes training from the saved model weights, not from an exact paused simulator state mid-episode.
- `RL_testing/train_recurrent_ppo.py` is still available as the smaller single-agent smoke trainer when you do not need dummy opponents.
