"""Action conversion helpers for Python RL training."""

from .headless import DiepAction, noop_action


def _pair(values, default):
    if values is None:
        return default
    try:
        return float(values[0]), float(values[1])
    except (TypeError, IndexError, ValueError):
        return default


def _optional_choice(value, default=-1):
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _button_flags(buttons):
    if buttons is None:
        return 0, 0
    try:
        fire = int(bool(buttons[0]))
    except (TypeError, IndexError, KeyError):
        fire = 0
    try:
        alt_fire = int(bool(buttons[1]))
    except (TypeError, IndexError, KeyError):
        alt_fire = 0
    return fire, alt_fire


def _float_or_default(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def action_to_diep(agent_id, action):
    """Convert a trainer action into the frozen C ABI action struct.

    Accepted forms:
    - dict: {'move': [x, y], 'aim': [x, y], 'buttons': [fire, alt_fire],
             'stat_upgrade_choice': int, 'tank_upgrade_choice': int}
    - flat sequence: [move_x, move_y, aim_x, aim_y, fire, alt_fire, stat_upgrade_choice?, tank_upgrade_choice?]
    Missing or malformed values become no-op components.
    """
    if action is None:
        return noop_action(agent_id)
    if isinstance(action, dict):
        move_x, move_y = _pair(action.get('move'), (0.0, 0.0))
        aim_x, aim_y = _pair(action.get('aim'), (1.0, 0.0))
        fire, alt_fire = _button_flags(action.get('buttons', (0, 0)))
        stat_upgrade_choice = _optional_choice(action.get('stat_upgrade_choice'))
        tank_upgrade_choice = _optional_choice(action.get('tank_upgrade_choice'))
        return DiepAction(agent_id, move_x, move_y, aim_x, aim_y, fire, alt_fire, stat_upgrade_choice, tank_upgrade_choice)
    try:
        values = list(action)
    except TypeError:
        return noop_action(agent_id)
    original_len = len(values)
    values = values + [0.0] * max(0, 8 - original_len)
    move_x = _float_or_default(values[0], 0.0)
    move_y = _float_or_default(values[1], 0.0)
    aim_x = _float_or_default(values[2], 1.0) if original_len > 2 else 1.0
    aim_y = _float_or_default(values[3], 0.0) if original_len > 3 else 0.0
    stat_upgrade_choice = _optional_choice(values[6] if original_len > 6 else None)
    tank_upgrade_choice = _optional_choice(values[7] if original_len > 7 else None)
    return DiepAction(agent_id, move_x, move_y, aim_x, aim_y, int(bool(values[4])), int(bool(values[5])), stat_upgrade_choice, tank_upgrade_choice)


__all__ = ['action_to_diep']
