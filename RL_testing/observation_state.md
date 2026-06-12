RL Observation System Plan

Goal:
Train an RPPO agent in a fast headless C++ environment for a partially observable stochastic game while keeping the observation format close to what the agent could actually observe during real gameplay.

The combat policy should learn how to play the current tank.

The upgrade system should decide which upgrade to apply when an upgrade is available.

The system should not decide whether to upgrade.

If a stat point or tank upgrade is available, the upgrade system should automatically trigger and apply an upgrade.

The simulator should store the full internal state, but neural networks should only receive the view needed for their specific decision.

Core design:
Use a compact local grid for spatial awareness, a normalized self-state vector for agent status, and a previous-action vector for control continuity.

Use a separate upgrade observation package when stat or tank upgrades become available.

Use explicit tank class mappings and matchup compatibility mappings to calculate enemy type channels, enemy threat, and enemy opportunity.

RPPO hidden state is internal to the model.
It is not manually included in the environment observation.

1. Core state structure

FullGameState:
Stores the true global simulator state.

```
Includes:
    all agents
    all bullets
    all farmable objects
    arena state
    global game rules
    collision state
    score and XP state

This is not passed directly into any agent model.
```

AgentState:
Stores persistent per-agent simulator state.

```
Includes:
    position
    velocity
    health
    level
    xp_progress
    score
    time_alive

    current_tank_type
    current_upgrade_tier
    current_stat_levels
    derived_combat_stats

    available_stat_points
    tank_upgrade_available

    legal_stat_upgrades
    legal_tank_upgrades
    stat_upgrade_mask
    tank_upgrade_mask

    reload_cooldown
    recent_damage_taken
    recent_damage_direction

    previous_combat_action
    recent_performance_summary

AgentState is the source used to build observations.

AgentState stores raw simulator values.

AgentState is not passed directly into the RPPO model.
```

CombatObservation:
Built every timestep from AgentState and the locally visible world state.

```
Passed to RPPO.

Used for:
    movement
    aiming
    shooting
```

UpgradeObservationPackage:
Built only when an upgrade decision is available.

```
Passed to the upgrade system.

Used for:
    stat upgrade choices
    tank upgrade choices
```

2. Final combat observation

combat_obs = {
grid_obs: [18, 21, 21],
self_obs: [N],
prev_action_obs: [5]
}

The RPPO receives only CombatObservation.

It does not receive:
FullGameState
full AgentState
full upgrade tree
legal upgrade lists
stat upgrade mask
tank upgrade mask

3. grid_obs: [18, 21, 21]

A local player-centered grid.

The player is always at the center:

```
center = (10, 10)
```

The grid covers:

```
10 cells left
10 cells right
10 cells up
10 cells down
```

This should represent only the locally visible area, not hidden full-map information.

Grid cell size should be defined explicitly by the environment:

```
grid_cell_size = fixed number of world units
grid_radius = 10 * grid_cell_size
```

Objects outside the visible local grid are not directly represented in grid_obs.

Channels:

Channel 0: wall / boundary
1 if blocked, outside the arena, or unsafe boundary
0 otherwise

Channel 1: farmable object presence
1 if a farmable object exists in the cell
0 otherwise

Channel 2: farmable object value
normalized 0 to 1
represents XP value, health, growth, or score value

Channel 3: enemy presence
1 if an enemy is in the cell
0 otherwise

Channel 4: enemy threat
normalized 0 to 1
represents how dangerous the enemy is to the observing agent
calculated using visible enemy information, relative movement, bullet pressure, relative strength, and TankClassMapping threat weights

Channel 5: enemy opportunity
normalized 0 to 1
represents how favorable the enemy is as a target for the observing agent
calculated using range fit, matchup compatibility, target value, catchability, line of fire, and TankClassMapping opportunity weights

Channel 6: enemy health ratio
normalized 0 to 1
represents current_health / max_health for the most relevant enemy in the cell
0 when the cell has no selected enemy or max health is invalid

Channel 7: relative enemy velocity x
normalized enemy_vx - agent_vx
negative = moving left relative to agent
positive = moving right relative to agent

Channel 8: relative enemy velocity y
normalized enemy_vy - agent_vy
negative = moving up relative to agent
positive = moving down relative to agent

Channel 9: enemy type balanced
1 if the most relevant enemy in the cell is a balanced tank type
0 otherwise

