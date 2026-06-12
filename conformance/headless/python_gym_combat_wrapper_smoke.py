from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np

try:
    import gymnasium  # noqa: F401
except ImportError:
    print('skip: gymnasium not installed')
    raise SystemExit(0)

from RL_testing.sb3_single_agent_env import DiepCustomSB3SingleAgentEnv


def main() -> None:
    env = DiepCustomSB3SingleAgentEnv(
        seed=31,
        max_ticks=4,
        scenario='upgrade-ready',
        include_snapshot_info=False,
    )
    try:
        observation, info = env.reset(seed=31)
        assert env.observation_space.contains(observation)
        assert isinstance(info, dict)
        next_observation, reward, terminated, truncated, step_info = env.step(
            np.asarray([0.25, -0.25, 0.0, 1.0, 1.0, 0.0, -1.0, -1.0], dtype=np.float32)
        )
        assert env.observation_space.contains(next_observation)
        assert isinstance(reward, float)
        assert isinstance(terminated, bool)
        assert isinstance(truncated, bool)
        assert isinstance(step_info, dict)
    finally:
        env.close()
    print('gym combat wrapper smoke passed')


if __name__ == '__main__':
    main()
