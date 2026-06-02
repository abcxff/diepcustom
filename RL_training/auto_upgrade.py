"""Helpers for automatic stat/tank upgrade selection in RL agents.

These helpers let a trainer or scripted policy keep movement/aim/fire under its
own control while automatically filling the optional headless upgrade channels.
"""

from dataclasses import dataclass, field


NO_UPGRADE = -1
STAT_COUNT = 8
TANK_UPGRADE_SLOT_COUNT = 6

PRESET_BUILDS = {
    'predator': {
        'display_name': 'Predator',
        'stat_targets': (0, 0, 0, 7, 7, 7, 7, 5),
        'tank_upgrade_map': {0: (1,), 6: (2,), 19: (0,)},
    },
    'pentashot': {
        'display_name': 'Penta Shot',
        'stat_targets': (0, 0, 0, 7, 7, 7, 7, 5),
        'tank_upgrade_map': {0: (0,), 1: (0,), 3: (1,)},
    },
    'fighter': {
        'display_name': 'Fighter',
        'stat_targets': (0, 2, 3, 0, 7, 7, 7, 7),
        'tank_upgrade_map': {0: (3,), 8: (0,), 9: (1,)},
    },
    'annihilator': {
        'display_name': 'Annihilator',
        'stat_targets': (0, 2, 3, 7, 7, 7, 0, 7),
        'tank_upgrade_map': {0: (2,), 7: (0,), 10: (1,)},
    },
}


def _normalized_order(order, valid_count):
    normalized = []
    for value in order or ():
        try:
            index = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= index < valid_count:
            normalized.append(index)
    return normalized


def _mask_value(mask, index):
    try:
        return float(mask[index])
    except (TypeError, IndexError, ValueError):
        return 0.0


def first_legal_choice(mask, preferred_order, valid_count):
    for index in _normalized_order(preferred_order, valid_count):
        if _mask_value(mask, index) > 0.0:
            return index
    return NO_UPGRADE


def stat_choice_for_targets(progression, stat_targets, preferred_order):
    current_levels = progression.get('stat_levels')
    if current_levels is None:
        current_levels = ()
    legal_mask = progression.get('legal_stat_upgrades')
    if legal_mask is None:
        legal_mask = ()
    for index in _normalized_order(preferred_order, STAT_COUNT):
        try:
            target_level = int(stat_targets[index])
        except (TypeError, IndexError, ValueError):
            continue
        try:
            current_level = int(float(current_levels[index]))
        except (TypeError, IndexError, ValueError):
            current_level = 0
        if current_level >= target_level:
            continue
        if _mask_value(legal_mask, index) > 0.0:
            return index
    return NO_UPGRADE


@dataclass
class AutoUpgradePolicy:
    """Choose legal upgrades from a configured stat order and tank slot map.

    Parameters
    ----------
    stat_order:
        Preferred stat indices in descending priority. Repeated values are
        allowed, but usually unnecessary because legality already encodes
        whether a stat can still be upgraded.
    tank_upgrade_map:
        Maps current tank id -> preferred tank upgrade slot order.
    default_tank_order:
        Fallback slot order when the current tank id is not in
        ``tank_upgrade_map``.
    prefer_tank_upgrade:
        If True, suppress stat upgrades on steps where a legal preferred tank
        upgrade is available.
    stat_targets:
        Optional exact per-stat target levels. When provided, the policy only
        spends points on stats that are still below their target.
    """

    stat_order: tuple[int, ...] = tuple(range(STAT_COUNT))
    tank_upgrade_map: dict[int, tuple[int, ...]] = field(default_factory=dict)
    default_tank_order: tuple[int, ...] = tuple()
    prefer_tank_upgrade: bool = False
    stat_targets: tuple[int, ...] | None = None

    def stat_choice(self, progression):
        if self.stat_targets is not None:
            return stat_choice_for_targets(progression, self.stat_targets, self.stat_order)
        return first_legal_choice(
            progression.get('legal_stat_upgrades'),
            self.stat_order,
            STAT_COUNT,
        )

    def tank_choice(self, progression):
        current_tank = int(float(progression.get('current_tank', 0.0)))
        preferred = self.tank_upgrade_map.get(current_tank, self.default_tank_order)
        return first_legal_choice(
            progression.get('legal_tank_upgrades'),
            preferred,
            TANK_UPGRADE_SLOT_COUNT,
        )

    def apply(self, action, progression):
        """Return a copy of ``action`` with upgrade fields filled in."""
        next_action = dict(action or {})
        tank_choice = self.tank_choice(progression)
        stat_choice = self.stat_choice(progression)
        if self.prefer_tank_upgrade and tank_choice != NO_UPGRADE:
            stat_choice = NO_UPGRADE
        next_action['stat_upgrade_choice'] = stat_choice
        next_action['tank_upgrade_choice'] = tank_choice
        return next_action


def apply_auto_upgrades(action, progression, *, stat_order=None, tank_upgrade_map=None, default_tank_order=None, prefer_tank_upgrade=False):
    """One-shot helper for callers that do not want to keep a policy object."""
    policy = AutoUpgradePolicy(
        stat_order=tuple(stat_order or tuple(range(STAT_COUNT))),
        tank_upgrade_map={int(k): tuple(v) for k, v in (tank_upgrade_map or {}).items()},
        default_tank_order=tuple(default_tank_order or ()),
        prefer_tank_upgrade=bool(prefer_tank_upgrade),
    )
    return policy.apply(action, progression)


def preset_auto_upgrade_policy(name, *, prefer_tank_upgrade=False):
    try:
        preset = PRESET_BUILDS[str(name).strip().lower()]
    except KeyError as exc:
        supported = ', '.join(sorted(PRESET_BUILDS))
        raise ValueError(f'unknown preset {name!r}; expected one of: {supported}') from exc
    stat_targets = tuple(int(value) for value in preset['stat_targets'])
    stat_order = tuple(sorted(range(STAT_COUNT), key=lambda index: (-stat_targets[index], index)))
    return AutoUpgradePolicy(
        stat_order=stat_order,
        stat_targets=stat_targets,
        tank_upgrade_map={int(k): tuple(v) for k, v in preset['tank_upgrade_map'].items()},
        prefer_tank_upgrade=bool(prefer_tank_upgrade),
    )


__all__ = [
    'NO_UPGRADE',
    'STAT_COUNT',
    'TANK_UPGRADE_SLOT_COUNT',
    'PRESET_BUILDS',
    'first_legal_choice',
    'stat_choice_for_targets',
    'AutoUpgradePolicy',
    'apply_auto_upgrades',
    'preset_auto_upgrade_policy',
]
