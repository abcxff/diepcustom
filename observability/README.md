# Diep.io RL Observability

Observability for headless DiepCustom RL training. **Two deliverables, one stats core:**

| Deliverable | What you get | When |
| --- | --- | --- |
| **Logged stats** | Curves and tables over many runs (W&B local/online, or JSONL fallback) | Every training run — “is learning / reward shaping working?” |
| **Watchable playback** | Eval MP4 with grid heatmaps + stat overlays + sidecar JSON | On demand — “what did the agent actually do this episode?” |

Training stays fast: only cheap C++ counters run every step. Video never runs inside the training hot loop.

**Stack context:** C++ sim → ctypes C ABI → PettingZoo → SB3 RecurrentPPO (`RL_testing/SB3_test/`). This package extends that stack; it does not replace the sim.

---

## Architecture

```text
                 ┌──────────────────────────────────────┐
                 │  core — C++ EpisodeStats (always on) │
                 │  + combat obs (eval overlays only)   │
                 └──────────────────┬───────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
   logging pipeline                              video pipeline
   (every training run)                          (eval script only)
            │                                               │
   DiepMetricsCallback                          eval_with_visuals.py
   → W&B offline/online                         → OpenCV + FFmpeg
   → episode scalars + reward components        → MP4 + episode_summary.json
```

Both pipelines read the **same** `EpisodeStats` and (for video) the same combat observation the policy sees.

---

## Package layout

```text
diepcustom/observability/
  README.md                 # this file
  __init__.py
  config.py                 # ObservabilityConfig (wandb mode, agents, paths)
  requirements-extras.txt

  core/
    metrics_schema.py       # field names, W&B keys, EpisodeStats C++ layout
    observation_schema.py   # combat obs re-exports + channel helpers
    stats_bridge.py         # C++ buffer → EpisodeStatsSummary dataclass

  logging/
    wandb_logger.py         # wandb init, scalar helpers (local-first)
    diep_metrics_callback.py  # SB3 BaseCallback — main training integration

  video/
    render_grid_obs.py      # grid_obs channel composites
    render_overlay.py       # trajectory, aim, on-screen stat text
    video_writer.py         # FFmpeg encode, bounded queue

  tests/
    test_episode_stats.py
    test_reward_components.py   # integration: env + reward_config + logging
    test_observation_shapes.py

  runs/
    benchmarks.md
    <run_id>/
      episodes.jsonl          # one JSON line per episode (logging fallback)
      eval/
        <episode_id>/
          eval.mp4
          episode_summary.json
```

**Outside this package (thin wiring only):**

| Path | Role |
| --- | --- |
| `diepcustom/cpp/` | `EpisodeStats` counters + C ABI export (ABI v9) |
| `diepcustom/RL_training/headless.py` | ctypes + `episode_stats_array()` |
| `diepcustom/RL_training/pettingzoo_env.py` | Combat obs; optional `enable_episode_stats` later |
| `diepcustom/RL_training/observations/combat.py` | Schema source of truth for `grid_obs` channels |
| `diepcustom/RL_testing/SB3_test/train_rppo_vs_dummy_bots.py` | Wires `DiepMetricsCallback` |
| `diepcustom/RL_testing/SB3_test/eval_with_visuals.py` | **Planned** — video pipeline entry point |

**Imports** (add `diepcustom/` to `PYTHONPATH`, already done in SB3_test scripts):

```python
from observability.config import ObservabilityConfig
from observability.logging.diep_metrics_callback import DiepMetricsCallback
from observability.core.stats_bridge import EpisodeStatsSummary
```

---

## Module: `core`

### Purpose

Per-agent combat counters updated inside the C++ sim hot loop. One ABI read per agent per episode boundary — never per step.

### C++ `EpisodeStats` (per slot, reset on `diep_reset`)

| Field | Meaning |
| --- | --- |
| `lifetime_steps` | Ticks alive |
| `score_total` | Final score |
| `score_from_farming` | Score from shape kills |
| `score_from_pvp` | Score from agent kills |
| `damage_dealt`, `damage_taken` | Combat damage totals |
| `shots_fired`, `shots_hit` | Fire and hit counts |
| `kills`, `death_count` | Kill count; 0/1 died this episode |
| `death_cause` | Enum: projectile, collision, boundary, unknown, … |
| `level_reached`, `tank_class` | Progression at flush |
| `upgrade_choices` | Packed stat/tank upgrades applied |

**Hook points in `headless.cpp`:** `fireProjectile`, `receiveDamage`, kill branch, `tryApplyStatUpgrade`, `tryApplyTankUpgradeSlot`.

**ABI:** bump v8 → v9; add `diep_episode_stats_fields()` and `diep_episode_stats(sim, buf, len)`.

### Python `EpisodeStatsSummary`

