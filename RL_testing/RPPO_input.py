"""Minimal RPPO input combiner for combat observations."""

import torch
import torch.nn as nn

from RL_testing.CNN import BasicCombatCNN
from RL_testing.LINEAR import RPPOVectorInput


class RPPOInput(nn.Module):
    """Concatenate CNN grid features with flat vector observations."""

    def __init__(self, observation_space=None, action_space=None, cnn=None, vector_input=None):
        super().__init__()
        self.cnn = cnn or BasicCombatCNN(
            observation_space=observation_space,
            action_space=action_space,
        )
        self.vector_input = vector_input or RPPOVectorInput()

    @staticmethod
    def _ensure_batch_dim(tensor: torch.Tensor) -> tuple[torch.Tensor, bool]:
        """Return a batched view of a tensor and whether a batch dim was added."""
        if tensor.dim() == 1:
            return tensor.unsqueeze(0), True
        return tensor, False

    def forward(self, obs):
        """Return [grid features, encoded self obs, encoded previous action obs]."""
        features = self.cnn.forward_train({"obs": obs})["features"]
        features, squeezed_features = self._ensure_batch_dim(features)
        self_obs, squeezed_self_obs = self._ensure_batch_dim(obs["self_obs"])
        prev_action_obs, squeezed_prev_action_obs = self._ensure_batch_dim(obs["prev_action_obs"])
        self_features, prev_action_features = self.vector_input(
            self_obs,
            prev_action_obs,
        )
        combined = torch.cat([features, self_features, prev_action_features], dim=1)
        if squeezed_features and squeezed_self_obs and squeezed_prev_action_obs:
            return combined.squeeze(0)
        return combined