Channel 10: enemy type sniper
1 if the most relevant enemy in the cell is a sniper-style tank type
0 otherwise

Channel 11: enemy type spammer
1 if the most relevant enemy in the cell is a high-fire-rate tank type
0 otherwise

Channel 12: enemy type rammer
1 if the most relevant enemy in the cell is a body-damage or collision-focused tank type
0 otherwise

Channel 13: enemy type area control
1 if the most relevant enemy in the cell is an area-control tank type
0 otherwise

Channel 14: enemy type unknown
1 if enemy type is unknown or does not fit another category
0 otherwise

Channel 15: bullet / projectile presence
1 if a bullet exists in the cell
0 otherwise

Channel 16: relative bullet velocity x
normalized bullet_vx - agent_vx

Channel 17: relative bullet velocity y
normalized bullet_vy - agent_vy

4. Cell conflict rule

Physical overlap is unlikely because the game prevents objects from occupying the same space.

However, multiple nearby objects can still map to the same grid cell because the grid is discrete.

Use a simple priority rule first.

For each cell and object type:
if multiple objects map to the same cell:
keep the most important one

Priority rules:

bullet:
keep the most dangerous bullet

enemy:
keep the most relevant visible enemy

farmable object:
keep the highest-value object or closest object

Enemy relevance should be based on a combination of:

```
enemy_threat
enemy_opportunity
distance
visible enemy value
```

The danger, threat, and opportunity calculations should be deterministic and should only use information available to the observing agent.

Do not add duplicate count channels yet.

Possible future additions if training struggles:
bullet_count
enemy_count
bullet_danger
bullet_time_to_impact
nearest_enemy_obs
nearest_bullet_obs

5. Tank Class Mapping and Compatibility

Purpose:
The enemy threat and enemy opportunity channels depend on tank type, so the system needs explicit mappings for every supported tank class.

These mappings should be hardcoded or config-driven at first.

Later, the values can be tuned, learned, or adjusted after observing training behavior.

The tank mapping should be stored in a config-like structure, not scattered throughout observation code.

The observation builder should call these mappings when calculating:

```
enemy threat
enemy opportunity
enemy type category channels
range_fit_score
matchup_score
```

This keeps the observation system extensible as more tank classes are added.

5.1 Tank category mapping

Each concrete tank class should map to one broad visible category:

```
balanced
sniper
spammer
rammer
area-control
unknown
```

Examples:

```
Basic Tank -> balanced
Sniper -> sniper
Machine Gun -> spammer
Rammer-style class -> rammer
Trapper-style class -> area-control
```

These categories determine which enemy type channel is activated in grid_obs.

Example:

```
if enemy_category == balanced:
    enemy_type_balanced = 1

if enemy_category == sniper:
    enemy_type_sniper = 1

if enemy_category == unknown:
    enemy_type_unknown = 1
```

Only one broad category channel should be active per visible enemy.

5.2 Range profile mapping

Each tank class should define its preferred engagement range profile.

Example fields:

```
min_good_range
ideal_range
max_good_range
range_profile_type
```

Range profile examples:

Sniper:
prefers medium to far range
opportunity is highest when the enemy is within effective bullet range but not too close

Rammer:
prefers close range
opportunity increases as distance decreases

Spammer:
prefers medium range
opportunity is highest when it can apply bullet pressure without being too close

Balanced:
prefers medium range

Area-control:
prefers holding zones and controlling enemy movement
opportunity is highest when enemies are forced into controlled space

Unknown:
uses conservative default range assumptions

Example range profile config:

```
TankRangeProfile:
    min_good_range
    ideal_range
    max_good_range
    range_profile_type
```

5.3 Threat weight mapping

Each tank class should define how it interprets enemy threat.

Threat weights should be based on the observing agent's current tank type or current broad tank category.

Example fields:

```
distance_weight
closing_weight
enemy_type_weight
bullet_pressure_weight
relative_strength_weight
```

Examples:

Sniper:
high closing_weight
high bullet_pressure_weight
high threat from rammers at close range

Rammer:
lower distance threat from close enemies
higher threat from stronger rammers or high bullet-pressure enemies

Spammer:
moderate distance threat
high bullet-pressure sensitivity
high area-control sensitivity

