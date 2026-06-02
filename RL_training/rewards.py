"""Python-side reward configuration for PettingZoo training."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RewardConfig:
    """Declarative reward weights evaluated in Python from transition state."""

    raw: float = 0.0
    score_delta: float = 0.0
    health_delta: float = 0.0
    damage_taken: float = 0.0
    alive: float = 0.0
    death: float = 0.0
    truncation: float = 0.0
    step: float = 0.0


REWARD_FIELDS = tuple(RewardConfig.__dataclass_fields__.keys())


def make_reward_config(config=None, **overrides):
    """Create a RewardConfig from None, RewardConfig, mapping, or keywords."""

    if config is None:
        values = {}
    elif isinstance(config, RewardConfig):
        values = {field: getattr(config, field) for field in REWARD_FIELDS}
    elif isinstance(config, dict):
        unknown = set(config) - set(REWARD_FIELDS)
        if unknown:
            raise ValueError(f'unknown reward config fields: {sorted(unknown)}')
        values = dict(config)
    else:
        raise TypeError('reward_config must be None, RewardConfig, or dict')
    unknown = set(overrides) - set(REWARD_FIELDS)
    if unknown:
        raise ValueError(f'unknown reward config fields: {sorted(unknown)}')
    values.update(overrides)
    return RewardConfig(**{field: float(values.get(field, 0.0)) for field in REWARD_FIELDS})


def _entity_by_agent_id(snapshot, agent_id):
    for entity in snapshot.get('entities', []):
        if entity.get('kind') == 'agent' and entity.get('id') == agent_id:
            return entity
    return None


def _score(entity):
    if not entity:
        return 0.0
    return float(entity.get('score', {}).get('score', 0.0))


def _health(entity):
    if not entity:
        return 0.0
    return float(entity.get('health', {}).get('health', 0.0))


def snapshot_reward_components(env, result, snapshot, previous_snapshot, agents=None):
    """Return unweighted transition components computed from JSON snapshots."""

    agents = env.agents if agents is None else agents
    raw_rewards = env._raw_reward_map(result, agents)
    done = bool(result.get('done', False))
    alive_set = set(env._alive_agent_names())
    components = {}
    for agent in agents:
        agent_id = env._name_to_id[agent]
        previous_entity = _entity_by_agent_id(previous_snapshot or {}, agent_id)
        current_entity = _entity_by_agent_id(snapshot or {}, agent_id)
        previous_score = _score(previous_entity)
        current_score = _score(current_entity)
        previous_health = _health(previous_entity)
        current_health = _health(current_entity)
        is_alive = agent in alive_set
        components[agent] = {
            'raw': raw_rewards.get(agent, 0.0),
            'score_delta': current_score - previous_score,
            'health_delta': current_health - previous_health,
            'damage_taken': max(0.0, previous_health - current_health),
            'alive': 1.0 if is_alive else 0.0,
            'death': 0.0 if is_alive else 1.0,
            'truncation': 1.0 if done else 0.0,
            'step': 1.0,
        }
    return components


def weighted_rewards(config, components):
    """Evaluate weighted reward values from precomputed components."""

    config = make_reward_config(config)
    return {
        agent: sum(getattr(config, field) * values[field] for field in REWARD_FIELDS)
        for agent, values in components.items()
    }


def configured_rewards(config, env, result, snapshot, previous_snapshot, agents=None):
    return weighted_rewards(config, snapshot_reward_components(env, result, snapshot, previous_snapshot, agents))


# Backward-compatible public name used by existing scripts/tests.
reward_components = snapshot_reward_components


__all__ = ['RewardConfig', 'REWARD_FIELDS', 'make_reward_config', 'snapshot_reward_components', 'reward_components', 'weighted_rewards', 'configured_rewards']
