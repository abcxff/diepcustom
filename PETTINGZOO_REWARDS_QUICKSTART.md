# PettingZoo RL Quickstart (Python Only)

Use the root `RL_training/` package for Python-side agents, rewards, and PettingZoo training.
You should not need to browse C++ or conformance internals for normal reward experiments.

## Essential files

`RL_training/pettingzoo_env.py`
- Main PettingZoo `ParallelEnv` wrapper.
- Use `DiepCustomParallelEnv` in training scripts.
- Handles parallel agents, action dicts, observations, rewards, infos, reset, and step.

`RL_training/rewards.py`
- Python reward configuration and reusable reward components.
- Important symbols: `RewardConfig`, `make_reward_config`, `reward_components`.
- Add new reusable reward fields here only when simple weights are not enough.

`RL_training/actions.py`
- Converts Python trainer actions into simulator actions.
- Dict form: `{'move': [x, y], 'aim': [x, y], 'buttons': [fire, alt_fire], 'stat_upgrade_choice': i, 'tank_upgrade_choice': j}`.
- Flat form: `[move_x, move_y, aim_x, aim_y, fire, alt_fire, stat_upgrade_choice, tank_upgrade_choice]`.
- Use `-1` for either upgrade field when no upgrade is requested.

`RL_training/spaces.py`
- Gymnasium/PettingZoo action and observation spaces.
- Includes tiny fallbacks for smoke tests.

`RL_training/headless.py`
- Lower-level Python simulator wrapper.
- Use directly only for custom fast loops outside PettingZoo.

`RL_training/agents.py`
- Profile-driven multi-agent helpers.
- Use `AgentProfile` + `AgentRoster` when each env agent needs its own build/controller config.

`RL_training/__init__.py`
- Convenience exports so scripts can import from `RL_training`.

## Minimal environment

```python
from RL_training import DiepCustomParallelEnv

env = DiepCustomParallelEnv(
    seed=1,
    agents=2,
    max_ticks=1000,
    observation_mode='grid_hud',
    include_snapshot_info=False,
    reward_config={
        'score_delta': 1.0,
        'alive': 0.01,
        'death': -1.0,
        'step': -0.001,
    },
)
```

## Basic loop

```python
observations, infos = env.reset(seed=1)

while env.agents:
    actions = {agent: env.action_space(agent).sample() for agent in env.agents}
    observations, rewards, terminations, truncations, infos = env.step(actions)
```

## Reward fields

`RewardConfig` supports: `raw`, `score_delta`, `health_delta`, `damage_taken`, `alive`, `death`, `truncation`, and `step`.

Tune weights in your training script: `env.set_reward_config(score_delta=2.0, death=-2.0, step=-0.001)`.

Debug components with: `infos[agent]['reward_components']`.

## Observation modes

`observation_mode='grid_hud'`: recommended realistic default for player-like agents. Returns `{'grid': ..., 'self': ..., 'progression': ...}` where `self` is `(health_norm, health, max_health, score, alive)` and `progression` carries level, current tank, available stat points, `stat_levels`, `legal_stat_upgrades`, and `legal_tank_upgrades`. Automatically enables the fast state buffer plus progression plumbing.

`observation_mode='state'`: compact per-agent vector; best when you want the full lightweight state row for MLP policies; enables fast reward state automatically.

`observation_mode='grid'`: spatial tensor per agent; useful for CNN-style policies when no HUD/self vector is needed.

## Fast training defaults

```python
DiepCustomParallelEnv(
    observation_mode='grid_hud',
    include_snapshot_info=False,
)
```

## Python validation files

`conformance/headless/python_pettingzoo_smoke.py`: quick env/reward check.

`conformance/headless/python_pettingzoo_api_test.py`: PettingZoo `parallel_api_test` compliance.

`conformance/headless/python_training_benchmark.py`: Python training throughput benchmark.

## Practical workflow

1. Import `DiepCustomParallelEnv` from `RL_training`.
2. Start with `observation_mode='grid_hud'` for player-like agents, or `state` for fully vectorized policies.
3. Tune `reward_config` in your training script.
4. Inspect `reward_components` when debugging.
5. Run smoke/API tests before long training runs.
