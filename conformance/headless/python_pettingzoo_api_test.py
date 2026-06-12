from pettingzoo.test import parallel_api_test
from python.pettingzoo_env import DiepCustomParallelEnv


def main():
    env = DiepCustomParallelEnv(
        seed=123,
        agents=2,
        max_ticks=8,
        scenario='rl-grid-smoke',
        observation_mode='combat',
        include_snapshot_info=False,
    )
    try:
        parallel_api_test(env, num_cycles=4)
        print('combat parallel_api_test passed')
    finally:
        env.close()


if __name__ == '__main__':
    main()
