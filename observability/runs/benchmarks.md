# Headless observability benchmark notes

Date: 2026-06-08
Command: `.venv/bin/python conformance/headless/python_training_benchmark.py`

## Before

- No repo-local observability benchmark snapshot was checked in for this MVP branch before implementation.

## After

```json
{
  "benchmark": "python-tickless-training-loop",
  "ticks": 1000,
  "agents": 4,
  "step_ticks_per_second": 227376.08,
  "step_many_ticks_per_second": 512962.87,
  "step_plus_combat_observations_ticks_per_second": 7927.35,
  "step_plus_agent_states_ticks_per_second": 149378.21,
  "numpy": true
}
```