Wraps C++ row + callback-only fields:

- `episode_id`, `controlled_agent`, `total_reward` (rollout sum)
- `hit_rate` = `shots_hit / max(1, shots_fired)`
- `farm_vs_pvp_ratio` = farm / (farm + pvp)

`stats_bridge.py` + `metrics_schema.py` own field names and W&B keys.

---

## Module: `logging`

### Purpose

Log combat outcomes and reward-shaping signals across **many episodes** so you can compare runs — especially when tuning `reward_config`.

### `DiepMetricsCallback`

Reads `episode_stats_array()` on episode end (via `env.unwrapped._sim` or `info['episode_stats']` when env hook is enabled). Accumulates per-step `info['reward_components']` during the episode; logs **episode sums and means** at flush — never per-step W&B scalars for each component.

### W&B metrics (primary dashboard)

**Training**

| Key | Source |
| --- | --- |
| `train/episode_reward` | Callback rollout sum |
| `train/episode_length` | Steps this episode |
| `train/policy_entropy` | SB3 logger |
| `train/explained_variance` | SB3 logger |

**Combat** (from `EpisodeStats`)

| Key | Source |
| --- | --- |
| `game/hit_rate` | Derived |
| `game/kills` | `kills` |
| `game/level_reached` | `level_reached` |
| `game/farm_score` | `score_from_farming` |
| `game/pvp_score` | `score_from_pvp` |
| `game/damage_dealt`, `game/damage_taken` | C++ counters |
| `game/death_cause` | Categorical |

**Reward shaping** (from `reward_components` in `info`, requires `reward_config` on env)

| Key | Source |
| --- | --- |
| `reward/score_delta_sum`, `reward/score_delta_mean` | Per-episode aggregate |
| `reward/damage_taken_sum`, `reward/death_sum`, … | One pair per `RewardConfig` field |
| `reward/score_delta_fraction` | `score_delta_sum / episode_reward` (detect score-dominated shaping) |

**Environment**

| Key | Source |
| --- | --- |
| `env/steps_per_second` | Wall clock |

### Run config logging

At run start, log full **`reward_config`** (and scenario, seed, agents) to W&B config and/or `runs/<run_id>/config.json` so reward sweeps are comparable.

### JSONL fallback

When `--no-wandb`, append one JSON object per episode to `runs/<run_id>/episodes.jsonl` with the same fields as the W&B log payload.

### CLI flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--no-wandb` | off | Skip W&B; use JSONL only |
| `--wandb-mode` | `offline` | `offline` (local) or `online` |
| `--stats-log-agents` | learner only | e.g. `agent_0` or `agent_0,agent_1,agent_2,agent_3` |

C++ maintains counters for **all** slots; Python filters at flush time by `stats_log_agents`.

### Episode boundary (SB3 dummy-bots harness)

Flush stats when the **controlled agent** `terminated` or `truncated`, or on `reset()`. Global C++ `done` (all dead or max ticks) is not the only signal — learner death ends the SB3 episode while other bots may still be alive.

---

## Module: `video`

### Purpose

Make stats and perception **visible** for one episode. Primary human debug tool; complements W&B curves.

### Entry point

`RL_testing/SB3_test/eval_with_visuals.py` — loads a saved checkpoint, runs N eval episodes, writes MP4 + JSON. **Not imported by the training script.**

### Frame content

**From `grid_obs` channels** (`RL_training/observations/combat.py` → `COMBAT_GRID_CHANNELS`):

- `enemy_presence` + `enemy_threat`
- `projectile_presence`
- `farmable_presence` + `farmable_value`
- `wall` (context)

**Overlays**

- Position trail, aim vector, fire indicator (from `prev_action_obs` — current-tick applied action; see below)
- On-screen text: tick, health, level, step reward, cumulative reward
- Running totals: farm/pvp score, hit rate (from same C++ counters as logging)

### Outputs per eval episode

```text
observability/runs/<run_id>/eval/<episode_id>/
  eval.mp4
  episode_summary.json    # same EpisodeStats + reward component sums as W&B row
```

Upload `eval.mp4` to W&B as `gameplay/eval_video` when W&B is enabled.

**Speed rule:** bounded encode queue; drop frames if FFmpeg falls behind. Zero impact on training throughput.

---

## Reward function optimization workflow

This plan is designed for iterating on `reward_config` (see `DEFAULT_REWARD_CONFIG` in `sb3_single_agent_env.py`).

```text
1. Set reward_config on env
2. Train with logging on (W&B offline or JSONL)
3. Compare runs on:
   - train/episode_reward
   - reward/* component sums and fractions
   - game/farm_score vs game/pvp_score, hit_rate, episode_length
4. Shortlist runs that look best OR suspicious (high reward, low survival, etc.)
5. eval_with_visuals.py on those checkpoints → MP4 + episode_summary.json
6. Adjust weights; repeat
```

