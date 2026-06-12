"""Combat observation contract helpers.

This module defines the markdown-spec combat observation schema used by the
headless C++ export and by Python-side conformance helpers. The PettingZoo/Gym
hot path reads combat buffers directly from C++; the builder here remains useful
for spec-level tests and upgrade-observation helpers.
"""

from __future__ import annotations

import math
from typing import Any, Iterable

from ..spaces import np

COMBAT_GRID_SHAPE = (18, 21, 21)
COMBAT_CELL_SIZE = 100.0
COMBAT_LEVEL_NORM = 45.0
COMBAT_STAT_NORM = 7.0
COMBAT_VELOCITY_NORM = 100.0
COMBAT_MAX_UPGRADE_TIER = 3.0
COMBAT_DAMAGE_DECAY_TICKS = 20.0
COMBAT_GRID_CHANNELS = (
    'wall',
    'farmable_presence',
    'farmable_value',
    'enemy_presence',
    'enemy_threat',
    'enemy_opportunity',
    'enemy_health_ratio',
    'enemy_relative_velocity_x',
    'enemy_relative_velocity_y',
    'enemy_type_balanced',
    'enemy_type_sniper',
    'enemy_type_spammer',
    'enemy_type_rammer',
    'enemy_type_area_control',
    'enemy_type_unknown',
    'projectile_presence',
    'projectile_relative_velocity_x',
    'projectile_relative_velocity_y',
)
TANK_CATEGORY_FIELDS = (
    'tank_category_balanced',
    'tank_category_sniper',
    'tank_category_spammer',
    'tank_category_rammer',
    'tank_category_area_control',
    'tank_category_unknown',
)
COMBAT_UNKNOWN_TANK_TYPE = 56
COMBAT_TANK_TYPE_COUNT = 57
COMBAT_SELF_FIELDS = (
    'health_ratio',
    'level_norm',
    'xp_progress_norm',
    'score_norm',
    'time_alive_norm',
    'current_velocity_x_norm',
    'current_velocity_y_norm',
    'reload_cooldown_norm',
    'movement_speed_norm',
    'current_upgrade_tier_norm',
    'max_health_stat_norm',
    'health_regen_stat_norm',
    'body_damage_stat_norm',
    'bullet_speed_stat_norm',
    'bullet_penetration_stat_norm',
    'bullet_damage_stat_norm',
    'reload_stat_norm',
    'movement_speed_stat_norm',
    'current_max_health_norm',
    'current_bullet_damage_norm',
    'current_bullet_speed_norm',
    'current_bullet_range_norm',
    'current_reload_time_norm',
    'current_movement_speed_norm',
    'recent_damage_taken_norm',
    'recent_damage_direction_x_norm',
    'recent_damage_direction_y_norm',
)
COMBAT_PREV_ACTION_FIELDS = ('move_x', 'move_y', 'aim_x', 'aim_y', 'fire')
UPGRADE_OBS_FIELDS = (
    *TANK_CATEGORY_FIELDS,
    'current_upgrade_tier_norm',
    'level_norm',
    'xp_progress_norm',
    'max_health_stat_norm',
    'health_regen_stat_norm',
    'body_damage_stat_norm',
    'bullet_speed_stat_norm',
    'bullet_penetration_stat_norm',
    'bullet_damage_stat_norm',
    'reload_stat_norm',
    'movement_speed_stat_norm',
    'available_stat_points_norm',
    'tank_upgrade_available_flag',
    'health_ratio',
    'score_norm',
    'time_alive_norm',
    'recent_score_gain_rate_norm',
    'recent_damage_taken_rate_norm',
    'recent_farming_rate_norm',
    'recent_enemy_pressure_norm',
    'recent_survival_trend_norm',
    'nearby_enemy_count_norm',
    'nearby_farmable_density_norm',
    'nearby_bullet_pressure_norm',
)

_CHANNEL_INDEX = {name: index for index, name in enumerate(COMBAT_GRID_CHANNELS)}
_SELF_FIELD_INDEX = {name: index for index, name in enumerate(COMBAT_SELF_FIELDS)}

TANK_CATEGORY_BALANCED = 0
TANK_CATEGORY_SNIPER = 1
TANK_CATEGORY_SPAMMER = 2
TANK_CATEGORY_RAMMER = 3
TANK_CATEGORY_AREA_CONTROL = 4
TANK_CATEGORY_UNKNOWN = 5
TANK_CATEGORY_COUNT = 6

_MAX_LEVEL_SCORE_REFERENCE = 0.0


def _level_to_score(level: int) -> float:
    if level <= 0:
        return 0.0
    level = min(int(level), int(COMBAT_LEVEL_NORM))
    score = 0.0
    for i in range(1, level):
        score += (40.0 / 9.0) * math.pow(1.06, i - 1) * min(31, i)
    return score


_MAX_LEVEL_SCORE_REFERENCE = _level_to_score(int(COMBAT_LEVEL_NORM))


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _clip_signed(value: float, scale: float) -> float:
    if scale <= 0.0:
        return 0.0
    return max(-1.0, min(1.0, float(value) / scale))


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_list(values: Iterable[Any] | None) -> list[Any]:
    if values is None:
        return []
    try:
        return list(values)
    except TypeError:
        return []


def _position(entity: dict[str, Any]) -> dict[str, Any]:
    return entity.get('position') or {}


def _velocity(entity: dict[str, Any]) -> dict[str, Any]:
    return entity.get('velocity') or {}


