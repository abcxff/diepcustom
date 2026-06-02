# Headless PettingZoo API

`RL_training/pettingzoo_env.py` exposes the C++ headless simulator as a PettingZoo-style `ParallelEnv` without changing simulator AI behavior or adding internal reward shaping.

## Contract

- Environment class: `DiepCustomParallelEnv`
- Alias: `parallel_env`
- Agent names: `agent_0`, `agent_1`, ... mapped to C ABI agent ids from `diep_agent_ids`
- Observation mode `grid`: `21 x 21 x 8`, channel-last float grid from `diep_observation`
- Observation mode `grid_hud`: dictionary with `grid`, `self`, and `progression`
- Observation mode `state`: compact per-agent float state vector from `diep_agent_states`
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
    observation_mode='grid_hud',
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

For higher-throughput RL loops, `observation_mode='grid_hud'` automatically enables the lightweight C ABI state path for the HUD vector while still returning the spatial grid:

```python
env = DiepCustomParallelEnv(
    agents=4,
    observation_mode='grid_hud',
    include_snapshot_info=False,
    reward_config={'score_delta': 1.0, 'alive': 0.01, 'death': -1.0},
)
```

The HUD `self` vector fields are:

```text
health_norm, health, max_health, score, alive
```

The `progression` payload exposes:

```text
level, current_tank, stats_available, can_stat_upgrade, can_tank_upgrade, stat_levels, legal_stat_upgrades, legal_tank_upgrades
```

Shapes:

```text
stat_levels: (8,)
legal_stat_upgrades: (8,)
legal_tank_upgrades: (6,)
```

`legal_tank_upgrades` uses fixed slot indices from the current tank definition; it does not export tank names or ids.

`observation_mode='state'` instead replaces the `21 x 21 x 8` grid observation with the full compact per-agent vector. The state fields are:

```text
agent_id, alive, x, y, vx, vy, health, max_health, score, team_id
```

Use `observation_mode='grid_hud'` as the realistic default for player-like agents. Keep `observation_mode='grid'` when a trainer needs only spatial observations. `fast_reward_state=True` can still use the compact state buffer for rewards while returning grid observations.

## Example

```python
from RL_training import DiepCustomParallelEnv

env = DiepCustomParallelEnv(seed=123, agents=2, scenario='upgrade-ready', observation_mode='grid_hud')
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

## Fast tickless training path

For high-throughput multi-agent training, use the lower-level ctypes wrapper instead of the PettingZoo dictionary API in the hot loop:

- `HeadlessSim.step_many(actions, ticks)` advances the simulator by `ticks` as fast as CPU allows with no sleeps, render loop, networking, or JSON serialization.
- `HeadlessSim.observations_array(out=...)` fills a NumPy `float32` tensor with all currently live agent observations in `[agent][row][col][channel]` layout.
- `HeadlessSim.agent_states_array(out=...)` fills a compact NumPy `float32` tensor in `[agent][field]` layout for reward computation or state-vector training.
- `HeadlessSim.agent_progressions_array(out=...)` fills the fixed-shape progression buffer for upgrade-aware training.
- `HeadlessSim.step_many_observations_array(actions, ticks, out=...)` combines multi-tick stepping and batched observation fetch for trainer loops.

The fast path is intentionally separate from reward shaping. External training code still owns rewards and terminal semantics.

## Constant-shape multi-agent buffers

The Python wrapper now treats the C ABI observation batch as a fixed-slot tensor with shape `(max_possible_agents, 21, 21, 8)`. Slots are indexed by `agent_N`; when an agent terminates, its slot remains allocated and zero-filled. Termination state comes from the separate C ABI alive mask, not from tensor resizing. This keeps vectorized RL integrations compatible with static observation spaces while still allowing PettingZoo to remove terminated agents from `env.agents`.
