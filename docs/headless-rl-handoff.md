# Headless RL Environment Handoff

Last updated: 2026-05-27

## Goal

Convert the C++ headless DiepCustom simulator into a practical, fast, deterministic multi-agent RL environment while preserving full-world parity as the source of truth.

The current target is **multi-agent training through Python PettingZoo ParallelEnv + ctypes C ABI**, not a single-agent Gymnasium wrapper. Rewards are intentionally left to external trainer code.

## User constraints to preserve

- Do **not** tamper with AI actions or inject internal autopilot behavior for controlled agents.
- PettingZoo/manual trainer code owns the actions.
- Do **not** add dense reward shaping inside the environment.
- Multi-agent training is the target API shape.
- Full-world parity remains the debugging ground truth.
- No new third-party C++ dependencies.
- Python packaging is not in scope yet; local wrapper/smoke tests are enough for now.

## Current implementation state

### C++ headless simulator

Core files:

- `cpp/include/diepcustom/headless.hpp`
- `cpp/src/headless.cpp`
- `cpp/tools/headless_main.cpp`
- `cpp/tests/headless_smoke_test.cpp`

Implemented capabilities:

- Deterministic seeded simulator core.
- Multi-agent action stepping.
- `Simulation::stepMany(...)` for tickless/batched stepping.
- Full-world JSON snapshots for parity/debugging.
- Local observation grids: `21 x 21 x 8`, channel-last float32 layout.
- Batched fixed-slot observations padded to `(max_possible_agents, 21, 21, 8)`.
- Dead/inactive agent observation slots are zero-filled.
- Separate alive mask tracks which possible-agent slots are currently live.

Important behavior:

- `agentIds_` is live/current agents.
- `possibleAgentIds_` is the fixed episode slot order created at reset/spawn time.
- `writeObservations(...)` now uses `possibleAgentIds_`, not live `agentIds_`, so tensor shape does not shrink mid-episode.
- `writeAliveMask(...)` returns one `int` per possible agent: `1 = alive`, `0 = terminated/dead`.

### C ABI

Core files:

- `cpp/include/diepcustom/headless_c_api.h`
- `cpp/src/headless_c_api.cpp`
- `cpp/tests/headless_c_api_smoke_test.cpp`

Current ABI version: **6**.

Public additions/progress:

- `diep_step_many(...)` for batched/tickless stepping.
- `diep_observations(...)` for fixed-slot batched observations.
- `diep_alive_mask(...)` for fixed-slot live/dead state.
- `diep_get_observation_shape()` returns `21, 21, 8, channel-last`.
- `diep_get_action_shape()` describes the frozen v1 struct action layout.
- Buffer-too-small calls return required lengths.
- Invalid/null handles return safe error codes or no-op results according to the current C ABI pattern.

Observation ABI contract:

```text
diep_observations -> float32 buffer shaped as:
(max_possible_agents, 21, 21, 8)
```

Alive mask ABI contract:

```text
diep_alive_mask -> int buffer shaped as:
(max_possible_agents,)

1 = alive/currently controlled slot
0 = terminated/inactive slot
```

### Python ctypes wrapper

Core file:

- `conformance/headless/python/diep_headless.py`

Implemented API:

- `HeadlessSim.step(...)`
- `HeadlessSim.step_many(...)`
- `HeadlessSim.snapshot()`
- `HeadlessSim.observation(agent_id)`
- `HeadlessSim.observations()`
- `HeadlessSim.observations_array(out=None)`
- `HeadlessSim.agent_states_array(out=None)`
- `HeadlessSim.agent_progressions_array(out=None)`
- `HeadlessSim.step_many_observations_array(...)`
- `HeadlessSim.alive_mask()`
- `abi_version()`, currently expected to be `6`

Important behavior:

- `observations_array()` now always returns shape `(possible_agent_count, 21, 21, 8)`.
- If a caller passes `out`, it must have that exact shape and `float32` dtype.
- NumPy is optional for the wrapper overall, but required for `observations_array()`.

### PettingZoo ParallelEnv wrapper

Core file:

- `conformance/headless/python/pettingzoo_env.py`

Implemented behavior:

- Exposes `DiepCustomParallelEnv` and `parallel_env` alias.
- Uses multi-agent action dictionaries directly.
- Does not shape rewards by default.
- Optional `reward_config`, `reward_fn`, or `raw_rewards=True` allow Python-side ownership of rewards.
- `reward_config` accepts scalar weights for built-in components: `raw`, `score_delta`, `health_delta`, `damage_taken`, `alive`, `death`, `truncation`, and `step`.
- `env.set_reward_config(...)` can retune configured reward weights without recreating the environment.
- `observation_mode='state'` switches PettingZoo observations from the grid tensor to the lightweight C ABI state vector.
- `fast_reward_state=True` computes configured reward components from the lightweight C ABI state buffer instead of JSON snapshots.
- `include_snapshot_info=False` avoids full JSON snapshots in `infos` for hot training loops.
- `infos[agent]['reward_components']` exposes the unweighted values used for configured rewards.
- Uses C ABI fixed-slot observations internally.
- Uses `alive_mask()` to decide terminations and current `env.agents`.
- PettingZoo `env.agents` can shrink after terminations, while the underlying observation batch remains constant-shape.