def _health(entity: dict[str, Any]) -> dict[str, Any]:
    return entity.get('health') or {}


def _score(entity: dict[str, Any]) -> dict[str, Any]:
    return entity.get('score') or {}


def _damage(entity: dict[str, Any]) -> dict[str, Any]:
    return entity.get('damage') or {}


def _projectile(entity: dict[str, Any]) -> dict[str, Any]:
    return entity.get('projectile') or {}


def _is_removed(entity: dict[str, Any]) -> bool:
    lifecycle = entity.get('lifecycle') or {}
    return bool(lifecycle.get('removed') or lifecycle.get('deleting'))


def _find_self_entity(snapshot: dict[str, Any], agent_id: int) -> dict[str, Any] | None:
    for entity in snapshot.get('entities', ()):
        if entity.get('id') == agent_id and entity.get('kind') == 'agent':
            return entity
    return None


def _grid_indices(entity: dict[str, Any], self_entity: dict[str, Any], *, cell_size: float) -> tuple[int, int] | None:
    rows, cols = COMBAT_GRID_SHAPE[1:]
    pos = _position(entity)
    self_pos = _position(self_entity)
    col = int(math.floor((_as_float(pos.get('x')) - _as_float(self_pos.get('x'))) / cell_size)) + cols // 2
    row = int(math.floor((_as_float(pos.get('y')) - _as_float(self_pos.get('y'))) / cell_size)) + rows // 2
    if row < 0 or row >= rows or col < 0 or col >= cols:
        return None
    return row, col


def _normalize_score(score: float) -> float:
    reference = max(1.0, _MAX_LEVEL_SCORE_REFERENCE)
    return _clip01(math.log1p(max(0.0, score)) / math.log1p(reference))


def _level_progress(score: float, level: int) -> float:
    if level >= int(COMBAT_LEVEL_NORM):
        return 1.0
    current_floor = _level_to_score(level)
    next_floor = _level_to_score(level + 1)
    if next_floor <= current_floor:
        return 0.0
    return _clip01((score - current_floor) / (next_floor - current_floor))


def _normalize_iterable(values: Iterable[Any] | None, length: int, *, scale: float = COMBAT_STAT_NORM) -> list[float]:
    seq = _as_list(values)
    return [_clip01(_as_float(seq[index]) / scale) if index < len(seq) else 0.0 for index in range(length)]


def _category_one_hot(category: int) -> list[float]:
    hot = [0.0] * TANK_CATEGORY_COUNT
    hot[max(0, min(TANK_CATEGORY_UNKNOWN, int(category)))] = 1.0
    return hot


def _category_name(category: int) -> str:
    return (
        'balanced',
        'sniper',
        'spammer',
        'rammer',
        'area_control',
        'unknown',
    )[max(0, min(TANK_CATEGORY_UNKNOWN, int(category)))]


def _upgrade_tier_for_tank(tank_id: int) -> float:
    if tank_id <= 0:
        return 0.0
    if tank_id in {
        1, 6, 7, 8, 36,
    }:
        return 1.0
    if tank_id in {
        3, 4, 9, 10, 11, 13, 14, 15, 19, 20, 23, 24, 29, 31, 39, 40, 41, 42, 43,
    }:
        return 2.0
    return 3.0


_TANK_CATEGORY_BY_ID = {
    0: TANK_CATEGORY_BALANCED,
    1: TANK_CATEGORY_BALANCED,
    2: TANK_CATEGORY_SPAMMER,
    3: TANK_CATEGORY_SPAMMER,
    4: TANK_CATEGORY_SPAMMER,
    5: TANK_CATEGORY_SPAMMER,
    6: TANK_CATEGORY_SNIPER,
    7: TANK_CATEGORY_SPAMMER,
    8: TANK_CATEGORY_BALANCED,
    9: TANK_CATEGORY_RAMMER,
    10: TANK_CATEGORY_BALANCED,
    11: TANK_CATEGORY_AREA_CONTROL,
    12: TANK_CATEGORY_AREA_CONTROL,
    13: TANK_CATEGORY_SPAMMER,
    14: TANK_CATEGORY_SPAMMER,
    15: TANK_CATEGORY_SNIPER,
    16: TANK_CATEGORY_UNKNOWN,
    17: TANK_CATEGORY_AREA_CONTROL,
    18: TANK_CATEGORY_SPAMMER,
    19: TANK_CATEGORY_SNIPER,
    20: TANK_CATEGORY_SPAMMER,
    21: TANK_CATEGORY_SNIPER,
    22: TANK_CATEGORY_SNIPER,
    23: TANK_CATEGORY_RAMMER,
    24: TANK_CATEGORY_RAMMER,
    25: TANK_CATEGORY_BALANCED,
    26: TANK_CATEGORY_AREA_CONTROL,
    27: TANK_CATEGORY_AREA_CONTROL,
    28: TANK_CATEGORY_SNIPER,
    29: TANK_CATEGORY_SPAMMER,
    31: TANK_CATEGORY_AREA_CONTROL,
    32: TANK_CATEGORY_AREA_CONTROL,
    33: TANK_CATEGORY_AREA_CONTROL,
    34: TANK_CATEGORY_AREA_CONTROL,
    35: TANK_CATEGORY_AREA_CONTROL,
    36: TANK_CATEGORY_RAMMER,
    38: TANK_CATEGORY_RAMMER,
    39: TANK_CATEGORY_SPAMMER,
    40: TANK_CATEGORY_SPAMMER,
    41: TANK_CATEGORY_SPAMMER,
    42: TANK_CATEGORY_SPAMMER,
    43: TANK_CATEGORY_SPAMMER,
    44: TANK_CATEGORY_AREA_CONTROL,
    45: TANK_CATEGORY_AREA_CONTROL,
    46: TANK_CATEGORY_AREA_CONTROL,
    47: TANK_CATEGORY_AREA_CONTROL,
    48: TANK_CATEGORY_AREA_CONTROL,
    49: TANK_CATEGORY_BALANCED,
    50: TANK_CATEGORY_RAMMER,
    51: TANK_CATEGORY_RAMMER,
    52: TANK_CATEGORY_AREA_CONTROL,
    54: TANK_CATEGORY_BALANCED,
    55: TANK_CATEGORY_BALANCED,
}