**Why both pipelines matter:** shaped reward can rise while behavior worsens (reward hacking). Logging `game/*` alongside `reward/*` catches that; video explains *how* on a single episode.

---

## Combat observation (shared with policy)

Video overlays and future health checks use the **same** combat dict as SB3 `MultiInputLstmPolicy`:

| Key | Shape | Notes |
| --- | --- | --- |
| `grid_obs` | `(18, 21, 21)` | Channel-first float32 |
| `self_obs` | `(27,)` | Health, level, movement, stats, derived stats, recent damage |
| `prev_action_obs` | `(5,)` | Gym key name; holds **current-tick** applied action |
| `tank_type_obs` | scalar | Exact current tank enum ID; unknown/default fallback is 56 |
| `applied_action_obs` | `(5,)` | Optional alias (same buffer as `prev_action_obs`) |

Schema: `RL_training/observations/combat.py`. Helpers: `core/observation_schema.py`.

Auxiliary buffers for overlays (not policy input): `agent_states_array` `(agents, 10)` for world x/y.

---

## `ObservabilityConfig`

Single config object for trainers and eval script:

```python
@dataclass
class ObservabilityConfig:
    enabled: bool = True
    wandb_mode: str = "offline"       # off | offline | online
    stats_log_agents: tuple[str, ...] = ("agent_0",)
    run_id: str | None = None
    runs_dir: Path = Path("observability/runs")
```

Video pipeline reads the same config for output paths; it does not run during training.

---

## Risks & implementation notes

Guardrails for Milestones A–C. Read this before touching C++ counters, the callback, or the video writer.

### Parallel environments (VecEnv)

**Today:** training uses a **single** `CombatSB3DummyBotsEnv` — no `SubprocVecEnv` or `DummyVecEnv`. Concurrent multi-env corruption is not an active risk yet.

**When vectorizing**, each sub-environment must own an isolated C++ handle:

| VecEnv type | Requirement |
| --- | --- |
| `DummyVecEnv` | N env objects in one process → N separate `HeadlessSim` instances, each with its own `diep_sim*` |
| `SubprocVecEnv` | One `diep_sim*` per subprocess; prefer **spawn** over fork on macOS if dylib state causes issues |

**VecEnv checklist**

- [ ] One `diep_create` / `diep_destroy` pair per sub-env — never share a `HeadlessSim` across workers
- [ ] `EpisodeStats` buffer lives **inside** `Simulation` (or `diep_sim`), not in static/global memory
- [ ] Callback logs per-env stats keyed by sub-env id when VecEnv is enabled
- [ ] No cross-env reads of `_sim` without indexing through `VecEnv.get_attr` / per-env unwrapped handles

### C++ ABI memory isolation (current model)

Isolation is **per opaque `diep_sim*` handle**, not process-global:

```text
diep_create()  →  new diep_sim { unique_ptr<Simulation>, rewards, snapshot }
diep_step(sim, …) / diep_agent_states(sim, …)  →  all state on that handle
HeadlessSim.handle  →  one ctypes pointer per Python env wrapper
```

`load_library()` caches the shared `.dylib` in `_LIB`; that is the library loader only — sim state stays on each handle. **EpisodeStats (v9)** must follow the same pattern: fixed array per sim, exported via `diep_episode_stats(sim, buf, len)` like `diep_agent_states`.

**C++ memory management**

- Pre-allocate one `EpisodeStats` struct (or `[max_agents]` row array) per sim at `diep_create` / `Simulation` construction
- Zero counters on `diep_reset` with `memset` or field-wise clear — **no per-episode heap allocation**
- Avoid fragmentation and GC-adjacent pauses from churning temporary buffers in the hot loop

### Reward logic (no duplication)

| Layer | Responsibility |
| --- | --- |
| C++ | Raw counters only (`shots_fired`, `damage_dealt`, `score_from_farming`, …) |
| Python env | Per-step `info['reward_components']` from `reward_config` (`rewards.py`) |
| Callback | Episode **sums and means** of `reward_components` at flush — never mirror `RewardConfig` in C++ |

If reward weights live in Python but aggregates are computed in C++, configs will drift. **Do not** add shaped reward math to `headless.cpp` for observability.

### Callback I/O (avoid training stalls)

`DiepMetricsCallback` must not block the env step loop:

- **No network or disk I/O on every `step()`** — accumulate `reward_components` in memory during the episode
- **Flush at episode boundary only** (controlled agent `terminated` / `truncated`, or `reset()`)
- **Batch** one `wandb.log` payload per episode (or per rollout), not per scalar per step
- Initialize W&B with background sync where possible (`wandb.init` + default async upload); JSONL append is also episode-boundary only

