"""Small vector encoders for RPPO observation inputs."""

import torch
import torch.nn as nn


class RPPOVectorInput(nn.Module):
    """Encode flat self and previous-action observations for RPPO input."""

    def __init__(self):
        super().__init__()
        self.self_encoder = nn.Linear(27, 32)
        self.prev_action_encoder = nn.Linear(5, 16)

    def forward(self, self_obs: torch.Tensor, prev_action_obs: torch.Tensor):
        """Return encoded self and previous-action feature tensors."""
        self_obs = torch.flatten(self_obs.float(), start_dim=1)
        prev_action_obs = torch.flatten(prev_action_obs.float(), start_dim=1)
        self_features = self.self_encoder(self_obs)
        prev_action_features = self.prev_action_encoder(prev_action_obs)
        return self_features, prev_action_features