_MATCHUP = {
    TANK_CATEGORY_BALANCED: (0.50, 0.50, 0.50, 0.45, 0.45, 0.50),
    TANK_CATEGORY_SNIPER: (0.60, 0.50, 0.55, 0.25, 0.50, 0.45),
    TANK_CATEGORY_SPAMMER: (0.55, 0.45, 0.50, 0.60, 0.45, 0.50),
    TANK_CATEGORY_RAMMER: (0.55, 0.70, 0.45, 0.50, 0.35, 0.45),
    TANK_CATEGORY_AREA_CONTROL: (0.55, 0.45, 0.55, 0.65, 0.50, 0.50),
    TANK_CATEGORY_UNKNOWN: (0.50, 0.45, 0.50, 0.45, 0.45, 0.50),
}

_THREAT_WEIGHTS = {
    TANK_CATEGORY_BALANCED: (0.25, 0.20, 0.20, 0.20, 0.15),
    TANK_CATEGORY_SNIPER: (0.15, 0.30, 0.20, 0.25, 0.10),
    TANK_CATEGORY_SPAMMER: (0.20, 0.15, 0.20, 0.30, 0.15),
    TANK_CATEGORY_RAMMER: (0.15, 0.25, 0.15, 0.20, 0.25),
    TANK_CATEGORY_AREA_CONTROL: (0.20, 0.15, 0.25, 0.25, 0.15),
    TANK_CATEGORY_UNKNOWN: (0.20, 0.20, 0.20, 0.20, 0.20),
}

_OPPORTUNITY_WEIGHTS = {
    TANK_CATEGORY_BALANCED: (0.20, 0.15, 0.10, 0.20, 0.15, 0.15, 0.10),
    TANK_CATEGORY_SNIPER: (0.30, 0.10, 0.05, 0.15, 0.10, 0.20, 0.10),
    TANK_CATEGORY_SPAMMER: (0.22, 0.10, 0.10, 0.18, 0.15, 0.10, 0.15),
    TANK_CATEGORY_RAMMER: (0.28, 0.20, 0.20, 0.12, 0.10, 0.05, 0.05),
    TANK_CATEGORY_AREA_CONTROL: (0.18, 0.10, 0.12, 0.15, 0.12, 0.18, 0.15),
    TANK_CATEGORY_UNKNOWN: (0.18, 0.12, 0.10, 0.15, 0.12, 0.13, 0.10),
}

_RANGE_PROFILES = {
    TANK_CATEGORY_BALANCED: (0.15, 0.50, 0.85),
    TANK_CATEGORY_SNIPER: (0.35, 0.70, 1.00),
    TANK_CATEGORY_SPAMMER: (0.20, 0.55, 0.90),
    TANK_CATEGORY_RAMMER: (0.00, 0.18, 0.45),
    TANK_CATEGORY_AREA_CONTROL: (0.25, 0.60, 0.95),
    TANK_CATEGORY_UNKNOWN: (0.20, 0.50, 0.85),
}

_BASE_DERIVED_BY_CATEGORY = {
    TANK_CATEGORY_BALANCED: {'health': 50.0, 'bullet_damage': 7.0, 'bullet_speed': 50.0, 'bullet_range': 75.0 * 50.0, 'reload': 15.0, 'movement': 1.25},
    TANK_CATEGORY_SNIPER: {'health': 45.0, 'bullet_damage': 8.5, 'bullet_speed': 58.0, 'bullet_range': 92.0 * 58.0, 'reload': 18.0, 'movement': 1.15},
    TANK_CATEGORY_SPAMMER: {'health': 50.0, 'bullet_damage': 6.0, 'bullet_speed': 48.0, 'bullet_range': 72.0 * 48.0, 'reload': 11.0, 'movement': 1.20},
    TANK_CATEGORY_RAMMER: {'health': 60.0, 'bullet_damage': 5.0, 'bullet_speed': 42.0, 'bullet_range': 62.0 * 42.0, 'reload': 14.0, 'movement': 1.45},
    TANK_CATEGORY_AREA_CONTROL: {'health': 55.0, 'bullet_damage': 6.5, 'bullet_speed': 44.0, 'bullet_range': 100.0 * 44.0, 'reload': 16.0, 'movement': 1.05},
    TANK_CATEGORY_UNKNOWN: {'health': 50.0, 'bullet_damage': 6.5, 'bullet_speed': 48.0, 'bullet_range': 75.0 * 48.0, 'reload': 15.0, 'movement': 1.15},
}