Action forms accepted by `action_to_diep(...)`:

```python
{
  "move": [move_x, move_y],
  "aim": [aim_x, aim_y],
  "buttons": [fire, alt_fire],
  "stat_upgrade_choice": 0,
  "tank_upgrade_choice": 1,
}
```

or flat sequence:

```python
[move_x, move_y, aim_x, aim_y, fire, alt_fire, stat_upgrade_choice, tank_upgrade_choice]
```

Both upgrade fields are optional and default to `-1` (no upgrade). Invalid or currently illegal upgrade requests are ignored. Missing/malformed fields otherwise become no-op components. No internal AI action is injected.

### Documentation updated

- `docs/headless-rl-action-abi.md`
  - Documents ABI v6 action/progression layout, explicit stat+tank upgrade channels, and fixed-shape legality masks.
- `docs/headless-pettingzoo-api.md`
  - Documents PettingZoo wrapper usage, upgrade-aware `grid_hud.progression`, fast tickless path, constant-shape buffers, and reward ownership.

### Tests and conformance added/updated

Files:

- `conformance/headless/python_ctypes_smoke.py`
- `conformance/headless/python_pettingzoo_smoke.py`
- `conformance/headless/python_pettingzoo_api_test.py`
- `conformance/headless/python_training_benchmark.py`
- `conformance/headless/pettingzoo-env.test.js`
- `conformance/headless/python-ctypes.test.js`
- `cpp/tests/headless_c_api_smoke_test.cpp`

Coverage now includes:

- C ABI create/reset/step/step_many/snapshot/observation/observations/alive-mask smoke checks.
- Fixed-slot observation tensor remains constant after agents terminate.
- Dead slots are zero-filled.
- Python ctypes wrapper smoke.
- Official PettingZoo `parallel_api_test` when `.venv` dependencies are present.
- Python tickless training benchmark.
- Existing headless/parity gates.

## Validation evidence from latest run

Commands that passed:

```bash
npm run test:cpp
python3 conformance/headless/python_ctypes_smoke.py
.venv/bin/python conformance/headless/python_pettingzoo_api_test.py
.venv/bin/python conformance/headless/python_training_benchmark.py
npm run test:headless
npm run test:parity
npm run check
TICKS=1000 AGENTS=4 npm run bench:headless
```

Latest benchmark sample:

```text
python-tickless-training-loop:
- ticks: 1000
- agents: 4
- step_ticks_per_second: ~258k-277k
- step_many_ticks_per_second: ~844k-878k
- step_plus_observations_ticks_per_second: ~25k-27k
- numpy: true
```

Headless in-engine benchmark still passes; example ranges from latest run:

```text
empty-arena: ~1.16M ticks/sec
agents-no-fire: ~744k ticks/sec
agents-projectiles: ~692k ticks/sec
dense-collision: ~725k ticks/sec
rl-grid-smoke: ~517k ticks/sec
observationReport: ~9.5k ticks/sec with observe-all path
```

## Current git/worktree note

The repo has many uncommitted changes from the broader RL/headless work, not just the fixed-slot observation slice. A fresh agent should inspect `git status --short` before committing or branching.

Known untracked/modified areas include:

- CMake and package scripts.
- Headless C++ simulator files.
- C ABI header/source/test.
- Headless parity conformance folder.
- Python ctypes/PettingZoo wrappers and tests.
- Docs for RL action ABI and PettingZoo API.

Do not commit `.venv/` or Python cache folders.

## Remaining risks / next recommended steps

1. **Commit hygiene / PR prep**
   - Review full diff and split into logical commits if possible:
     1. parity/headless simulator changes
     2. C ABI bindings
     3. Python ctypes + PettingZoo wrapper
     4. fixed-slot observations/alive mask
     5. docs/tests

2. **More stable training scenarios**
   - Some existing benchmark scenarios naturally kill agents. That is acceptable for termination testing but not ideal for early learning smoke tests.
   - Add a dedicated training scenario where agents spawn safely and shapes/projectiles are controlled enough for repeatable learning diagnostics.

3. **Vectorized trainer integration**
   - Add examples for RLlib/SuperSuit/vectorized PettingZoo flows if those are selected.
   - Keep this outside core C++ until a concrete trainer is chosen.

4. **Reward adapter examples**
   - Provide external reward callback examples in Python only.
   - Do not bake dense reward shaping into C++/ABI.

5. **Observation masks in Python APIs**
   - `HeadlessSim.alive_mask()` exists.
   - Consider exposing a combined fast method returning `(step_result, observations, alive_mask)` to avoid one extra ctypes call in hot loops.

6. **Parity expansion**
   - Continue constructor/movement/collision parity before trusting long training runs.
   - Full-world snapshots remain the canonical debugging artifact.

## Quick start for a fresh agent

From the repository root:

```bash
npm run test:cpp
python3 conformance/headless/python_ctypes_smoke.py
.venv/bin/python conformance/headless/python_pettingzoo_api_test.py
.venv/bin/python conformance/headless/python_training_benchmark.py
npm run test:headless
npm run test:parity
npm run check
```

If `.venv` is missing, recreate it locally and install Python dependencies:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install pettingzoo gymnasium numpy
```
