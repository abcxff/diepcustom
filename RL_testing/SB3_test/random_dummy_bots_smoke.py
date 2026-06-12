"""Quick smoke run for the single-agent-vs-bots combat wrapper."""

from __future__ import annotations

import numpy as np
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from RL_testing.SB3_test.single_agent_vs_bots_env import CombatSB3DummyBotsEnv


def main() -> None:
    env = CombatSB3DummyBotsEnv(seed=7, agents=4, scenario='upgrade-ready', include_snapshot_info=False)
    try:
        observation, info = env.reset(seed=7)
        assert env.observation_space.contains(observation)
        assert 'dummy_agents' in info and len(info['dummy_agents']) == 3
        for _ in range(8):
            action = np.asarray([0.5, -0.25, 0.0, 1.0, 1.0, 0.0, -1.0, -1.0], dtype=np.float32)
            observation, reward, terminated, truncated, info = env.step(action)
            assert env.observation_space.contains(observation)
            assert isinstance(reward, float)
            assert isinstance(terminated, bool)
            assert isinstance(truncated, bool)
            assert 'dummy_actions' in info
            if terminated or truncated:
                break
    finally:
        env.close()
    print('single-agent vs dummy bots smoke passed')


if __name__ == '__main__':
    main()