_MAX_DERIVED_REFERENCE = {
    'health': 100.0,
    'bullet_damage': 16.0,
    'bullet_speed': 75.0,
    'bullet_range': 9000.0,
    'reload': 20.0,
    'movement': 2.2,
}


def tank_category_for_id(tank_id: int) -> int:
    return _TANK_CATEGORY_BY_ID.get(int(tank_id), TANK_CATEGORY_UNKNOWN)


def derived_combat_stats(
    *,
    tank_id: int,
    stat_levels: Iterable[Any] | None = None,
) -> dict[str, float]:
    stat_levels = [max(0.0, _as_float(value)) for value in _as_list(stat_levels)[:8]]
    while len(stat_levels) < 8:
        stat_levels.append(0.0)
    category = tank_category_for_id(tank_id)
    base = _BASE_DERIVED_BY_CATEGORY[category]
    max_health = base['health'] * (1.0 + 0.12 * stat_levels[0])
    bullet_damage = base['bullet_damage'] * (1.0 + 0.08 * stat_levels[4] + 0.10 * stat_levels[5])
    bullet_speed = base['bullet_speed'] * (1.0 + 0.08 * stat_levels[3])
    bullet_range = base['bullet_range'] * (1.0 + 0.06 * stat_levels[4] + 0.04 * stat_levels[3])
    reload_time = max(4.0, base['reload'] * (1.0 - 0.06 * stat_levels[6]))
    movement_speed = base['movement'] * (1.0 + 0.06 * stat_levels[7])
    return {
        'max_health': max_health,
        'bullet_damage': bullet_damage,
        'bullet_speed': bullet_speed,
        'bullet_range': bullet_range,
        'reload_time': reload_time,
        'movement_speed': movement_speed,
    }


def _enemy_type_threat_score(enemy_category: int) -> float:
    return {
        TANK_CATEGORY_BALANCED: 0.50,
        TANK_CATEGORY_SNIPER: 0.60,
        TANK_CATEGORY_SPAMMER: 0.58,
        TANK_CATEGORY_RAMMER: 0.72,
        TANK_CATEGORY_AREA_CONTROL: 0.62,
        TANK_CATEGORY_UNKNOWN: 0.50,
    }[enemy_category]


def _range_fit_score(self_category: int, distance_norm: float) -> float:
    min_good, ideal, max_good = _RANGE_PROFILES[self_category]
    if distance_norm <= ideal:
        span = max(1e-6, ideal - min_good)
        return _clip01((distance_norm - min_good) / span)
    span = max(1e-6, max_good - ideal)
    return _clip01(1.0 - ((distance_norm - ideal) / span))


def _threat_and_opportunity(
    *,
    self_category: int,
    enemy_category: int,
    distance: float,
    grid_radius: float,
    self_vx: float,
    self_vy: float,
    enemy_vx: float,
    enemy_vy: float,
    enemy_health_ratio: float,
    enemy_score_norm: float,
    bullet_pressure: float,
    self_stats: dict[str, float],
    self_aim_x: float,
    self_aim_y: float,
    dx: float,
    dy: float,
) -> tuple[float, float]:
    distance_norm = _clip01(distance / max(1.0, grid_radius))
    relative_vx = enemy_vx - self_vx
    relative_vy = enemy_vy - self_vy
    closing_score = 0.0
    if distance > 1e-6:
        closing = -((dx / distance) * relative_vx + (dy / distance) * relative_vy)
        closing_score = _clip01(closing / COMBAT_VELOCITY_NORM)
    relative_strength = _clip01((enemy_health_ratio * 0.75) + (1.0 - _clip01(self_stats['max_health'] / _MAX_DERIVED_REFERENCE['health'])) * 0.25)
    threat_weights = _THREAT_WEIGHTS[self_category]
    distance_threat = 1.0 - distance_norm
    enemy_type_threat = _enemy_type_threat_score(enemy_category)
    threat = (
        threat_weights[0] * distance_threat
        + threat_weights[1] * closing_score
        + threat_weights[2] * enemy_type_threat
        + threat_weights[3] * bullet_pressure
        + threat_weights[4] * relative_strength
    )
    line_of_fire = 0.0
    if distance > 1e-6:
        line_of_fire = _clip01((((dx / distance) * self_aim_x) + ((dy / distance) * self_aim_y) + 1.0) * 0.5)
    strength_advantage = _clip01((self_stats['bullet_damage'] / max(1.0, _MAX_DERIVED_REFERENCE['bullet_damage'])) + (1.0 - enemy_health_ratio)) * 0.5
    catchability = _clip01(1.0 - (math.hypot(relative_vx, relative_vy) / (COMBAT_VELOCITY_NORM * 1.25)))
    matchup_score = _MATCHUP[self_category][enemy_category]
    target_value = enemy_score_norm
    pressure_penalty = bullet_pressure
    opportunity_weights = _OPPORTUNITY_WEIGHTS[self_category]
    opportunity = (
        opportunity_weights[0] * _range_fit_score(self_category, distance_norm)
        + opportunity_weights[1] * strength_advantage
        + opportunity_weights[2] * catchability
        + opportunity_weights[3] * matchup_score
        + opportunity_weights[4] * target_value
        + opportunity_weights[5] * line_of_fire
        - opportunity_weights[6] * pressure_penalty
    )
    return _clip01(threat), _clip01(opportunity)


