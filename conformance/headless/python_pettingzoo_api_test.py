from pettingzoo.test import parallel_api_test
from python.pettingzoo_env import DiepCustomParallelEnv


def main():
    env = DiepCustomParallelEnv(seed=123, agents=2, max_ticks=8, scenario='rl-grid-smoke')
    parallel_api_test(env, num_cycles=4)


if __name__ == '__main__':
    main()
