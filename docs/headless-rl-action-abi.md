# Headless RL ABI v1

## Multi-agent action layout
One `diep_action` struct is supplied per controlled agent each step. The simulator accepts sparse action arrays: omitted live agents keep simulator/autopilot behavior for the current scenario.

Fields:
1. `agent_id` identifies the live simulator agent id.
2. `move_x`, `move_y` are continuous movement components clamped to `[-1, 1]`.
3. `aim_x`, `aim_y` are continuous aim vector components clamped to `[-1, 1]`; a near-zero aim vector preserves the prior angle.
4. `fire`, `alt_fire` are integer booleans.
5. `upgrade_choice` is reserved in v1 and ignored until upgrade parity is locked.

C ABI metadata:
- `diep_abi_version()` returns `1`.
- `diep_get_action_shape()` returns the v1 struct layout metadata.
- `diep_get_observation_shape()` returns `21 x 21 x 8`, channel-last.
- `diep_agent_ids()` returns the current live agent id list or the required buffer length.
- `diep_last_error()` reports the last per-handle error code.


## Freeze status
The v1 action layout is frozen for parity-gated RL work after the headless multi-tick, collision/lifetime, and AI deterministic gates. Future layouts must bump ABI metadata instead of reinterpreting these fields.

Error metadata includes `DIEP_ERROR_INVALID_AGENT` for observation requests against missing/non-agent ids; buffer sizing probes are successful metadata calls and leave `diep_last_error()` as `DIEP_OK`.


## ABI v2 fast training additions

- `diep_step_many(sim, actions, action_count, ticks)` advances fixed actions for multiple ticks without crossing the Python/C boundary per tick.
- `diep_observations(sim, buffer, buffer_len)` writes all currently live agent observations in `[agent][row][col][channel]` order.
- These APIs are tickless: they do not sleep, render, network, or serialize JSON.
- Rewards remain simulator raw rewards only; external trainers own reward shaping.

## ABI v3 fixed-slot multi-agent observations

RL frameworks require constant observation shapes across an episode, so batched observation output is now fixed to:

```text
(max_possible_agents, 21, 21, 8) float32, channel-last
```

`diep_observations` always writes one slot per configured possible agent. Dead or inactive agent slots are zero-filled and remain present until reset. Call `diep_alive_mask` to obtain a parallel binary mask of length `max_possible_agents`; `1` means the slot's agent is currently alive, `0` means the agent has terminated. The Python PettingZoo wrapper uses this mask to maintain constant tensor buffers while reporting terminations through the ParallelEnv API.
