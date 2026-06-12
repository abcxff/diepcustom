from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from observability.config import ObservabilityConfig

try:
    import wandb  # type: ignore
except ImportError:  # pragma: no cover - exercised through fallback behavior
    wandb = None


class WandbLogger:
    def __init__(self, config: ObservabilityConfig):
        self.config = config
        self.config.ensure_directories()
        self._run = None
        self._jsonl_path = self.config.episodes_jsonl_path
        self._config_payload: dict[str, Any] = {}
        self._wandb_disabled_reason: str | None = None

    @property
    def wandb_active(self) -> bool:
        return self._run is not None

    def start(self, run_config: dict[str, Any]) -> None:
        self._config_payload = dict(run_config)
        self.config.config_json_path.write_text(json.dumps(self._config_payload, indent=2, sort_keys=True) + '\n')
        if not self.config.wandb_enabled:
            self._wandb_disabled_reason = 'disabled-by-config'
            return
        if wandb is None:
            self._wandb_disabled_reason = 'wandb-not-installed'
            return
        self._run = wandb.init(
            project=self.config.project_name,
            name=self.config.run_id,
            dir=str(self.config.run_dir),
            mode=self.config.wandb_mode,
            config=self._config_payload,
            reinit=True,
        )

    def log_episode(self, payload: dict[str, Any], *, step: int | None = None) -> None:
        if self._run is not None:
            self._run.log(dict(payload), step=step)
            return
        with self._jsonl_path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(payload, sort_keys=True) + '\n')

    def log_video(self, key: str, path: str | Path, *, step: int | None = None, fps: int = 20) -> None:
        if self._run is None or wandb is None:
            return
        self._run.log({key: wandb.Video(str(path), fps=fps, format='mp4')}, step=step)

    def finish(self) -> None:
        if self._run is not None:
            self._run.finish()
            self._run = None


__all__ = ['WandbLogger']