Balanced:
moderate weights across distance, closing movement, bullet pressure, and relative strength

Area-control:
high threat from enemies that can break through controlled zones
high threat from snipers if line of fire is open

Threat score should be normalized:

```
enemy_threat = weighted normalized score from 0 to 1
```

Example threat calculation:

```
enemy_threat =
    distance_weight * distance_threat_score
    + closing_weight * closing_score
    + enemy_type_weight * enemy_type_threat_score
    + bullet_pressure_weight * bullet_pressure_score
    + relative_strength_weight * relative_strength_score
```

Then:

```
enemy_threat = clamp(enemy_threat, 0, 1)
```

5.4 Opportunity weight mapping

Each tank class should define how it evaluates enemy opportunity.

Opportunity weights should be based on the observing agent's current tank type or current broad tank category.

Example fields:

```
range_fit_weight
strength_advantage_weight
catchability_weight
matchup_weight
target_value_weight
line_of_fire_weight
pressure_penalty_weight
```

Examples:

Rammer:
high range_fit_weight for close enemies
high catchability_weight
high strength_advantage_weight

Sniper:
high range_fit_weight for medium and far enemies
high line_of_fire_weight
lower opportunity against close rammers

Spammer:
high pressure-based opportunity at medium range
moderate matchup weighting
moderate target value weighting

Balanced:
moderate range fit
moderate strength advantage
moderate matchup weighting

Area-control:
high opportunity when the enemy is trapped, slowed, cornered, or pressured into controlled space

Opportunity score should be normalized:

```
enemy_opportunity = weighted normalized score from 0 to 1
```

Example opportunity calculation:

```
enemy_opportunity =
    range_fit_weight * range_fit_score
    + strength_advantage_weight * strength_advantage_score
    + catchability_weight * catchability_score
    + matchup_weight * matchup_score
    + target_value_weight * target_value_score
    + line_of_fire_weight * line_of_fire_score
    - pressure_penalty_weight * pressure_penalty_score
```

Then:

```
enemy_opportunity = clamp(enemy_opportunity, 0, 1)
```

5.5 Matchup compatibility matrix

Create a matchup table that estimates how favorable each observing tank category is against each visible enemy tank category.

```
matchup_score[self_tank_category][enemy_tank_category]
```

Rows:

```
balanced
sniper
spammer
rammer
area-control
```

Columns:

```
balanced
sniper
spammer
rammer
area-control
unknown
```

The values should be normalized from 0 to 1:

```
0.0 = very bad matchup
0.5 = neutral matchup
1.0 = very favorable matchup
```

This matrix should be used in enemy_opportunity.

It should not be treated as hidden truth.

It is a design prior based only on visible tank category and known public tank behavior.

Initial example matrix:

```
                  enemy_balanced   enemy_sniper   enemy_spammer   enemy_rammer   enemy_area_control   enemy_unknown

self_balanced          0.50            0.50            0.50            0.45             0.45              0.50

self_sniper            0.60            0.50            0.55            0.25             0.50              0.45

self_spammer           0.55            0.45            0.50            0.60             0.45              0.50

self_rammer            0.55            0.70            0.45            0.50             0.35              0.45

self_area_control      0.55            0.45            0.55            0.65             0.50              0.50
```

These are initial priors only.

They should be treated as tunable config values.

5.6 No hidden-state leakage rule

The mapping can use:

```
observing agent's current tank type
observing agent's current stat levels
observing agent's derived combat stats
visible enemy tank category
visible enemy position and velocity
visible enemy level, size, or health if available
observed bullet pressure if attributable
```

The mapping must not use:

```
hidden enemy stat levels
hidden enemy reload cooldown
hidden enemy damage
hidden enemy health if not visible
hidden upgrade path
off-screen enemies
off-screen bullets
```

The mapping is allowed to use public design priors.

The mapping is not allowed to use hidden simulator truth that the agent could not observe.

5.7 Config-driven design

The mapping should be stored in explicit config-like structures.

Pseudocode:

```
TankClassMapping:
    tank_class
    broad_category
    range_profile
    threat_weights
    opportunity_weights
    derived_combat_stat_rules

TankCompatibilityMapping:
    self_tank_category
    enemy_tank_category
    matchup_score
```

Example:

