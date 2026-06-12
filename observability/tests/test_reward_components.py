from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np

from observability.config import ObservabilityConfig
from observability.logging.diep_metrics_callback import DiepMetricsCallback


class StubSim:
    def __init__(self, rows):
        self._rows = np.asarray(rows, dtype=np.float64)

    def episode_stats_array(self):
        return self._rows.copy()


class StubPettingZooEnv:
    def __init__(self, rows, reward_config):
        self._sim = StubSim(rows)
        self._last_infos = {}
        self.reward_config = reward_config
        self.scenario = 'stub-scenario'
        self.seed_value = 7
        self.agent_count = len(rows)


class StubGymEnv:
    def __init__(self, pz_env):
        self.pettingzoo_env = pz_env
        self.controlled_agent = 'agent_0'
        self.scenario = pz_env.scenario
        self.seed_value = pz_env.seed_value
        self.agent_count = pz_env.agent_count
        self.unwrapped = self


class StubTrainingEnv:
    def __init__(self, env):
        self.envs = [env]


BASE_ROW = [
    12.0, 120.0, 30.0, 90.0, 14.0, 7.0, 4.0, 2.0, 1.0, 0.0, 0.0, 5.0, 0.0, 3.0,
]


def _callback(tmp_path: Path, *, stats_log_agents=('agent_0',)) -> tuple[DiepMetricsCallback, StubPettingZooEnv]:
    config = ObservabilityConfig(
        run_id='unit-test-run',
        runs_root=tmp_path,
        wandb_enabled=False,
        stats_log_agents=stats_log_agents,
    )
    pz_env = StubPettingZooEnv([BASE_ROW, [8.0, 80.0, 10.0, 70.0, 5.0, 9.0, 2.0, 1.0, 0.0, 1.0, 2.0, 4.0, 1.0, 9.0]], {'score_delta': 1.0, 'step': 0.5})
    env = StubGymEnv(pz_env)
    training_env = StubTrainingEnv(env)
    callback = DiepMetricsCallback(config)
    callback.model = SimpleNamespace(
        logger=SimpleNamespace(name_to_value={'train/entropy_loss': -0.25, 'train/explained_variance': 0.8}),
        get_env=lambda: training_env,
    )
    callback._on_training_start()
    return callback, pz_env


def test_callback_flushes_on_done_and_writes_jsonl(tmp_path: Path):
    callback, pz_env = _callback(tmp_path)
    pz_env._last_infos = {
        'agent_0': {'reward_components': {'score_delta': 2.0, 'step': 1.0}},
        'agent_1': {'reward_components': {'score_delta': 3.0, 'step': 1.0}},
    }
    callback.locals = {'infos': [{}], 'dones': [False]}
    assert callback._on_step() is True
    assert not (tmp_path / 'unit-test-run' / 'episodes.jsonl').exists()

    pz_env._last_infos = {
        'agent_0': {'reward_components': {'score_delta': 4.0, 'step': 1.0}},
        'agent_1': {'reward_components': {'score_delta': 1.0, 'step': 1.0}},
    }
    callback.locals = {'infos': [{}], 'dones': [True]}
    assert callback._on_step() is True

    payloads = [json.loads(line) for line in (tmp_path / 'unit-test-run' / 'episodes.jsonl').read_text().splitlines()]
    assert len(payloads) == 1
    payload = payloads[0]
    assert payload['controlled_agent'] == 'agent_0'
    assert payload['train/episode_length'] == 2
    assert payload['reward/score_delta_sum'] == 6.0
    assert payload['reward/step_sum'] == 2.0
    assert payload['reward/score_delta_mean'] == 3.0
    assert payload['reward/step_mean'] == 1.0
    assert payload['train/policy_entropy'] == 0.25
    assert payload['train/explained_variance'] == 0.8


def test_callback_flush_pending_on_reset_and_filters_agents(tmp_path: Path):
    callback, pz_env = _callback(tmp_path, stats_log_agents=('agent_1',))
    pz_env._last_infos = {
        'agent_0': {'reward_components': {'score_delta': 1.0, 'step': 1.0}},
        'agent_1': {'reward_components': {'score_delta': 5.0, 'step': 1.0}},
    }
    callback.locals = {'infos': [{}], 'dones': [False]}
    assert callback._on_step() is True
    flushed = callback.flush_pending(reason='reset')
    assert len(flushed) == 1
    payload = flushed[0]
    assert payload['controlled_agent'] == 'agent_1'
    assert payload['reward/score_delta_sum'] == 5.0
    assert payload['game/death_count'] == 1
