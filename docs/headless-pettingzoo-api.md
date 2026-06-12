# Headless PettingZoo API

`RL_training/pettingzoo_env.py` exposes the C++ headless simulator as a PettingZoo-style `ParallelEnv` without changing simulator AI behavior or adding internal reward shaping.

## Contract

- Environment class: `DiepCustomParallelEnv`
- Alias: `parallel_env`
- Agent names: `agent_0`, `agent_1`, ... mapped to C ABI agent ids from `diep_agent_ids`
- Observation mode `combat`: dictionary with `grid_obs`, `self_obs`, and `prev_action_obs` from the dedicated combat C ABI path
- Action space: dictionary form:
  - `move`: `[move_x, move_y]` in `[-1, 1]`
  - `aim`: `[aim_x, aim_y]` in `[-1, 1]`
  - `buttons`: `[fire, alt_fire]`
  - `stat_upgrade_choice`: stat index, or `-1` for no upgrade
  - `tank_upgrade_choice`: fixed tank-upgrade slot index, or `-1` for no upgrade
- Flat action compatibility: `[move_x, move_y, aim_x, aim_y, fire, alt_fire, stat_upgrade_choice, tank_upgrade_choice]`
- Invalid or currently illegal upgrade selections are ignored.
- The current C ABI exposes episode `done` as a truncation signal; task-specific terminal conditions should be computed by the trainer.

Missing live-agent actions are converted to an explicit no-op action. The wrapper does not inject AI, autopilot, scripted movement, or default firing behavior.

## Rewards

The wrapper does not shape rewards by default. `step()` returns `0.0` for every live agent unless one of these explicit options is used:

- `reward_config={...}` or `RewardConfig(...)` to combine built-in Python-side reward components with scalar weights
- `reward_fn(env, step_result, snapshot) -> dict[agent_name, float]` for fully custom reward logic
- `raw_rewards=True` to forward the simulator's raw reward array

`reward_config` is intended for fast trainer iteration without rebuilding the C++ simulator. Supported component weights are:

| Field | Component |
| --- | --- |
| `raw` | Simulator raw reward slot |
| `score_delta` | Current score minus previous score |
| `health_delta` | Current health minus previous health |
| `damage_taken` | Positive health loss during the step |
| `alive` | `1.0` when the agent is alive after the step |
| `death` | `1.0` when the agent is not alive after the step |
| `truncation` | `1.0` when the episode-level max-tick/done signal fires |
| `step` | Constant `1.0` per step |

Example:

```python
from RL_training import DiepCustomParallelEnv

env = DiepCustomParallelEnv(
    seed=123,
    agents=2,
    scenario='rl-grid-smoke',
    observation_mode='combat',
    include_snapshot_info=False,
    reward_config={
        'score_delta': 1.0,
        'damage_taken': -0.05,
        'alive': 0.01,
        'death': -1.0,
        'step': -0.001,
    },
)
```

The final reward is the weighted sum of the components for that agent. Every `infos[agent]` includes `raw_reward`, `reward_components`, `reward_config`, `tick`, `agent_id`, `snapshot`, and `action_shape`, so external trainers can inspect or log the exact reward inputs.

You can also retune rewards at runtime:

```python
env.set_reward_config(score_delta=2.0, alive=0.005, death=-2.0)
```

For higher-throughput RL loops, keep `include_snapshot_info=False` and optionally enable `fast_reward_state=True` so reward components come from the lightweight C ABI state buffer instead of JSON snapshots:

```python
env = DiepCustomParallelEnv(
    agents=4,
    observation_mode='combat',
    include_snapshot_info=False,
    fast_reward_state=True,
    reward_config={'score_delta': 1.0, 'alive': 0.01, 'death': -1.0},
)
```

`observation_mode='combat'` returns the combat-specific dictionary used by the SB3 testing harness:

```text
grid_obs: (18, 21, 21) float32
self_obs: (27,) float32
prev_action_obs: (5,) float32
tank_type_obs: scalar integer tank enum ID
```

