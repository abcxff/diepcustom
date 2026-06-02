# Headless RL ABI (v1-v6)

## Multi-agent action layout
One `diep_action` struct is supplied per controlled agent each step. The simulator accepts sparse action arrays: omitted live agents become explicit no-op actions for that step.

Current action fields (`diep_get_action_shape()` reports `9`):
1. `agent_id` identifies the live simulator agent id.
2. `move_x`, `move_y` are continuous movement components clamped to `[-1, 1]`.
3. `aim_x`, `aim_y` are continuous aim vector components clamped to `[-1, 1]`; a near-zero aim vector preserves the prior angle.
4. `fire`, `alt_fire` are integer booleans.
5. `stat_upgrade_choice` is the requested stat index, or the sentinel `-1` for no upgrade.
6. `tank_upgrade_choice` is the requested fixed-slot tank upgrade index, or the sentinel `-1` for no upgrade.

Upgrade legality behavior:
- missing upgrade fields default to `-1`
- invalid or currently illegal stat/tank upgrade requests are ignored, not fatal
- stat upgrades require available stat points and a legal per-stat cap for the current tank
- tank upgrades require a legal slot on the current tank and the target tank's level requirement

C ABI metadata:
- `diep_abi_version()` returns the current ABI version (`6`).
- `diep_get_action_shape()` returns the current action struct layout metadata.
- `diep_get_observation_shape()` returns `21 x 21 x 8`, channel-last.
- `diep_agent_ids()` returns the current live agent id list or the required buffer length.
- `diep_last_error()` reports the last per-handle error code.

## Freeze status
The action layout is append-only across ABI versions. Field reinterpretation is not allowed; future changes must bump ABI metadata.

Error metadata includes `DIEP_ERROR_INVALID_AGENT` for observation requests against missing/non-agent ids; buffer sizing probes are successful metadata calls and leave `diep_last_error()` as `DIEP_OK`.

## ABI v2 fast training additions
- `diep_step_many(sim, actions, action_count, ticks)` advances fixed actions for multiple ticks without crossing the Python/C boundary per tick.
- `diep_observations(sim, buffer, buffer_len)` writes all currently live agent observations in `[agent][row][col][channel]` order.
- These APIs are tickless: they do not sleep, render, network, or serialize JSON.
- Rewards remain simulator raw rewards only; external trainers own reward shaping.

## ABI v3 fixed-slot multi-agent observations
RL frameworks require constant observation shapes across an episode, so batched observation output is fixed to:

```text
(max_possible_agents, 21, 21, 8) float32, channel-last
```

`diep_observations` always writes one slot per configured possible agent. Dead or inactive agent slots are zero-filled and remain present until reset. Call `diep_alive_mask` to obtain a parallel binary mask of length `max_possible_agents`; `1` means the slot's agent is currently alive, `0` means the agent has terminated.

## ABI v4 lightweight agent states
High-throughput reward computation does not need full JSON snapshots or the full spatial observation grid. The lightweight state API writes one compact row per possible agent:

```text
(max_possible_agents, 10) float32
```

Fields:

```text
agent_id, alive, x, y, vx, vy, health, max_health, score, team_id
```

C ABI calls:
- `diep_agent_state_fields()` returns `10`.
- `diep_agent_states(sim, buffer, buffer_len)` writes all possible-agent state rows.

## ABI v5 progression state buffer
ABI v5 added a separate compact progression buffer so `grid_hud` can expose progression data without changing the existing state-vector contract.

## ABI v6 legal upgrade state
The progression buffer now has fixed shape:

```text
(max_possible_agents, 27) float32
```

Fields:

```text
level,
current_tank,
stats_available,
can_stat_upgrade,
can_tank_upgrade,
stat_0, stat_1, stat_2, stat_3, stat_4, stat_5, stat_6, stat_7,
legal_stat_0, legal_stat_1, legal_stat_2, legal_stat_3, legal_stat_4, legal_stat_5, legal_stat_6, legal_stat_7,
legal_tank_0, legal_tank_1, legal_tank_2, legal_tank_3, legal_tank_4, legal_tank_5
```

C ABI calls:
- `diep_agent_progression_fields()` returns `27`.
- `diep_agent_progressions(sim, buffer, buffer_len)` writes all possible-agent progression rows.

This keeps `grid` and `self` unchanged while letting `grid_hud.progression` expose explicit legal stat/tank choices for RL agents.