```
TankClassMapping["Sniper"] = {
    broad_category: sniper,
    range_profile: {
        min_good_range: 0.35,
        ideal_range: 0.70,
        max_good_range: 1.00,
        range_profile_type: medium_far
    },
    threat_weights: {
        distance_weight: 0.20,
        closing_weight: 0.30,
        enemy_type_weight: 0.20,
        bullet_pressure_weight: 0.20,
        relative_strength_weight: 0.10
    },
    opportunity_weights: {
        range_fit_weight: 0.30,
        strength_advantage_weight: 0.15,
        catchability_weight: 0.05,
        matchup_weight: 0.15,
        target_value_weight: 0.10,
        line_of_fire_weight: 0.20,
        pressure_penalty_weight: 0.20
    }
}
```

The observation builder should use TankClassMapping and TankCompatibilityMapping to calculate:

```
broad enemy category
enemy type channel
range_fit_score
matchup_score
enemy_threat
enemy_opportunity
```

6. self_obs: [N]

A flat normalized vector describing the agent's current playable state.

self_obs should include information that changes how the current tank should be controlled.

All values passed into self_obs must be normalized.

The simulator may store raw values inside AgentState, but the observation builder must convert them into normalized observation values before passing them to RPPO.

Normalization rule:

```
AgentState stores raw game values.
self_obs stores normalized model-facing values.
```

Recommended normalized self_obs values:

```
health_ratio
    = current_health / current_max_health
    range: 0 to 1

level_norm
    = current_level / max_level
    range: 0 to 1

xp_progress_norm
    = xp_progress_to_next_level
    range: 0 to 1

score_norm
    = log(1 + score) / log(1 + expected_max_score)
    range: 0 to 1, clipped

time_alive_norm
    = time_alive / max_episode_time
    range: 0 to 1, clipped

current_velocity_x_norm
    = current_velocity_x / max_possible_agent_speed
    range: -1 to 1, clipped

current_velocity_y_norm
    = current_velocity_y / max_possible_agent_speed
    range: -1 to 1, clipped

reload_cooldown_norm
    = reload_cooldown_remaining / current_reload_time
    range: 0 to 1

movement_speed_norm
    = current_movement_speed / max_possible_movement_speed
    range: 0 to 1

current_tank_type_one_hot
    = one-hot vector over tank types or tank categories
    range: 0 or 1 per entry

current_upgrade_tier_norm
    = current_upgrade_tier / max_upgrade_tier
    range: 0 to 1
```

Normalized stat levels:

```
max_health_stat_norm
    = max_health_stat_level / max_stat_level
    range: 0 to 1

health_regen_stat_norm
    = health_regen_stat_level / max_stat_level
    range: 0 to 1

body_damage_stat_norm
    = body_damage_stat_level / max_stat_level
    range: 0 to 1

bullet_speed_stat_norm
    = bullet_speed_stat_level / max_stat_level
    range: 0 to 1

bullet_penetration_stat_norm
    = bullet_penetration_stat_level / max_stat_level
    range: 0 to 1

bullet_damage_stat_norm
    = bullet_damage_stat_level / max_stat_level
    range: 0 to 1

reload_stat_norm
    = reload_stat_level / max_stat_level
    range: 0 to 1

movement_speed_stat_norm
    = movement_speed_stat_level / max_stat_level
    range: 0 to 1
```

Normalized derived combat stats:

```
current_max_health_norm
    = current_max_health / max_possible_health
    range: 0 to 1

current_bullet_damage_norm
    = current_bullet_damage / max_possible_bullet_damage
    range: 0 to 1

current_bullet_speed_norm
    = current_bullet_speed / max_possible_bullet_speed
    range: 0 to 1

current_bullet_range_norm
    = current_bullet_range / max_possible_bullet_range
    range: 0 to 1

current_reload_time_norm
    = current_reload_time / max_possible_reload_time
    range: 0 to 1

current_movement_speed_norm
    = current_movement_speed / max_possible_movement_speed
    range: 0 to 1
```

Recent damage fields:

```
recent_damage_taken_norm
    = recent_damage_taken / current_max_health
    range: 0 to 1, clipped

recent_damage_direction_x_norm
    = recent_damage_direction_x
    range: -1 to 1

recent_damage_direction_y_norm
    = recent_damage_direction_y
    range: -1 to 1
```

Do not include raw integer IDs directly in self_obs.