This mode is the intended policy-facing observation for combat training. It is wired through both the PettingZoo env and the Gymnasium/SB3 adapters. The default single-agent smoke trainer is `RL_testing/train_recurrent_ppo.py`, while the multi-agent dummy-bot harness lives under `RL_testing/SB3_test/`.

## Example

```python
from RL_training import DiepCustomParallelEnv

env = DiepCustomParallelEnv(seed=123, agents=2, scenario='upgrade-ready', observation_mode='combat')
observations, infos = env.reset(seed=123)
observations, rewards, terminations, truncations, infos = env.step({
    'agent_0': {
        'move': [1.0, 0.0],
        'aim': [1.0, 0.0],
        'buttons': [1, 0],
        'stat_upgrade_choice': 0,
        'tank_upgrade_choice': 1,
    },
    'agent_1': [0.0, 1.0, 1.0, 0.0, 0, 0, -1, -1],
})
```

PettingZoo and Gymnasium are optional runtime dependencies. If installed, the wrapper subclasses `pettingzoo.ParallelEnv` and uses Gymnasium spaces. Without them, the same local API remains importable for conformance tests.

## SB3 testing quickstart

Install the RL testing extras into your virtualenv:

```bash
.venv/bin/python -m pip install -r RL_testing/requirements.txt
```

Single-agent smoke training against the built-in one-agent Gym adapter:

```bash
.venv/bin/python RL_testing/train_recurrent_ppo.py --timesteps 1024
```

Combat training against hardcoded random dummy bots with automatic save/resume:

```bash
.venv/bin/python RL_testing/SB3_test/train_rppo_vs_dummy_bots.py \
  --timesteps 4096 \
  --output RL_testing/SB3_test/models/rppo_combat_dummy_bots
```

If `RL_testing/SB3_test/models/rppo_combat_dummy_bots.zip` already exists, the trainer resumes from that checkpoint by default. Add `--no-resume` to force a fresh run. Periodic checkpoints are written under `RL_testing/SB3_test/models/<name>_checkpoints/`.

Evaluate a saved recurrent policy against the same dummy bots:

```bash
.venv/bin/python RL_testing/SB3_test/play_saved_model.py \
  --model RL_testing/SB3_test/models/rppo_combat_dummy_bots.zip \
  --episodes 3
```

For a narrower smoke check, run:

```bash
.venv/bin/python RL_testing/SB3_test/random_dummy_bots_smoke.py
```

## Fast tickless training path

For high-throughput multi-agent training, use the lower-level ctypes wrapper instead of the PettingZoo dictionary API in the hot loop:

- `HeadlessSim.step_many(actions, ticks)` advances the simulator by `ticks` as fast as CPU allows with no sleeps, render loop, networking, or JSON serialization.
- `HeadlessSim.combat_observations_array(out=...)` fills a NumPy `float32` tensor with all possible-agent combat grids in `[agent][channel][row][col]` layout.
- `HeadlessSim.combat_self_observations_array(out=...)` fills a compact NumPy `float32` self-feature tensor in `[agent][field]` layout.
- `HeadlessSim.combat_prev_action_observations_array(out=...)` fills a compact NumPy `float32` previous-action tensor in `[agent][field]` layout.
- `HeadlessSim.agent_states_array(out=...)` fills a compact NumPy `float32` tensor in `[agent][field]` layout for reward computation or state-vector training.
- `HeadlessSim.agent_progressions_array(out=...)` fills the fixed-shape progression buffer for upgrade-aware training.

The fast path is intentionally separate from reward shaping. External training code still owns rewards and terminal semantics.

## Constant-shape multi-agent buffers

The Python wrapper now treats the combat grid batch as a fixed-slot tensor with shape `(max_possible_agents, 18, 21, 21)`. Slots are indexed by `agent_N`; when an agent terminates, its slot remains allocated and zero-filled. Termination state comes from the separate C ABI alive mask, not from tensor resizing. This keeps vectorized RL integrations compatible with static combat observation spaces while still allowing PettingZoo to remove terminated agents from `env.agents`.
