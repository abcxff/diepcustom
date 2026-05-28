# Headless PettingZoo API

`conformance/headless/python/pettingzoo_env.py` exposes the C++ headless simulator as a PettingZoo-style `ParallelEnv` without changing simulator AI behavior or adding internal reward shaping.

## Contract

- Environment class: `DiepCustomParallelEnv`
- Alias: `parallel_env`
- Agent names: `agent_0`, `agent_1`, ... mapped to C ABI agent ids from `diep_agent_ids`
- Observation space: `21 x 21 x 8`, channel-last float grid from `diep_observation`
- Action space: dictionary form:
  - `move`: `[move_x, move_y]` in `[-1, 1]`
  - `aim`: `[aim_x, aim_y]` in `[-1, 1]`
  - `buttons`: `[fire, alt_fire]`
- Flat action compatibility: `[move_x, move_y, aim_x, aim_y, fire, alt_fire]`
- `upgrade_choice` is fixed to `0` for v1.
- The current C ABI exposes episode `done` as a truncation signal; task-specific terminal conditions should be computed by the trainer.

Missing live-agent actions are converted to an explicit no-op action. The wrapper does not inject AI, autopilot, scripted movement, or default firing behavior.

## Rewards

The wrapper does not shape rewards by default. `step()` returns `0.0` for every live agent unless one of these explicit options is used:

- `reward_fn(env, step_result, snapshot) -> dict[agent_name, float]`
- `raw_rewards=True` to forward the simulator's raw reward array

Every `infos[agent]` includes `raw_reward`, `tick`, `agent_id`, `snapshot`, and `action_shape`, so external trainers can compute rewards outside the environment wrapper.

## Example

```python
from conformance.headless.python.pettingzoo_env import DiepCustomParallelEnv

env = DiepCustomParallelEnv(seed=123, agents=2, scenario='rl-grid-smoke')
observations, infos = env.reset(seed=123)
observations, rewards, terminations, truncations, infos = env.step({
    'agent_0': {'move': [1.0, 0.0], 'aim': [1.0, 0.0], 'buttons': [1, 0]},
    'agent_1': [0.0, 1.0, 1.0, 0.0, 0, 0],
})
```

PettingZoo and Gymnasium are optional runtime dependencies. If installed, the wrapper subclasses `pettingzoo.ParallelEnv` and uses Gymnasium spaces. Without them, the same local API remains importable for conformance tests.

## Fast tickless training path

For high-throughput multi-agent training, use the lower-level ctypes wrapper instead of the PettingZoo dictionary API in the hot loop:

- `HeadlessSim.step_many(actions, ticks)` advances the simulator by `ticks` as fast as CPU allows with no sleeps, render loop, networking, or JSON serialization.
- `HeadlessSim.observations_array(out=...)` fills a NumPy `float32` tensor with all currently live agent observations in `[agent][row][col][channel]` layout.
- `HeadlessSim.step_many_observations_array(actions, ticks, out=...)` combines multi-tick stepping and batched observation fetch for trainer loops.

The fast path is intentionally separate from reward shaping. External training code still owns rewards and terminal semantics.

Benchmark:

```bash
.venv/bin/python conformance/headless/python_training_benchmark.py
```

## Constant-shape multi-agent buffers

The Python wrapper now treats the C ABI observation batch as a fixed-slot tensor with shape `(max_possible_agents, 21, 21, 8)`. Slots are indexed by `agent_N`; when an agent terminates, its slot remains allocated and zero-filled. Termination state comes from the separate C ABI alive mask, not from tensor resizing. This keeps vectorized RL integrations compatible with static observation spaces while still allowing PettingZoo to remove terminated agents from `env.agents`.