def _entity_score_norm(entity: dict[str, Any]) -> float:
    score = _score(entity)
    return _normalize_score(_as_float(score.get('score')) + _as_float(score.get('scoreReward')))


def _farmable_value(entity: dict[str, Any]) -> float:
    score = _score(entity)
    health = _health(entity)
    value = (
        (_as_float(score.get('scoreReward')) / 130.0) * 0.70
        + (_clip01(_as_float(health.get('maxHealth')) / 100.0)) * 0.30
    )
    return _clip01(value)


class CombatObservationBuilder:
    """Build spec-shaped combat observations from local visible state."""

    def __init__(self, *, shape: tuple[int, int, int] = COMBAT_GRID_SHAPE, cell_size: float = COMBAT_CELL_SIZE):
        if tuple(shape) != COMBAT_GRID_SHAPE:
            raise ValueError(f'combat observation shape is fixed at {COMBAT_GRID_SHAPE}')
        self.shape = tuple(shape)
        self.cell_size = float(cell_size)

    def build(
        self,
        *,
        snapshot: dict[str, Any],
        agent_id: int,
        state_row: Any,
        progression: dict[str, Any],
        prev_action: Any | None = None,
        combat_state: dict[str, Any] | None = None,
        max_episode_ticks: int = 1000,
    ) -> dict[str, Any]:
        combat_state = dict(combat_state or {})
        self_entity = _find_self_entity(snapshot, agent_id)
        return {
            'grid_obs': self._grid(snapshot, self_entity, progression, combat_state),
            'self_obs': self._self(snapshot, self_entity, state_row, progression, combat_state, max_episode_ticks=max_episode_ticks),
            'prev_action_obs': self.previous_action_observation(prev_action),
            'tank_type_obs': np.asarray(_tank_type_observation(progression.get('current_tank')), dtype=np.int64),
        }

    def _grid(
        self,
        snapshot: dict[str, Any],
        self_entity: dict[str, Any] | None,
        progression: dict[str, Any],
        combat_state: dict[str, Any],
    ):
        grid = np.zeros(COMBAT_GRID_SHAPE, dtype=np.float32)
        if self_entity is None:
            return grid
        rows, cols = COMBAT_GRID_SHAPE[1:]
        arena = snapshot.get('arena') or {}
        self_pos = _position(self_entity)
        self_vel = _velocity(self_entity)
        self_x = _as_float(self_pos.get('x'))
        self_y = _as_float(self_pos.get('y'))
        self_vx = _as_float(self_vel.get('x'))
        self_vy = _as_float(self_vel.get('y'))
        self_angle = _as_float(self_pos.get('angle'))
        self_aim_x = math.cos(self_angle)
        self_aim_y = math.sin(self_angle)
        self_team = self_entity.get('teamId')
        self_category = tank_category_for_id(_as_int(progression.get('current_tank')))
        grid_radius = max(1.0, (rows // 2) * self.cell_size)
        left = _as_float(arena.get('leftX'), -1000.0)
        right = _as_float(arena.get('rightX'), 1000.0)
        top = _as_float(arena.get('topY'), -1000.0)
        bottom = _as_float(arena.get('bottomY'), 1000.0)

        for row in range(rows):
            world_y = self_y + (row - rows // 2) * self.cell_size
            for col in range(cols):
                world_x = self_x + (col - cols // 2) * self.cell_size
                if world_x < left or world_x > right or world_y < top or world_y > bottom:
                    grid[_CHANNEL_INDEX['wall'], row, col] = 1.0

        cell_farmable: dict[tuple[int, int], tuple[float, float]] = {}
        cell_enemy: dict[tuple[int, int], tuple[float, dict[str, float]]] = {}
        cell_bullet: dict[tuple[int, int], tuple[float, dict[str, float]]] = {}
        self_stats = derived_combat_stats(
            tank_id=_as_int(progression.get('current_tank')),
            stat_levels=progression.get('stat_levels'),
        )

        enemy_projectiles = []
        for entity in snapshot.get('entities', ()):
            if _is_removed(entity) or entity.get('kind') != 'projectile' or entity.get('teamId') == self_team:
                continue
            pos = _position(entity)
            dx = _as_float(pos.get('x')) - self_x
            dy = _as_float(pos.get('y')) - self_y
            enemy_projectiles.append((entity, math.hypot(dx, dy)))

        for entity in snapshot.get('entities', ()):
            if _is_removed(entity) or entity.get('id') == self_entity.get('id'):
                continue
            indices = _grid_indices(entity, self_entity, cell_size=self.cell_size)
            if indices is None:
                continue
            row, col = indices
            pos = _position(entity)
            vel = _velocity(entity)
            dx = _as_float(pos.get('x')) - self_x
            dy = _as_float(pos.get('y')) - self_y
            distance = math.hypot(dx, dy)
            kind = entity.get('kind')
            if kind == 'shape':
                value = _farmable_value(entity)
                rank = value * 0.8 + (1.0 - _clip01(distance / grid_radius)) * 0.2
                previous = cell_farmable.get((row, col))
                if previous is None or rank > previous[0]:
                    cell_farmable[(row, col)] = (rank, {'value': value})
                continue

            same_team = entity.get('teamId') == self_team
            if kind not in ('agent', 'crasher', 'projectile') or same_team:
                continue

            if kind == 'projectile':
                vel_x = _as_float(vel.get('x')) - self_vx
                vel_y = _as_float(vel.get('y')) - self_vy
                danger = _clip01((1.0 - distance / grid_radius) * 0.5 + (math.hypot(vel_x, vel_y) / (COMBAT_VELOCITY_NORM * 2.0)) * 0.5)
                previous = cell_bullet.get((row, col))
                if previous is None or danger > previous[0]:
                    cell_bullet[(row, col)] = (
                        danger,
                        {
                            'velocity_x': _clip_signed(vel_x, COMBAT_VELOCITY_NORM),
                            'velocity_y': _clip_signed(vel_y, COMBAT_VELOCITY_NORM),
                        },
                    )
                continue

            enemy_tank = 36 if kind == 'crasher' else _as_int(entity.get('currentTankId'))
            enemy_category = TANK_CATEGORY_RAMMER if kind == 'crasher' else tank_category_for_id(enemy_tank)
            pressure = 0.0
            for projectile, projectile_distance in enemy_projectiles:
                proj_pos = _position(projectile)
                pdx = _as_float(proj_pos.get('x')) - _as_float(pos.get('x'))
                pdy = _as_float(proj_pos.get('y')) - _as_float(pos.get('y'))
                if math.hypot(pdx, pdy) <= self.cell_size * 2.0:
                    pressure = max(pressure, _clip01(1.0 - projectile_distance / grid_radius))
            enemy_health = _health(entity)
            enemy_max_health = _as_float(enemy_health.get('maxHealth'))
            enemy_health_ratio = _clip01(_as_float(enemy_health.get('health')) / enemy_max_health) if enemy_max_health > 0.0 else 0.0
            threat, opportunity = _threat_and_opportunity(
                self_category=self_category,
                enemy_category=enemy_category,
                distance=distance,
                grid_radius=grid_radius,
                self_vx=self_vx,
                self_vy=self_vy,
                enemy_vx=_as_float(vel.get('x')),
                enemy_vy=_as_float(vel.get('y')),
                enemy_health_ratio=enemy_health_ratio,
                enemy_score_norm=_entity_score_norm(entity),
                bullet_pressure=pressure,
                self_stats=self_stats,
                self_aim_x=self_aim_x,
                self_aim_y=self_aim_y,
                dx=dx,
                dy=dy,
            )
            relevance = 0.45 * threat + 0.35 * opportunity + 0.10 * (1.0 - _clip01(distance / grid_radius)) + 0.10 * _entity_score_norm(entity)
            previous = cell_enemy.get((row, col))
            if previous is None or relevance > previous[0]:
                cell_enemy[(row, col)] = (
                    relevance,
                    {
                        'threat': threat,
                        'opportunity': opportunity,
                        'health_ratio': enemy_health_ratio,
                        'velocity_x': _clip_signed(_as_float(vel.get('x')) - self_vx, COMBAT_VELOCITY_NORM),
                        'velocity_y': _clip_signed(_as_float(vel.get('y')) - self_vy, COMBAT_VELOCITY_NORM),
                        'category': float(enemy_category),
                    },
                )

        for (row, col), (_, farmable) in cell_farmable.items():
            grid[_CHANNEL_INDEX['farmable_presence'], row, col] = 1.0
            grid[_CHANNEL_INDEX['farmable_value'], row, col] = float(farmable['value'])

        for (row, col), (_, bullet) in cell_bullet.items():
            grid[_CHANNEL_INDEX['projectile_presence'], row, col] = 1.0
            grid[_CHANNEL_INDEX['projectile_relative_velocity_x'], row, col] = float(bullet['velocity_x'])
            grid[_CHANNEL_INDEX['projectile_relative_velocity_y'], row, col] = float(bullet['velocity_y'])

        for (row, col), (_, enemy) in cell_enemy.items():
            category = int(enemy['category'])
            grid[_CHANNEL_INDEX['enemy_presence'], row, col] = 1.0
            grid[_CHANNEL_INDEX['enemy_threat'], row, col] = float(enemy['threat'])
            grid[_CHANNEL_INDEX['enemy_opportunity'], row, col] = float(enemy['opportunity'])
            grid[_CHANNEL_INDEX['enemy_health_ratio'], row, col] = float(enemy['health_ratio'])
            grid[_CHANNEL_INDEX['enemy_relative_velocity_x'], row, col] = float(enemy['velocity_x'])
            grid[_CHANNEL_INDEX['enemy_relative_velocity_y'], row, col] = float(enemy['velocity_y'])
            grid[_CHANNEL_INDEX[f'enemy_type_{_category_name(category)}'], row, col] = 1.0
        return grid

    def _self(
        self,
        snapshot: dict[str, Any],
        self_entity: dict[str, Any] | None,
        state_row: Any,
        progression: dict[str, Any],
        combat_state: dict[str, Any],
        *,
        max_episode_ticks: int,
    ):
        values = list(state_row) if state_row is not None else []

        def state(index: int, default: float = 0.0) -> float:
            try:
                return float(values[index])
            except (TypeError, IndexError, ValueError):
                return default

        health = state(6)
        max_health = state(7, 1.0)
        score = state(8)
        vx = state(4)
        vy = state(5)
        if self_entity is not None:
            vel = _velocity(self_entity)
            health_row = _health(self_entity)
            score_row = _score(self_entity)
            vx = _as_float(vel.get('x'), vx)
            vy = _as_float(vel.get('y'), vy)
            health = _as_float(health_row.get('health'), health)
            max_health = _as_float(health_row.get('maxHealth'), max_health)
            score = _as_float(score_row.get('score'), score)
        level = _as_int(progression.get('level'))
        tank_id = _as_int(progression.get('current_tank'))
        stat_levels_raw = _as_list(progression.get('stat_levels'))
        stat_levels_norm = _normalize_iterable(stat_levels_raw, 8)
        derived = derived_combat_stats(tank_id=tank_id, stat_levels=stat_levels_raw)
        score_norm = _normalize_score(score)
        tick = _as_float(snapshot.get('tick'))
        time_alive_ticks = _as_float(combat_state.get('time_alive_ticks'), tick)
        reload_remaining = _as_float(combat_state.get('reload_cooldown_remaining'))
        reload_total = max(1e-6, _as_float(combat_state.get('current_reload_time'), derived['reload_time']))
        recent_damage_taken = _as_float(combat_state.get('recent_damage_taken'))
        recent_damage_direction_x = max(-1.0, min(1.0, _as_float(combat_state.get('recent_damage_direction_x'))))
        recent_damage_direction_y = max(-1.0, min(1.0, _as_float(combat_state.get('recent_damage_direction_y'))))
        if self_entity is not None:
            damage = _damage(self_entity)
            cooldown = self_entity.get('cooldown') or {}
            if reload_remaining <= 0.0:
                reload_remaining = _as_float(cooldown.get('remaining'))
            if reload_total <= 1e-6 or abs(reload_total - derived['reload_time']) <= 1e-6:
                reload_total = max(1e-6, _as_float(cooldown.get('base'), derived['reload_time']))
            if recent_damage_taken <= 0.0:
                recent_damage_taken = _as_float(damage.get('recentTaken'))
            if recent_damage_direction_x == 0.0:
                recent_damage_direction_x = max(-1.0, min(1.0, _as_float(damage.get('recentDirectionX'))))
            if recent_damage_direction_y == 0.0:
                recent_damage_direction_y = max(-1.0, min(1.0, _as_float(damage.get('recentDirectionY'))))
            if recent_damage_taken <= 0.0:
                last_damage_tick = _as_float(damage.get('lastDamageTick'), -1.0)
                if last_damage_tick >= 0.0 and tick >= last_damage_tick:
                    recent_damage_taken = max(0.0, 1.0 - ((tick - last_damage_tick) / COMBAT_DAMAGE_DECAY_TICKS)) * max_health * 0.25
        obs = [
            _clip01(health / max(1.0, derived['max_health'])),
            _clip01(level / COMBAT_LEVEL_NORM),
            _level_progress(score, level),
            score_norm,
            _clip01(time_alive_ticks / max(1.0, float(max_episode_ticks))),
            _clip_signed(vx, _MAX_DERIVED_REFERENCE['movement'] * COMBAT_VELOCITY_NORM),
            _clip_signed(vy, _MAX_DERIVED_REFERENCE['movement'] * COMBAT_VELOCITY_NORM),
            _clip01(reload_remaining / reload_total),
            _clip01(derived['movement_speed'] / _MAX_DERIVED_REFERENCE['movement']),
            _clip01(_upgrade_tier_for_tank(tank_id) / COMBAT_MAX_UPGRADE_TIER),
            *stat_levels_norm,
            _clip01(derived['max_health'] / _MAX_DERIVED_REFERENCE['health']),
            _clip01(derived['bullet_damage'] / _MAX_DERIVED_REFERENCE['bullet_damage']),
            _clip01(derived['bullet_speed'] / _MAX_DERIVED_REFERENCE['bullet_speed']),
            _clip01(derived['bullet_range'] / _MAX_DERIVED_REFERENCE['bullet_range']),
            _clip01(derived['reload_time'] / _MAX_DERIVED_REFERENCE['reload']),
            _clip01(derived['movement_speed'] / _MAX_DERIVED_REFERENCE['movement']),
            _clip01(recent_damage_taken / max(1.0, derived['max_health'])),
            recent_damage_direction_x,
            recent_damage_direction_y,
        ]
        return np.asarray(obs, dtype=np.float32)

    @staticmethod
    def previous_action_observation(action: Any | None):
        if action is None:
            return np.zeros((len(COMBAT_PREV_ACTION_FIELDS),), dtype=np.float32)
        if isinstance(action, dict):
            move = action.get('move') or (0.0, 0.0)
            aim = action.get('aim') or (1.0, 0.0)
            buttons = action.get('buttons') or (0, 0)
            raw = [move[0], move[1], aim[0], aim[1], buttons[0]]
        else:
            try:
                values = list(action)
            except TypeError:
                values = []
            raw = [0.0, 0.0, 1.0, 0.0, 0.0]
            for index, value in enumerate(values[:5]):
                raw[index] = value
        return np.asarray(
            [
                max(-1.0, min(1.0, _as_float(raw[0]))),
                max(-1.0, min(1.0, _as_float(raw[1]))),
                max(-1.0, min(1.0, _as_float(raw[2]))),
                max(-1.0, min(1.0, _as_float(raw[3]))),
                1.0 if _as_float(raw[4]) >= 0.5 else 0.0,
            ],
            dtype=np.float32,
        )


def build_upgrade_observation_package(
    *,
    snapshot: dict[str, Any],
    progression: dict[str, Any],
    combat_state: dict[str, Any] | None = None,
    max_episode_ticks: int = 1000,
) -> dict[str, Any]:
    combat_state = dict(combat_state or {})
    tank_id = _as_int(progression.get('current_tank'))
    level = _as_int(progression.get('level'))
    stat_levels_raw = _as_list(progression.get('stat_levels'))
    stats_available = _as_float(progression.get('stats_available'))
    can_tank_upgrade = _clip01(_as_float(progression.get('can_tank_upgrade')))
    derived = derived_combat_stats(tank_id=tank_id, stat_levels=stat_levels_raw)
    score = _as_float(combat_state.get('score'))
    health_ratio = _clip01(_as_float(combat_state.get('health_ratio'), 1.0))
    time_alive_ticks = _as_float(combat_state.get('time_alive_ticks'), _as_float(snapshot.get('tick')))
    recent_damage_rate = _clip01(_as_float(combat_state.get('recent_damage_taken'), 0.0) / max(1.0, derived['max_health']))
    nearby_enemy_count_norm = _clip01(_as_float(combat_state.get('nearby_enemy_count')) / 8.0)
    nearby_farmable_density_norm = _clip01(_as_float(combat_state.get('nearby_farmable_density')))
    nearby_bullet_pressure_norm = _clip01(_as_float(combat_state.get('nearby_bullet_pressure')))
    obs = [
        *_category_one_hot(tank_category_for_id(tank_id)),
        _clip01(_upgrade_tier_for_tank(tank_id) / COMBAT_MAX_UPGRADE_TIER),
        _clip01(level / COMBAT_LEVEL_NORM),
        _level_progress(score, level),
        *_normalize_iterable(stat_levels_raw, 8),
        _clip01(stats_available / 33.0),
        can_tank_upgrade,
        health_ratio,
        _normalize_score(score),
        _clip01(time_alive_ticks / max(1.0, float(max_episode_ticks))),
        _clip01(_as_float(combat_state.get('recent_score_gain_rate_norm'))),
        recent_damage_rate,
        _clip01(_as_float(combat_state.get('recent_farming_rate_norm'))),
        _clip01(_as_float(combat_state.get('recent_enemy_pressure_norm'))),
        _clip01(_as_float(combat_state.get('recent_survival_trend_norm'))),
        nearby_enemy_count_norm,
        nearby_farmable_density_norm,
        nearby_bullet_pressure_norm,
    ]
    return {
        'upgrade_obs': np.asarray(obs, dtype=np.float32),
        'stat_upgrade_mask': np.asarray((_as_list(progression.get('legal_stat_upgrades')) or [0.0] * 8), dtype=np.float32)[:8],
        'tank_upgrade_mask': np.asarray((_as_list(progression.get('legal_tank_upgrades')) or [0.0] * 6), dtype=np.float32)[:6],
    }


def build_combat_observation(**kwargs):
    return CombatObservationBuilder().build(**kwargs)


def _tank_type_observation(tank_id: Any) -> int:
    tank_id = _as_int(tank_id, COMBAT_UNKNOWN_TANK_TYPE)
    if tank_id < 0 or tank_id >= COMBAT_UNKNOWN_TANK_TYPE:
        return COMBAT_UNKNOWN_TANK_TYPE
    return tank_id


COMBAT_GRID_LOW = np.zeros(COMBAT_GRID_SHAPE, dtype=np.float32)
COMBAT_GRID_HIGH = np.ones(COMBAT_GRID_SHAPE, dtype=np.float32)
for channel_name in ('enemy_relative_velocity_x', 'enemy_relative_velocity_y', 'projectile_relative_velocity_x', 'projectile_relative_velocity_y'):
    COMBAT_GRID_LOW[_CHANNEL_INDEX[channel_name], :, :] = -1.0

COMBAT_SELF_LOW = np.asarray(
    [
        0.0, 0.0, 0.0, 0.0, 0.0,
        -1.0, -1.0,
        0.0, 0.0, 0.0,
        *([0.0] * 8),
        *([0.0] * 6),
        0.0, -1.0, -1.0,
    ],
    dtype=np.float32,
)
COMBAT_SELF_HIGH = np.asarray(
    [
        1.0, 1.0, 1.0, 1.0, 1.0,
        1.0, 1.0,
        1.0, 1.0, 1.0,
        *([1.0] * 8),
        *([1.0] * 6),
        1.0, 1.0, 1.0,
    ],
    dtype=np.float32,
)
COMBAT_PREV_ACTION_LOW = np.asarray([-1.0, -1.0, -1.0, -1.0, 0.0], dtype=np.float32)
COMBAT_PREV_ACTION_HIGH = np.asarray([1.0, 1.0, 1.0, 1.0, 1.0], dtype=np.float32)


__all__ = [
    'COMBAT_GRID_CHANNELS',
    'COMBAT_GRID_HIGH',
    'COMBAT_GRID_LOW',
    'COMBAT_GRID_SHAPE',
    'COMBAT_PREV_ACTION_FIELDS',
    'COMBAT_PREV_ACTION_HIGH',
    'COMBAT_PREV_ACTION_LOW',
    'COMBAT_SELF_FIELDS',
    'COMBAT_SELF_HIGH',
    'COMBAT_SELF_LOW',
    'COMBAT_TANK_TYPE_COUNT',
    'COMBAT_UNKNOWN_TANK_TYPE',
    'TANK_CATEGORY_FIELDS',
    'CombatObservationBuilder',
    'build_combat_observation',
    'build_upgrade_observation_package',
    'derived_combat_stats',
    'tank_category_for_id',
]