Do not include:
raw tank_type_id
raw level
raw score
raw time_alive
raw velocity
raw stat levels
raw damage values
raw cooldown values
available_stat_points_count
tank_upgrade_available_flag
stat_upgrade_mask
tank_upgrade_mask
legal_stat_upgrades
legal_tank_upgrades
full upgrade tree

Reason:
Because upgrades are automatically triggered, the combat RPPO does not need to know whether upgrade points or tank upgrades are available.

The combat policy only needs to know how to play the current tank after upgrades have been applied.

Example normalized self_obs:

```
self_obs = [
    health_ratio,
    level_norm,
    xp_progress_norm,
    score_norm,
    time_alive_norm,

    current_velocity_x_norm,
    current_velocity_y_norm,

    reload_cooldown_norm,
    movement_speed_norm,

    current_upgrade_tier_norm,

    max_health_stat_norm,
    health_regen_stat_norm,
    body_damage_stat_norm,
    bullet_speed_stat_norm,
    bullet_penetration_stat_norm,
    bullet_damage_stat_norm,
    reload_stat_norm,
    movement_speed_stat_norm,

    current_max_health_norm,
    current_bullet_damage_norm,
    current_bullet_speed_norm,
    current_bullet_range_norm,
    current_reload_time_norm,
    current_movement_speed_norm,

    recent_damage_taken_norm,
    recent_damage_direction_x_norm,
    recent_damage_direction_y_norm,

    current_tank_type_one_hot...
]
```

Important:
The observation builder should perform normalization every timestep.

AgentState should keep raw values.
CombatObservation should contain normalized values.
RPPO should only receive normalized values.

7. prev_action_obs: [5]

This contains only what the agent itself did on the previous combat step.

Values:

```
previous_move_x
previous_move_y
previous_aim_x
previous_aim_y
previous_shoot
```

Example:

```
prev_action_obs = [
    prev_move_x,
    prev_move_y,
    prev_aim_x,
    prev_aim_y,
    prev_shoot
]
```

Normalization:

```
previous_move_x
    range: -1 to 1

previous_move_y
    range: -1 to 1

previous_aim_x
    range: -1 to 1

previous_aim_y
    range: -1 to 1

previous_shoot
    range: 0 or 1
```

Do not include:
previous enemy states
previous grid states
previous upgrade choices
previous upgrade masks

Previous world history should be handled by:
RPPO hidden state
relative velocity channels
recent damage fields

8. RPPO memory

The recurrent model maintains its own hidden state, usually through an LSTM or GRU.

It can learn to remember:

```
recent enemy movement
recent bullet patterns
enemies that left vision
whether the agent was retreating or fighting
recent damage
recent actions
ongoing farming or combat behavior
```

The environment should not manually return this memory as part of the observation.

Environment returns:

```
grid_obs
self_obs
prev_action_obs
```

Model manages:

```
hidden_state
```

9. Automatic upgrade trigger

Upgrade decisions are separate from combat decisions.

The system should not learn or decide whether to upgrade.

If a stat point or tank upgrade is available, the upgrade system is triggered automatically.

The only decision is:

```
which stat upgrade to choose
```

or:

```
which tank upgrade to choose
```

The upgrade system is triggered when:

```
available_stat_points > 0
```

or:

```
tank_upgrade_available == true
```

Pseudocode:

```
if agent_state.available_stat_points > 0:
    upgrade_obs_package = build_upgrade_obs_package(agent_state, local_visible_world)
    stat_upgrade = upgrade_policy.choose_stat_upgrade(upgrade_obs_package)
    apply_stat_upgrade(agent_state, stat_upgrade)

if agent_state.tank_upgrade_available:
    upgrade_obs_package = build_upgrade_obs_package(agent_state, local_visible_world)
    tank_upgrade = upgrade_policy.choose_tank_upgrade(upgrade_obs_package)
    apply_tank_upgrade(agent_state, tank_upgrade)
```

If multiple stat points are available, the system can apply upgrades repeatedly until no stat points remain:

```
while agent_state.available_stat_points > 0:
    upgrade_obs_package = build_upgrade_obs_package(agent_state, local_visible_world)
    stat_upgrade = upgrade_policy.choose_stat_upgrade(upgrade_obs_package)
    apply_stat_upgrade(agent_state, stat_upgrade)
```