With a single env and episode-boundary logging, C++ throughput should stay within the **< 2%** regression target. Per-step W&B scalars for each reward component are explicitly out of scope.

### Video pipeline optimizations

Eval-only; zero training impact.

- **FFmpeg stdin piping:** pipe raw RGB NumPy frames into an `ffmpeg` subprocess stdin instead of OpenCV `VideoWriter` or intermediate frame files — OpenCV heatmaps are CPU-bound; avoid double encode paths
- **Bounded queue:** if FFmpeg falls behind, **drop frames** rather than blocking the eval loop (already the speed rule in `video/`)
- Prefer subprocess encode over writing PNG sequences to disk

### Optional / deferred metrics

**Action oscillation** (direction sign-flip rate per slot) is a cheaper thrashing signal than per-step policy entropy. Not in MVP. Options when needed:

- Derive coarse oscillation from `prev_action_obs` in **eval only** (Python)
- Add a single counter in C++ on direction/aim sign changes (ABI v9+ or later)

---

## Implementation milestones

```text
Milestone A — core
  C++ EpisodeStats + ABI v9
  headless.py episode_stats_array()
  core/metrics_schema.py, core/stats_bridge.py
  tests/test_episode_stats.py

Milestone B — logging
  logging/diep_metrics_callback.py
  logging/wandb_logger.py + JSONL fallback
  Wire train_rppo_vs_dummy_bots.py (CLI flags)
  tests/test_reward_components.py

Milestone C — video
  video/render_*.py, video/video_writer.py
  eval_with_visuals.py
  episode_summary.json beside eval.mp4
  Optional W&B video upload

Milestone D — glue (optional)
  Upload eval artifacts linked to training run id
  enable_episode_stats on pettingzoo_env (lazy import)
  applied_action_obs alias in observation dict

Deferred (separate PRs, not blocking MVP):
  Full step traces (old “Layer 2”), Parquet, replay loader
  Automated failure sampler (use manual eval first)
  Zero-copy observations (after health checks; pybind11 only if <20% FPS gain)
  C++ DebugEventBuffer, Tracy/perf profiling
```

### MVP success

1. Train with logging → W&B offline or `episodes.jsonl` shows reward, combat stats, and reward component aggregates.
2. Run eval script → MP4 shows grid + overlays; `episode_summary.json` matches logged stats for that episode.
3. `python_training_benchmark.py` shows **< 2%** regression with logging on (video not measured during training).

### Baseline benchmark (before and after each milestone)

```bash
cd diepcustom
npm run test:cpp
.venv/bin/python conformance/headless/python_training_benchmark.py
.venv/bin/python RL_testing/SB3_test/train_rppo_vs_dummy_bots.py \
  --timesteps 4096 --no-resume
```

Record results in `observability/runs/benchmarks.md` (date, git SHA, ticks/sec, SB3 wall-clock).

### Dependencies

```bash
.venv/bin/python -m pip install -r observability/requirements-extras.txt
```

MVP: `wandb`, `pytest`. After Milestone C: uncomment `opencv-python`, `imageio`, `imageio-ffmpeg` in `requirements-extras.txt`.

---

## Locked decisions

| Topic | Decision |
| --- | --- |
| Package path | `diepcustom/observability/` |
| Action obs | Keep `prev_action_obs` for SB3; add `applied_action_obs` alias when Milestone D lands |
| Env hook | Optional later (`enable_episode_stats`); v1 callback reads `_sim` directly |
| Traces | No full step traces in MVP; video + episode summary instead |
| pybind11 | Only if zero-copy ctypes misses **≥ 20%** env FPS on observation benchmark |
| W&B | Local-first (`offline` default); `--no-wandb` always available |
| TensorBoard | No |
| Eval visuals | OpenCV primary |
| Multi-agent logging | `stats_log_agents` filters which slots get flushed |
| Profiling | Python benchmarks for now; C++ profilers optional later |
| VecEnv | Not used today; when added, one `diep_sim*` per sub-env (see Risks) |
| Reward aggregates | Python callback only; C++ exports raw counters |
| Callback I/O | Episode-boundary batch log; no per-step W&B |
| Video encode | FFmpeg stdin pipe; drop frames if queue backs up |
| EpisodeStats alloc | Pre-allocate per sim; zero on `diep_reset` |

---

## Out of scope (for now)

- Video or rendering during training hot loop
- Per-step full JSON world snapshots (`include_snapshot_info=False` stays default)
- Dense reward shaping inside C++
- Parquet / DuckDB / automated replay bundles
- Offscreen OpenGL / EGL render pipeline in C++

---

## Deferred reference

Items above marked **Deferred** are documented here so they are not lost, but they are **not** part of the execution path for logged stats + eval video. Revisit when MVP is shipped and a concrete need appears (e.g. bulk run diff without video, or env FPS still too low after zero-copy).
