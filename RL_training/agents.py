"""Profile-driven multi-agent controller helpers for headless RL training.

These helpers keep per-agent model/build selection in reusable profile objects
instead of scattering special cases through environment step loops.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Callable

from .auto_upgrade import AutoUpgradePolicy, preset_auto_upgrade_policy

ActionDict = dict[str, Any]
ObservationValue = Any
BasePolicy = Callable[[str, ObservationValue], ActionDict]
BasePolicyFactory = Callable[['AgentProfile'], BasePolicy | Any]


@dataclass
class AgentProfile:
    """Declarative per-agent configuration for controller and build selection.

    Parameters
    ----------
    key:
        Stable profile label used for logs, metrics, or checkpoint grouping.
    build_name:
        Optional named auto-upgrade preset to attach to this agent.
    env_agent_name:
        Optional explicit environment agent id to bind to. When omitted,
        profiles bind to environment agents in order.
    controller:
        Ready-to-use callable/object that produces the base action.
    controller_factory:
        Optional factory that receives this profile and returns the base
        controller. Useful when the controller depends on a model/checkpoint
        stored in ``metadata``.
    metadata:
        Free-form per-agent config such as checkpoint paths, role labels, or
        preprocessing settings.
    prefer_tank_upgrade:
        Passed through to the preset auto-upgrade policy when ``build_name`` is
        provided.
    """

    key: str
    build_name: str | None = None
    env_agent_name: str | None = None
    controller: BasePolicy | Any | None = None
    controller_factory: BasePolicyFactory | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    prefer_tank_upgrade: bool = False

    def make_controller(self) -> 'ConfiguredAgent':
        base_controller = self.controller
        if base_controller is None:
            if self.controller_factory is None:
                raise ValueError(f'agent profile {self.key!r} needs controller or controller_factory')
            base_controller = self.controller_factory(self)
        upgrade_policy = None
        if self.build_name:
            upgrade_policy = preset_auto_upgrade_policy(
                self.build_name,
                prefer_tank_upgrade=self.prefer_tank_upgrade,
            )
        return ConfiguredAgent(
            profile=self,
            base_controller=base_controller,
            upgrade_policy=upgrade_policy,
        )


@dataclass
class ConfiguredAgent:
    """Bound controller produced from an :class:`AgentProfile`."""

    profile: AgentProfile
    base_controller: BasePolicy | Any
    upgrade_policy: AutoUpgradePolicy | None = None

    def base_action(self, agent_name: str, observation: ObservationValue) -> ActionDict:
        controller = self.base_controller
        if hasattr(controller, 'act'):
            action = controller.act(agent_name, observation)
        else:
            action = controller(agent_name, observation)
        if action is None:
            action = {}
        return dict(action)

    def action(self, agent_name: str, observation: ObservationValue) -> ActionDict:
        action = self.base_action(agent_name, observation)
        if self.upgrade_policy is None:
            return action
        progression = observation.get('progression', {}) if isinstance(observation, dict) else {}
        return self.upgrade_policy.apply(action, progression)


class AgentRoster:
    """Bind reusable agent profiles to environment agents and produce actions.

    The roster keeps step loops generic: bind profiles once at reset, then call
    :meth:`actions_for` each step with the current observation map.
    """

    def __init__(self, profiles: list[AgentProfile] | tuple[AgentProfile, ...], *, strict: bool = True):
        self.profiles = list(profiles)
        self.strict = bool(strict)
        self._bindings: OrderedDict[str, ConfiguredAgent] = OrderedDict()

    def bind(self, env_agent_names: list[str] | tuple[str, ...]) -> OrderedDict[str, ConfiguredAgent]:
        names = list(env_agent_names)
        explicit_profiles = [profile for profile in self.profiles if profile.env_agent_name is not None]
        implicit = [profile for profile in self.profiles if profile.env_agent_name is None]
        explicit_name_counts: dict[str, int] = {}
        for profile in explicit_profiles:
            explicit_name_counts[profile.env_agent_name] = explicit_name_counts.get(profile.env_agent_name, 0) + 1
        duplicate_explicit = sorted(name for name, count in explicit_name_counts.items() if count > 1)
        if duplicate_explicit:
            raise ValueError(f'duplicate explicit env_agent_name values: {duplicate_explicit}')
        explicit = {profile.env_agent_name: profile for profile in explicit_profiles}
        bindings: OrderedDict[str, ConfiguredAgent] = OrderedDict()
        implicit_index = 0

        for agent_name in names:
            profile = explicit.get(agent_name)
            if profile is None and implicit_index < len(implicit):
                profile = implicit[implicit_index]
                implicit_index += 1
            if profile is None:
                if self.strict:
                    raise ValueError(f'no agent profile available for environment agent {agent_name!r}')
                continue
            bindings[agent_name] = profile.make_controller()

        if self.strict:
            missing_explicit = sorted(set(explicit) - set(names))
            if missing_explicit:
                raise ValueError(f'profiles target missing environment agents: {missing_explicit}')
            if implicit_index < len(implicit):
                unused = [profile.key for profile in implicit[implicit_index:]]
                raise ValueError(f'unused agent profiles remain after binding: {unused}')

        self._bindings = bindings
        return OrderedDict(bindings)

    def reset(self):
        self._bindings = OrderedDict()

    @property
    def bound_agent_names(self) -> tuple[str, ...]:
        return tuple(self._bindings)

    def controller_for(self, agent_name: str) -> ConfiguredAgent:
        try:
            return self._bindings[agent_name]
        except KeyError as exc:
            if not self._bindings:
                raise KeyError('agent roster is not bound; call bind(...) after env.reset()') from exc
            raise KeyError(f'no controller bound for agent {agent_name!r}') from exc

    def action(self, agent_name: str, observation: ObservationValue) -> ActionDict:
        return self.controller_for(agent_name).action(agent_name, observation)

    def actions_for(self, observations: dict[str, ObservationValue], agents: list[str] | tuple[str, ...] | None = None) -> OrderedDict[str, ActionDict]:
        names = list(observations) if agents is None else list(agents)
        return OrderedDict((agent_name, self.action(agent_name, observations[agent_name])) for agent_name in names)


__all__ = [
    'ActionDict',
    'ObservationValue',
    'BasePolicy',
    'BasePolicyFactory',
    'AgentProfile',
    'ConfiguredAgent',
    'AgentRoster',
]