The upgrade policy never outputs:

```
do_upgrade
skip_upgrade
wait
no_op
```

Reason:
There is no strategic reason to leave available upgrades unused in the initial design.

Keeping upgrades automatic simplifies training and prevents the model from wasting capacity learning an unnecessary timing decision.

For the first version, the upgrade path can be hardcoded.

Later, the hardcoded path can be replaced by a learned upgrade policy without changing the combat RPPO observation.

10. Upgrade observation package

Upgrade decisions are separate from combat decisions.

The upgrade observation package is created only when the automatic upgrade trigger fires.

upgrade_obs_package = {
upgrade_obs: [M],
stat_upgrade_mask: [8],
tank_upgrade_mask: [T]
}

The upgrade package is not passed to the combat RPPO.

11. upgrade_obs: [M]

The upgrade observation should contain slower strategic information.

It should describe how the agent has been performing and what kind of environment it is currently facing.

Recommended values:

```
current_tank_type_one_hot
current_upgrade_tier_norm
level_norm
xp_progress_norm

current_stat_levels_norm
available_stat_points_norm
tank_upgrade_available_flag

health_ratio
score_norm
time_alive_norm

recent_score_gain_rate_norm
recent_damage_taken_rate_norm
recent_farming_rate_norm
recent_enemy_pressure_norm
recent_survival_trend_norm

nearby_enemy_count_norm
nearby_farmable_density_norm
nearby_bullet_pressure_norm
```

The upgrade system uses this to answer:

```
What stat or tank upgrade should this agent choose now?
```

Unlike CombatObservation, UpgradeObservationPackage does include upgrade availability and masks because those are directly relevant to choosing the legal upgrade.

12. Upgrade masks inside AgentState

Upgrade masks are stored inside AgentState for simplicity.

AgentState stores:

```
legal_stat_upgrades
legal_tank_upgrades
stat_upgrade_mask
tank_upgrade_mask
```

These masks are updated from:

```
current level
current tank type
current stat levels
available stat points
tank upgrade rules
stat caps
```

stat_upgrade_mask:

```
can_upgrade_max_health
can_upgrade_health_regen
can_upgrade_body_damage
can_upgrade_bullet_speed
can_upgrade_bullet_penetration
can_upgrade_bullet_damage
can_upgrade_reload
can_upgrade_movement_speed
```

tank_upgrade_mask:

```
can_upgrade_to_tank_type_0
can_upgrade_to_tank_type_1
can_upgrade_to_tank_type_2
...
can_upgrade_to_tank_type_T
```

The masks are stored in AgentState, but they are not part of CombatObservation.

They are copied into UpgradeObservationPackage only when the upgrade system is asked to choose an upgrade.

13. Final structure

FullGameState:
persistent global simulator state
contains the true game state
not passed directly to any agent model

AgentState:
persistent per-agent simulator state
contains raw stats, cooldowns, previous combat action, upgrade availability, and upgrade masks
not passed directly to RPPO

TankClassMapping:
config-driven mapping from concrete tank classes to broad categories, range profiles, threat weights, and opportunity weights

TankCompatibilityMapping:
config-driven matchup score table between observing tank categories and visible enemy tank categories

CombatObservation:
temporary partial observation
built every timestep
passed to RPPO
contains normalized model-facing values

```
combat_obs = {
    grid_obs: [18, 21, 21],
    self_obs: [N],
    prev_action_obs: [5]
}
```

UpgradeObservationPackage:
temporary upgrade-policy input
built only when an upgrade is available
contains normalized upgrade-facing values and legality masks

```
upgrade_obs_package = {
    upgrade_obs: [M],
    stat_upgrade_mask: [8],
    tank_upgrade_mask: [T]
}
```

14. Final rule

CombatObservation tells the RPPO how to play the current tank.

UpgradeObservationPackage tells the upgrade system which upgrade to apply when an upgrade is automatically triggered.

TankClassMapping tells the observation builder how to interpret visible tank classes.

TankCompatibilityMapping tells the observation builder how favorable each visible matchup is as a design prior.

AgentState stores persistent per-agent state, including raw values, upgrade availability, and upgrade masks.

FullGameState stores the true global world state.

The system does not decide whether to upgrade.

It upgrades automatically whenever an upgrade is available.

Models only receive the partial view meant for their job.
