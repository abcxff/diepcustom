"""Minimal RLlib TorchRLModule CNN for combat grid observations."""

import torch
import torch.nn as nn

from ray.rllib.core import Columns
from ray.rllib.core.rl_module.torch import TorchRLModule


TANK_TYPE_COUNT = 57
UNKNOWN_TANK_TYPE = 56
EXPERT_NAMES = ("Annihilator", "Penta", "Fighter", "Predator", "Default")
EXPERT_ROUTE_IDS = {
    "Annihilator": (7, 10, 49),
    "Penta": (1, 3, 14),
    "Fighter": (8, 9, 24),
    "Predator": (6, 19, 28),
}
EXPERT_INDEX = {name: index for index, name in enumerate(EXPERT_NAMES)}


def _expert_route_table() -> torch.Tensor:
    routes = torch.full((TANK_TYPE_COUNT,), EXPERT_INDEX["Default"], dtype=torch.long)
    for expert_name, ids in EXPERT_ROUTE_IDS.items():
        for tank_id in ids:
            routes[tank_id] = EXPERT_INDEX[expert_name]
    return routes


class BasicCombatCNN(TorchRLModule):
    """Encode grid observations with tank-path expert CNN branches."""

    def setup(self):
        self.shared_trunk = nn.Sequential(
            nn.Conv2d(18, 32, kernel_size=3, padding=1),
            nn.ReLU(),
        )

        self.tank_embedding = nn.Embedding(TANK_TYPE_COUNT, 8)

        self.experts = nn.ModuleDict({
            name: nn.Sequential(
                nn.Conv2d(32, 64, kernel_size=3, padding=1),
                nn.ReLU(),
                nn.Flatten(),
            )
            for name in EXPERT_NAMES
        })

        self.register_buffer("expert_routes", _expert_route_table(), persistent=False)

    def _get_grid(self, batch):
        obs = batch.get(Columns.OBS, batch.get("obs"))
        if isinstance(obs, dict):
            obs = obs["grid_obs"]
        return obs.float()

    def _get_tank_types(self, batch, batch_size, device):
        obs = batch.get(Columns.OBS, batch.get("obs"))
        if isinstance(obs, dict) and "tank_type_obs" in obs:
            tank_type = obs["tank_type_obs"]
        else:
            tank_type = torch.full((batch_size,), UNKNOWN_TANK_TYPE, device=device)
        tank_type = torch.as_tensor(tank_type, device=device).long().reshape(-1)
        if tank_type.numel() == 1 and batch_size != 1:
            tank_type = tank_type.expand(batch_size)
        tank_type = tank_type[:batch_size]
        return torch.where(
            (tank_type >= 0) & (tank_type < UNKNOWN_TANK_TYPE),
            tank_type,
            torch.full_like(tank_type, UNKNOWN_TANK_TYPE),
        )

    def _expert_features(self, trunk_features, routes):
        output = trunk_features.new_empty((trunk_features.shape[0], 64, trunk_features.shape[2], trunk_features.shape[3]))
        for expert_name, expert in self.experts.items():
            mask = routes == EXPERT_INDEX[expert_name]
            if torch.any(mask):
                output[mask] = expert(trunk_features[mask])
        return output

    def _forward(self, batch, **kwargs):
        grid = self._get_grid(batch)
        tank_types = self._get_tank_types(batch, grid.shape[0], grid.device)
        trunk_features = self.shared_trunk(grid)
        routes = self.expert_routes.to(grid.device)[tank_types]
        features = self._expert_features(trunk_features, routes)
        tank_features = self.tank_embedding(tank_types)
        return {"features": torch.cat([features, tank_features], dim=1)}
