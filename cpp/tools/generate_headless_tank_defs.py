from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'src' / 'Const' / 'TankDefinitions.json'
OUT = ROOT / 'cpp' / 'include' / 'diepcustom' / 'headless_tank_defs.generated.hpp'
STAT_COUNT = 8
TANK_UPGRADE_SLOTS = 6

def fmt_float(value: float) -> str:
    text = f"{float(value):.6f}"
    text = text.rstrip('0').rstrip('.')
    if text == '-0':
        text = '0'
    return text or '0'

raw = json.loads(SRC.read_text())
lines: list[str] = []
lines.append('#pragma once')
lines.append('')
lines.append('#include <array>')
lines.append('')
lines.append('namespace diepcustom::headless {')
lines.append('')
lines.append('struct TankRuntimeDefinition {')
lines.append('  bool valid = false;')
lines.append('  int id = -1;')
lines.append('  int levelRequirement = 0;')
lines.append(f'  std::array<int, {STAT_COUNT}> statCaps{{}};')
lines.append(f'  std::array<int, {TANK_UPGRADE_SLOTS}> upgradeIds{{}};')
lines.append('  int upgradeCount = 0;')
lines.append('  double maxHealth = 50.0;')
lines.append('  double speed = 1.0;')
lines.append('  double absorbtionFactor = 1.0;')
lines.append('  int sides = 1;')
lines.append('  int barrelCount = 0;')
lines.append('};')
lines.append('')
lines.append(f'inline constexpr int HeadlessTankDefinitionCount = {len(raw)};')
lines.append(f'inline constexpr int HeadlessTankUpgradeSlots = {TANK_UPGRADE_SLOTS};')
lines.append('')
lines.append('inline constexpr std::array<TankRuntimeDefinition, HeadlessTankDefinitionCount> kTankRuntimeDefinitions{{')
for tank_id, tank in enumerate(raw):
    if tank is None:
        lines.append('    TankRuntimeDefinition{},')
        continue
    stat_caps = [int(stat['max']) for stat in tank['stats']]
    if len(stat_caps) != STAT_COUNT:
        raise SystemExit(f'tank {tank_id} has {len(stat_caps)} stats')
    upgrades = [int(value) for value in tank['upgrades'][:TANK_UPGRADE_SLOTS]]
    if len(tank['upgrades']) > TANK_UPGRADE_SLOTS:
        raise SystemExit(f'tank {tank_id} exceeds {TANK_UPGRADE_SLOTS} upgrades')
    upgrades += [-1] * (TANK_UPGRADE_SLOTS - len(upgrades))
    lines.append('    TankRuntimeDefinition{')
    lines.append('        true,')
    lines.append(f'        {tank_id},')
    lines.append(f"        {int(tank['levelRequirement'])},")
    lines.append(f"        std::array<int, {STAT_COUNT}>{{{', '.join(map(str, stat_caps))}}},")
    lines.append(f"        std::array<int, {TANK_UPGRADE_SLOTS}>{{{', '.join(map(str, upgrades))}}},")
    lines.append(f"        {len(tank['upgrades'])},")
    lines.append(f"        {fmt_float(tank.get('maxHealth', 50.0))},")
    lines.append(f"        {fmt_float(tank.get('speed', 1.0))},")
    lines.append(f"        {fmt_float(tank.get('absorbtionFactor', 1.0))},")
    lines.append(f"        {int(tank.get('sides', 1))},")
    lines.append(f"        {len(tank.get('barrels', []))}")
    lines.append('    },')
lines.append('}};')
lines.append('')
lines.append('} // namespace diepcustom::headless')
OUT.write_text('\n'.join(lines) + '\n')
print(OUT)
