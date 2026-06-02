#include "diepcustom/headless.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace diepcustom::headless {
namespace {
constexpr int ColorTank = 2;
constexpr int ColorEnemySquare = 8;
constexpr int ColorEnemyTriangle = 9;
constexpr int ColorEnemyPentagon = 10;
constexpr int ColorCrasher = 11;
constexpr int PhysicsNoOwnTeamCollision = 1 << 3;
constexpr int PhysicsSolidWall = 1 << 4;
constexpr int PhysicsOnlySameOwnerCollision = 1 << 5;
constexpr int PhysicsCanEscapeArena = 1 << 8;
constexpr double Pi = 3.141592653589793238462643383279502884;
constexpr double SqrtHalf = 0.70710678118654752440;
constexpr int BasicTankId = 0;
constexpr int MaxPlayerLevel = 45;

std::uint64_t normalizeSeed(std::uint64_t seed) { return seed == 0 ? 0x9E3779B97F4A7C15ull : seed; }

std::string q(const std::string& value) {
  std::ostringstream out;
  out << '"';
  for (unsigned char c : value) {
    switch (c) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\n': out << "\\n"; break;
      default: out << c; break;
    }
  }
  out << '"';
  return out.str();
}

std::string num(double value) {
  if (std::fabs(value) < 0.0000005) value = 0;
  double rounded = std::round(value * 1000000.0) / 1000000.0;
  std::ostringstream out;
  out << std::fixed << std::setprecision(6) << rounded;
  std::string s = out.str();
  while (s.size() > 1 && s.back() == '0') s.pop_back();
  if (!s.empty() && s.back() == '.') s.pop_back();
  return s == "-0" ? "0" : s;
}

void refreshVelocity(double vx, double vy, double& magnitude, double& angle) {
  magnitude = std::sqrt(vx * vx + vy * vy);
  angle = magnitude == 0 ? 0 : std::atan2(vy, vx);
}

double levelToScore(int level) {
  if (level <= 0) return 0.0;
  if (level >= MaxPlayerLevel) level = MaxPlayerLevel;
  double score = 0.0;
  for (int i = 1; i < level; ++i) score += (40.0 / 9.0) * std::pow(1.06, i - 1) * std::min(31, i);
  return score;
}

int scoreToLevel(double score) {
  int level = 1;
  while (level < MaxPlayerLevel && score - levelToScore(level + 1) >= 0.0) level += 1;
  return level;
}

int calculateStatCount(int level) {
  if (level <= 0) return 0;
  if (level <= 28) return level - 1;
  return level / 3 + 18;
}

int spentStatCount(const std::array<int, HeadlessStatCount>& statLevels) {
  int spent = 0;
  for (int value : statLevels) spent += value;
  return spent;
}

const TankRuntimeDefinition* tankDefinitionFor(int tankId) {
  if (tankId < 0 || tankId >= HeadlessTankDefinitionCount) return nullptr;
  const auto& definition = kTankRuntimeDefinitions[static_cast<std::size_t>(tankId)];
  return definition.valid ? &definition : nullptr;
}
} // namespace

Rng::Rng(std::uint64_t seed) : state_(normalizeSeed(seed)) {}

std::uint32_t Rng::nextU32() {
  // SplitMix64: deterministic, small, standard-library-only, and stable across platforms.
  state_ += 0x9E3779B97F4A7C15ull;
  std::uint64_t z = state_;
  z = (z ^ (z >> 30u)) * 0xBF58476D1CE4E5B9ull;
  z = (z ^ (z >> 27u)) * 0x94D049BB133111EBull;
  z ^= z >> 31u;
  draws_ += 1;
  return static_cast<std::uint32_t>(z >> 32u);
}

double Rng::nextDouble01() { return static_cast<double>(nextU32()) / 4294967296.0; }

int Rng::rangeInt(int minInclusive, int maxInclusive) {
  if (minInclusive > maxInclusive) throw std::invalid_argument("invalid RNG range");
  const std::uint32_t span = static_cast<std::uint32_t>(maxInclusive - minInclusive + 1);
  return minInclusive + static_cast<int>(nextU32() % span);
}

std::uint64_t Rng::drawCount() const { return draws_; }
std::uint64_t Rng::state() const { return state_; }

Simulation::Simulation(Config config) : config_(std::move(config)), rng_(config_.seed), arena_() {
  if (config_.agents < 0) throw std::invalid_argument("agents must be non-negative");
  if (config_.maxTicks <= 0) throw std::invalid_argument("maxTicks must be positive");
  initializeWorld();
}

void Simulation::reset(std::uint64_t seed) {
  config_.seed = seed;
  rng_ = Rng(seed);
  tick_ = 0;
  nextId_ = 0;
  nextHash_ = 1;
  entities_.clear();
  agentIds_.clear();
  possibleAgentIds_.clear();
  initializeWorld();
}

void Simulation::initializeWorld() {
  arena_ = Arena();
  if (config_.scenario == "empty-arena") return;
  for (int i = 0; i < config_.agents; ++i) spawnAgent(i);
  if (config_.scenario == "dense-collision") {
    for (int i = 0; i < 24; ++i) spawnShape(i);
  } else if (config_.scenario == "agents-projectiles" || config_.scenario == "basic-bullet-parity") {
    for (int i = 0; i < config_.agents; ++i) {
      if (Entity* agent = findEntity(agentIds_[static_cast<std::size_t>(i)])) fireProjectile(*agent);
    }
  } else if (config_.scenario == "shape-manager-parity") {
    for (int i = 0; i < 16; ++i) spawnManagedShape(i);
  } else if (config_.scenario == "shape-spawn-parity" || config_.scenario == "rl-grid-smoke") {
    spawnShape(0, "square");
    spawnShape(1, "triangle");
    spawnShape(2, "pentagon");
    spawnShape(3, "crasher");
  } else if (config_.scenario == "basic-tank-parity" || config_.scenario == "basic-ai-parity" || config_.scenario == "agents-no-fire" || config_.scenario == "upgrade-ready") {
    // Agent-only aliases used as parity gates by conformance scripts.
  } else {
    for (int i = 0; i < 4; ++i) spawnShape(i);
  }
}

void Simulation::spawnAgent(int index) {
  Entity e;
  e.id = nextId_++;
  e.hash = nextHash_++;
  e.kind = "agent";
  e.agentIndex = index;
  e.teamId = e.id;
  const double seededOffset = rng_.nextDouble01() * 2.0 * Pi;
  const double angle = config_.agents <= 0 ? 0 : ((2.0 * Pi * index) / std::max(1, config_.agents)) + seededOffset;
  const double radius = config_.scenario == "dense-collision" ? 40.0 : 300.0;
  e.x = std::cos(angle) * radius;
  e.y = std::sin(angle) * radius;
  e.angle = angle;
  e.health = e.maxHealth = 50;
  e.damagePerTick = 5;
  e.maxDamageMultiplier = 6;
  e.currentTankId = BasicTankId;
  e.size = e.width = 50;
  e.styleColor = ColorTank;
  e.scoreReward = 25;
  if (config_.scenario == "upgrade-ready") e.score = levelToScore(MaxPlayerLevel);
  applyTankDefinition(e);
  entities_.push_back(e);
  agentIds_.push_back(e.id);
  possibleAgentIds_.push_back(e.id);
}

void Simulation::spawnShape(int index) {
  static const char* types[] = {"square", "triangle", "pentagon", "crasher"};
  spawnShape(index, types[static_cast<std::size_t>(index % 4)]);
}

void Simulation::configureShape(Entity& e, const std::string& shapeKind) {
  e.kind = shapeKind == "crasher" ? "crasher" : "shape";
  if (shapeKind == "triangle") {
    e.sides = 3;
    e.health = e.maxHealth = 30;
    e.size = e.width = 55 * SqrtHalf;
    e.styleColor = ColorEnemyTriangle;
    e.scoreReward = 25;
  } else if (shapeKind == "pentagon") {
    e.sides = 5;
    e.health = e.maxHealth = 100;
    e.size = e.width = 75 * SqrtHalf;
    e.absorbtionFactor = 0.5;
    e.pushFactor = 11;
    e.styleColor = ColorEnemyPentagon;
    e.scoreReward = 130;
  } else if (shapeKind == "crasher") {
    e.sides = 3;
    e.health = e.maxHealth = 10;
    e.size = e.width = 35 * SqrtHalf;
    e.absorbtionFactor = 2;
    e.pushFactor = 8;
    e.styleColor = ColorCrasher;
    e.scoreReward = 15;
    e.baseSpeed = 1.5;
    e.movementAngle = rng_.nextDouble01() * 2.0 * Pi;
    e.vx = std::cos(e.movementAngle) * e.baseSpeed;
    e.vy = std::sin(e.movementAngle) * e.baseSpeed;
  } else {
    e.sides = 4;
    e.health = e.maxHealth = 10;
    e.size = e.width = 55 * SqrtHalf;
    e.styleColor = ColorEnemySquare;
    e.scoreReward = 10;
  }
  e.damagePerTick = shapeKind == "pentagon" ? 3 : 2;
}

void Simulation::spawnShapeAt(int index, const std::string& shapeKind, double x, double y) {
  Entity e;
  e.id = nextId_++;
  e.hash = nextHash_++;
  e.teamId = -100 - index;
  e.x = x;
  e.y = y;
  configureShape(e, shapeKind);
  entities_.push_back(e);
}

void Simulation::spawnShape(int index, const std::string& shapeKind) {
  double x;
  double y;
  if (config_.scenario == "dense-collision") {
    x = -120 + (index % 8) * 32;
    y = -48 + (index / 8) * 32;
  } else {
    x = -500 + index * 250 + (rng_.nextDouble01() - 0.5) * 20.0;
    y = 120 + index * 40 + (rng_.nextDouble01() - 0.5) * 20.0;
  }
  spawnShapeAt(index, shapeKind, x, y);
}


void Simulation::spawnManagedShape(int index) {
  const int x = static_cast<int>(rng_.nextDouble01() * (arena_.rightX - arena_.leftX) + arena_.leftX);
  const int y = static_cast<int>(rng_.nextDouble01() * (arena_.bottomY - arena_.topY) + arena_.topY);
  const double maxXY = std::max(static_cast<double>(x), static_cast<double>(y));
  const double minXY = std::min(static_cast<double>(x), static_cast<double>(y));
  std::string type = "square";
  if (maxXY < arena_.rightX / 10.0 && minXY > arena_.leftX / 10.0) {
    type = rng_.nextDouble01() <= 0.05 ? "alphaPentagon" : "pentagon";
  } else if (maxXY < arena_.rightX / 5.0 && minXY > arena_.leftX / 5.0) {
    type = rng_.nextDouble01() < 0.2 ? "largeCrasher" : "crasher";
  } else {
    const double rand = rng_.nextDouble01();
    if (rand < 0.04) type = "pentagon";
    else if (rand < 0.20) type = "triangle";
    else type = "square";
  }
  if (type == "alphaPentagon") type = "pentagon";
  if (type == "largeCrasher") type = "crasher";
  spawnShapeAt(index, type, x, y);
}

Simulation::Entity* Simulation::findEntity(int id) {
  for (auto& entity : entities_) if (entity.id == id && !entity.removed) return &entity;
  return nullptr;
}

const Simulation::Entity* Simulation::findEntity(int id) const {
  for (const auto& entity : entities_) if (entity.id == id && !entity.removed) return &entity;
  return nullptr;
}

int Simulation::agentIndexForId(int id) const {
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) if (possibleAgentIds_[i] == id) return static_cast<int>(i);
  return -1;
}

StepResult Simulation::step(const std::vector<Action>& actions) {
  StepResult result;
  result.rewards.assign(static_cast<std::size_t>(std::max(0, config_.agents)), 0.0);
  tick_ += 1;
  if (config_.scenario == "basic-ai-parity") applyBasicAi();
  applyActions(actions, result);
  resolveCollisions(result);
  integrateEntities();
  cleanupEntities();
  result.tick = tick_;
  result.done = tick_ >= config_.maxTicks || agentIds_.empty();
  return result;
}

StepResult Simulation::stepMany(const std::vector<Action>& actions, int ticks) {
  StepResult aggregate;
  aggregate.rewards.assign(static_cast<std::size_t>(std::max(0, config_.agents)), 0.0);
  if (ticks <= 0) {
    aggregate.tick = tick_;
    aggregate.done = tick_ >= config_.maxTicks || agentIds_.empty();
    return aggregate;
  }
  for (int i = 0; i < ticks; ++i) {
    const StepResult current = step(actions);
    if (current.rewards.size() > aggregate.rewards.size()) aggregate.rewards.resize(current.rewards.size(), 0.0);
    for (std::size_t r = 0; r < current.rewards.size(); ++r) aggregate.rewards[r] += current.rewards[r];
    aggregate.tick = current.tick;
    aggregate.done = current.done;
    if (aggregate.done) break;
  }
  return aggregate;
}

void Simulation::applyBasicAi() {
  for (auto& agent : entities_) {
    if (agent.kind != "agent" || agent.deleting) continue;
    const Entity* closest = nullptr;
    double closestDistSq = 1700.0 * 1700.0;
    for (const auto& candidate : entities_) {
      if (candidate.id == agent.id || candidate.teamId == agent.teamId || candidate.deleting) continue;
      if (!(candidate.kind == "agent" || candidate.kind == "shape" || candidate.kind == "crasher")) continue;
      const double dx = candidate.x - agent.x;
      const double dy = candidate.y - agent.y;
      const double distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) { closest = &candidate; closestDistSq = distSq; }
    }
    if (!closest) {
      agent.aiState = 0;
      agent.aiTargetId = -1;
      const double angle = std::atan2(agent.aiMouseY, agent.aiMouseX) + 0.01;
      agent.aiMouseX = std::cos(angle) * 100.0;
      agent.aiMouseY = std::sin(angle) * 100.0;
      agent.aiMoveX = 0;
      agent.aiMoveY = 0;
      agent.aiFlags = 0;
    } else {
      agent.aiState = 1;
      agent.aiTargetId = closest->id;
      agent.aiMouseX = closest->x;
      agent.aiMouseY = closest->y;
      const double dx = closest->x - agent.x;
      const double dy = closest->y - agent.y;
      const double mag = std::sqrt(dx * dx + dy * dy);
      agent.aiMoveX = mag <= 0.000001 ? 0 : dx / mag;
      agent.aiMoveY = mag <= 0.000001 ? 0 : dy / mag;
      agent.aiFlags = 1;
      agent.angle = std::atan2(dy, dx);
    }
  }
}

void Simulation::applyActions(const std::vector<Action>& actions, StepResult&) {
  for (auto& entity : entities_) if (entity.cooldown > 0) entity.cooldown -= 1;
  for (const auto& action : actions) {
    Entity* agent = findEntity(action.agentId);
    if (!agent || agent->kind != "agent" || agent->deleting) continue;
    const double clampedMoveX = std::max(-1.0, std::min(1.0, action.moveX));
    const double clampedMoveY = std::max(-1.0, std::min(1.0, action.moveY));
    const double clampedAimX = std::max(-1.0, std::min(1.0, action.aimX));
    const double clampedAimY = std::max(-1.0, std::min(1.0, action.aimY));
    const double moveMag = std::sqrt(clampedMoveX * clampedMoveX + clampedMoveY * clampedMoveY);
    if (moveMag > 0.000001) {
      const double scale = std::min(1.0, moveMag);
      agent->vx += (clampedMoveX / moveMag) * scale * 1.25;
      agent->vy += (clampedMoveY / moveMag) * scale * 1.25;
    }
    if (std::fabs(clampedAimX) > 0.000001 || std::fabs(clampedAimY) > 0.000001) {
      agent->angle = std::atan2(clampedAimY, clampedAimX);
    }
    tryApplyStatUpgrade(*agent, action.statUpgradeChoice);
    tryApplyTankUpgradeSlot(*agent, action.tankUpgradeChoice);
    if (action.fire && agent->cooldown == 0) {
      agent->cooldown = 15;
      fireProjectile(*agent);
    }
  }
}

void Simulation::applyTankDefinition(Entity& entity) {
  const TankRuntimeDefinition* definition = tankDefinitionFor(entity.currentTankId);
  if (!definition) return;
  entity.maxHealth = definition->maxHealth;
  entity.health = std::min(entity.health, entity.maxHealth);
  entity.absorbtionFactor = definition->absorbtionFactor;
  entity.sides = definition->sides;
  entity.barrels.assign(static_cast<std::size_t>(std::max(0, definition->barrelCount)), BarrelSnapshot{});
  for (int statIndex = 0; statIndex < HeadlessStatCount; ++statIndex) {
    const int maxAllowed = definition->statCaps[static_cast<std::size_t>(statIndex)];
    if (entity.statLevels[static_cast<std::size_t>(statIndex)] > maxAllowed) {
      entity.statLevels[static_cast<std::size_t>(statIndex)] = maxAllowed;
    }
  }
}

int Simulation::levelFor(const Entity& entity) const { return scoreToLevel(entity.score); }

int Simulation::statsAvailableFor(const Entity& entity) const {
  return std::max(0, calculateStatCount(levelFor(entity)) - spentStatCount(entity.statLevels));
}

bool Simulation::canApplyStatUpgrade(const Entity& entity, int statIndex) const {
  const TankRuntimeDefinition* definition = tankDefinitionFor(entity.currentTankId);
  if (!definition || statIndex < 0 || statIndex >= HeadlessStatCount) return false;
  return statsAvailableFor(entity) > 0 &&
         entity.statLevels[static_cast<std::size_t>(statIndex)] < definition->statCaps[static_cast<std::size_t>(statIndex)];
}

bool Simulation::canApplyTankUpgradeSlot(const Entity& entity, int slotIndex) const {
  const TankRuntimeDefinition* definition = tankDefinitionFor(entity.currentTankId);
  if (!definition || slotIndex < 0 || slotIndex >= HeadlessTankUpgradeSlots || slotIndex >= definition->upgradeCount) return false;
  const int nextTankId = definition->upgradeIds[static_cast<std::size_t>(slotIndex)];
  const TankRuntimeDefinition* nextDefinition = tankDefinitionFor(nextTankId);
  return nextDefinition && levelFor(entity) >= nextDefinition->levelRequirement;
}

bool Simulation::tryApplyStatUpgrade(Entity& entity, int statIndex) {
  if (statIndex == HeadlessNoUpgradeChoice || !canApplyStatUpgrade(entity, statIndex)) return false;
  entity.statLevels[static_cast<std::size_t>(statIndex)] += 1;
  return true;
}

bool Simulation::tryApplyTankUpgradeSlot(Entity& entity, int slotIndex) {
  if (slotIndex == HeadlessNoUpgradeChoice || !canApplyTankUpgradeSlot(entity, slotIndex)) return false;
  const TankRuntimeDefinition* definition = tankDefinitionFor(entity.currentTankId);
  if (!definition) return false;
  entity.currentTankId = definition->upgradeIds[static_cast<std::size_t>(slotIndex)];
  applyTankDefinition(entity);
  return true;
}

void Simulation::fireProjectile(Entity& owner) {
  if (owner.barrels.empty()) return;
  Entity projectile;
  projectile.id = nextId_++;
  projectile.hash = nextHash_++;
  projectile.kind = "projectile";
  projectile.ownerId = owner.id;
  projectile.teamId = owner.teamId;
  projectile.x = owner.x + std::cos(owner.angle) * 95.0;
  projectile.y = owner.y + std::sin(owner.angle) * 95.0;
  const double scatterAngle = (Pi / 180.0) * 1.0 * (rng_.nextDouble01() - 0.5) * 10.0;
  projectile.scatterAngle = scatterAngle;
  projectile.angle = owner.angle + scatterAngle;
  projectile.health = projectile.maxHealth = 2;
  projectile.damagePerTick = 7;
  projectile.minDamageMultiplier = 0.25;
  projectile.maxDamageMultiplier = 1;
  projectile.size = projectile.width = 21;
  projectile.pushFactor = 7.0 / 3.0;
  projectile.absorbtionFactor = 1;
  projectile.styleColor = ColorTank;
  projectile.projectileMotion = true;
  projectile.spawnTick = tick_;
  projectile.lifeLength = 75;
  projectile.movementAngle = projectile.angle;
  projectile.baseAccel = 20;
  projectile.baseSpeed = 50.0 - rng_.nextDouble01();
  owner.vx += std::cos(projectile.angle + Pi) * 2.0;
  owner.vy += std::sin(projectile.angle + Pi) * 2.0;
  projectile.vx = owner.vx;
  projectile.vy = owner.vy;
  refreshVelocity(projectile.vx, projectile.vy, projectile.velocityMagnitude, projectile.velocityAngle);
  entities_.push_back(projectile);
}

bool Simulation::isColliding(const Entity& a, const Entity& b) const {
  if (!a.isPhysical || !b.isPhysical || a.deleting || b.deleting) return false;
  if (a.sides == 0 || b.sides == 0) return false;
  if (a.teamId == b.teamId) {
    if ((a.physicsFlags & PhysicsNoOwnTeamCollision) || (b.physicsFlags & PhysicsNoOwnTeamCollision)) return false;
    if (a.ownerId != b.ownerId && ((a.physicsFlags & PhysicsOnlySameOwnerCollision) || (b.physicsFlags & PhysicsOnlySameOwnerCollision))) return false;
  }
  const double dx = a.x - b.x;
  const double dy = a.y - b.y;
  const double r = a.size + b.size;
  return dx * dx + dy * dy <= r * r;
}

void Simulation::receiveKnockback(Entity& self, const Entity& other) {
  const double kbMagnitude = self.absorbtionFactor * other.pushFactor;
  if ((other.physicsFlags & PhysicsSolidWall) && self.ownerId >= 0 && self.teamId != other.teamId) {
    self.vx = 0;
    self.vy = 0;
    refreshVelocity(self.vx, self.vy, self.velocityMagnitude, self.velocityAngle);
    self.health = 0;
    self.deleting = true;
    return;
  }
  const double kbAngle = std::atan2(self.y - other.y, self.x - other.x);
  self.vx += std::cos(kbAngle) * kbMagnitude;
  self.vy += std::sin(kbAngle) * kbMagnitude;
  refreshVelocity(self.vx, self.vy, self.velocityMagnitude, self.velocityAngle);
}

void Simulation::receiveDamage(Entity& target, Entity& source, double amount, StepResult& result) {
  if (target.health <= 0.0001) { target.health = 0; return; }
  if (target.lastDamageAnimationTick != tick_) target.lastDamageAnimationTick = tick_;
  target.lastDamageTick = tick_;
  const double before = target.health;
  target.health -= amount;
  const int sourceAgentIndex = source.ownerId >= 0 ? agentIndexForId(source.ownerId) : agentIndexForId(source.id);
  if (sourceAgentIndex >= 0) result.rewards[static_cast<std::size_t>(sourceAgentIndex)] += std::max(0.0, before - std::max(0.0, target.health));
  if (target.health <= 0.0001) {
    target.health = 0;
    target.deleting = true;
    if (source.ownerId >= 0) {
      if (Entity* owner = findEntity(source.ownerId)) owner->score += target.scoreReward;
    } else {
      source.score += target.scoreReward;
    }
    if (sourceAgentIndex >= 0) result.rewards[static_cast<std::size_t>(sourceAgentIndex)] += target.scoreReward;
    const int targetAgentIndex = agentIndexForId(target.id);
    if (targetAgentIndex >= 0) result.rewards[static_cast<std::size_t>(targetAgentIndex)] -= target.scoreReward;
  }
}

void Simulation::resolveCollisions(StepResult& result) {
  std::vector<std::pair<int, int>> pairs;
  pairs.reserve(entities_.size());
  for (std::size_t i = 0; i < entities_.size(); ++i) {
    for (std::size_t j = i + 1; j < entities_.size(); ++j) {
      if (isColliding(entities_[i], entities_[j])) pairs.emplace_back(entities_[i].id, entities_[j].id);
    }
  }
  std::sort(pairs.begin(), pairs.end());
  for (const auto& [aId, bId] : pairs) {
    Entity* a = findEntity(aId);
    Entity* b = findEntity(bId);
    if (!a || !b || !isColliding(*a, *b)) continue;
    receiveKnockback(*a, *b);
    receiveKnockback(*b, *a);
    if (a->health <= 0 || b->health <= 0) continue;
    const double common = std::max(b->minDamageMultiplier, a->minDamageMultiplier) * std::min(b->maxDamageMultiplier, a->maxDamageMultiplier);
    const double dF1 = (a->damagePerTick * common) * b->damageReduction;
    const double dF2 = (b->damagePerTick * common) * a->damageReduction;
    const double ratio = std::max(1 - a->health / dF2, 1 - b->health / dF1);
    receiveDamage(*a, *b, dF2 * std::min(1.0, 1 - ratio), result);
    receiveDamage(*b, *a, dF1 * std::min(1.0, 1 - ratio), result);
  }
}

void Simulation::keepInArena(Entity& entity) const {
  if (entity.physicsFlags & PhysicsCanEscapeArena) return;
  if (entity.x < arena_.leftX - arena_.padding) entity.x = arena_.leftX - arena_.padding;
  else if (entity.x > arena_.rightX + arena_.padding) entity.x = arena_.rightX + arena_.padding;
  if (entity.y < arena_.topY - arena_.padding) entity.y = arena_.topY - arena_.padding;
  else if (entity.y > arena_.bottomY + arena_.padding) entity.y = arena_.bottomY + arena_.padding;
}

void Simulation::integrateEntities() {
  for (auto& entity : entities_) {
    if (entity.removed) continue;
    if (entity.deleting) {
      if (entity.deletionFrame == 0) {
        entity.hash = 0;
        entity.removed = true;
        entity.deletionFrame = -1;
        continue;
      }
      entity.size *= 1.1;
      entity.width *= 1.1;
      entity.deletionFrame -= 1;
      entity.vx *= 0.5;
      entity.vy *= 0.5;
    }
    if (entity.projectileMotion) {
      if (tick_ == entity.spawnTick + 1) {
        entity.vx += std::cos(entity.movementAngle) * entity.baseSpeed;
        entity.vy += std::sin(entity.movementAngle) * entity.baseSpeed;
      } else {
        entity.vx += std::cos(entity.movementAngle) * entity.baseAccel * 0.1;
        entity.vy += std::sin(entity.movementAngle) * entity.baseAccel * 0.1;
      }
      if (tick_ - entity.spawnTick >= entity.lifeLength) entity.deleting = true;
    }
    refreshVelocity(entity.vx, entity.vy, entity.velocityMagnitude, entity.velocityAngle);
    if (entity.velocityMagnitude < 0.01) {
      entity.vx = 0;
      entity.vy = 0;
      refreshVelocity(entity.vx, entity.vy, entity.velocityMagnitude, entity.velocityAngle);
    }
    entity.x += entity.vx;
    entity.y += entity.vy;
    entity.vx += std::cos(entity.velocityAngle) * entity.velocityMagnitude * -0.1;
    entity.vy += std::sin(entity.velocityAngle) * entity.velocityMagnitude * -0.1;
    refreshVelocity(entity.vx, entity.vy, entity.velocityMagnitude, entity.velocityAngle);
    keepInArena(entity);
  }
}

void Simulation::cleanupEntities() {
  entities_.erase(std::remove_if(entities_.begin(), entities_.end(), [](const Entity& entity) { return entity.removed; }), entities_.end());
  agentIds_.erase(std::remove_if(agentIds_.begin(), agentIds_.end(), [this](int id) { return findEntity(id) == nullptr; }), agentIds_.end());
}

std::string Simulation::fullWorldSnapshotJson() const {
  std::ostringstream out;
  out << "{\"tick\":" << tick_ << ",\"seed\":" << config_.seed << ",\"rng\":{\"state\":" << rng_.state()
      << ",\"draws\":" << rng_.drawCount() << "},\"scenario\":" << q(config_.scenario)
      << ",\"manager\":{\"nextId\":" << nextId_ << ",\"activeIds\":[";
  for (std::size_t i = 0; i < entities_.size(); ++i) { if (i) out << ','; out << entities_[i].id; }
  out << "],\"agentIds\":[";
  for (std::size_t i = 0; i < agentIds_.size(); ++i) { if (i) out << ','; out << agentIds_[i]; }
  out << "]},\"arena\":{\"leftX\":" << num(arena_.leftX) << ",\"rightX\":" << num(arena_.rightX)
      << ",\"topY\":" << num(arena_.topY) << ",\"bottomY\":" << num(arena_.bottomY)
      << ",\"padding\":" << num(arena_.padding) << "},\"entities\":[";
  for (std::size_t i = 0; i < entities_.size(); ++i) {
    const auto& e = entities_[i];
    if (i) out << ',';
    out << "{\"id\":" << e.id << ",\"hash\":" << e.hash << ",\"kind\":" << q(e.kind)
        << ",\"agentIndex\":" << e.agentIndex << ",\"ownerId\":" << e.ownerId << ",\"teamId\":" << e.teamId
        << ",\"position\":{\"x\":" << num(e.x) << ",\"y\":" << num(e.y) << ",\"angle\":" << num(e.angle) << "}"
        << ",\"velocity\":{\"x\":" << num(e.vx) << ",\"y\":" << num(e.vy) << ",\"magnitude\":" << num(e.velocityMagnitude) << ",\"angle\":" << num(e.velocityAngle) << "}"
        << ",\"physics\":{\"sides\":" << e.sides << ",\"size\":" << num(e.size) << ",\"width\":" << num(e.width) << ",\"flags\":" << e.physicsFlags << ",\"absorbtionFactor\":" << num(e.absorbtionFactor) << ",\"pushFactor\":" << num(e.pushFactor) << "}"
        << ",\"style\":{\"color\":" << e.styleColor << "}"
        << ",\"styleColor\":" << e.styleColor
        << ",\"health\":{\"health\":" << num(e.health) << ",\"maxHealth\":" << num(e.maxHealth) << "}"
        << ",\"damage\":{\"damagePerTick\":" << num(e.damagePerTick) << ",\"lastDamageTick\":" << e.lastDamageTick << "}"
        << ",\"score\":{\"score\":" << num(e.score) << ",\"scoreReward\":" << num(e.scoreReward) << "}"
        << ",\"ai\":{\"state\":" << e.aiState << ",\"targetId\":" << e.aiTargetId << ",\"mouse\":{\"x\":" << num(e.aiMouseX) << ",\"y\":" << num(e.aiMouseY) << "},\"movement\":{\"x\":" << num(e.aiMoveX) << ",\"y\":" << num(e.aiMoveY) << "},\"flags\":" << e.aiFlags << "}"
        << ",\"barrels\":[";
    for (std::size_t b = 0; b < e.barrels.size(); ++b) {
      const auto& barrel = e.barrels[b];
      if (b) out << ',';
      out << "{\"angle\":" << num(barrel.angle) << ",\"offset\":" << num(barrel.offset) << ",\"distance\":" << num(barrel.distance)
          << ",\"size\":" << num(barrel.size) << ",\"width\":" << num(barrel.width) << ",\"delay\":" << num(barrel.delay)
          << ",\"reload\":" << num(barrel.reload) << ",\"recoil\":" << num(barrel.recoil) << ",\"isTrapezoid\":" << (barrel.isTrapezoid ? "true" : "false")
          << ",\"trapezoidDirection\":" << num(barrel.trapezoidDirection) << ",\"addon\":null,\"bullet\":{\"type\":" << q(barrel.bulletType)
          << ",\"sizeRatio\":" << num(barrel.bulletSizeRatio) << ",\"health\":" << num(barrel.bulletHealth) << ",\"damage\":" << num(barrel.bulletDamage)
          << ",\"speed\":" << num(barrel.bulletSpeed) << ",\"scatterRate\":" << num(barrel.bulletScatterRate) << ",\"lifeLength\":" << num(barrel.bulletLifeLength)
          << ",\"absorbtionFactor\":" << num(barrel.bulletAbsorbtionFactor) << "}}";
    }
    out << "]"
        << ",\"lifecycle\":{\"deleting\":" << (e.deleting ? "true" : "false") << ",\"removed\":" << (e.removed ? "true" : "false") << ",\"deletionFrame\":" << e.deletionFrame << "}"
        << ",\"projectile\":{\"active\":" << (e.projectileMotion ? "true" : "false") << ",\"spawnTick\":" << e.spawnTick << ",\"lifeLength\":" << e.lifeLength << ",\"movementAngle\":" << num(e.movementAngle) << ",\"baseSpeed\":" << num(e.baseSpeed) << ",\"baseAccel\":" << num(e.baseAccel) << ",\"scatterAngle\":" << num(e.scatterAngle) << "}}";
  }
  out << "]}";
  return out.str();
}

std::string Simulation::finalReportJson(double elapsedMs) const {
  const double ticksPerSecond = elapsedMs <= 0 ? 0 : (static_cast<double>(tick_) / elapsedMs) * 1000.0;
  std::ostringstream out;
  out << "{\"scenario\":" << q(config_.scenario) << ",\"seed\":" << config_.seed << ",\"agents\":" << config_.agents
      << ",\"ticks\":" << tick_ << ",\"activeEntities\":" << activeEntityCount() << ",\"elapsedMs\":" << num(elapsedMs)
      << ",\"ticksPerSecond\":" << num(ticksPerSecond) << ",\"rngDraws\":" << rng_.drawCount() << "}";
  return out.str();
}

int Simulation::observationFloatCount() const {
  return observationSpec_.rows * observationSpec_.cols * observationSpec_.channels;
}

void Simulation::addObservationOccupancy(const Entity& entity, const Entity& self, float* buffer, int bufferLen) const {
  const int rows = observationSpec_.rows;
  const int cols = observationSpec_.cols;
  const int channels = observationSpec_.channels;
  const int col = static_cast<int>(std::floor((entity.x - self.x) / observationSpec_.cellSize)) + cols / 2;
  const int row = static_cast<int>(std::floor((entity.y - self.y) / observationSpec_.cellSize)) + rows / 2;
  if (row < 0 || row >= rows || col < 0 || col >= cols) return;
  const int base = (row * cols + col) * channels;
  if (base + channels > bufferLen) return;
  const bool isSelf = entity.id == self.id;
  const bool isProjectile = entity.kind == "projectile";
  const bool friendly = entity.teamId == self.teamId;
  int occupancyChannel = -1;
  if (isSelf) occupancyChannel = 0;
  else if (entity.kind == "agent") occupancyChannel = 1;
  else if (entity.kind == "shape" || entity.kind == "crasher") occupancyChannel = 2;
  else if (isProjectile && friendly) occupancyChannel = 3;
  else if (isProjectile) occupancyChannel = 4;
  if (occupancyChannel >= 0) buffer[base + occupancyChannel] = 1.0f;
  buffer[base + 6] = std::max(buffer[base + 6], static_cast<float>(entity.maxHealth <= 0 ? 0 : std::max(0.0, entity.health) / entity.maxHealth));
  buffer[base + 7] = std::max(buffer[base + 7], static_cast<float>(std::min(1.0, std::max(0.0, entity.score + entity.scoreReward) / 1000.0)));
}

void Simulation::addObservationBoundary(const Entity& self, float* buffer, int bufferLen) const {
  const int rows = observationSpec_.rows;
  const int cols = observationSpec_.cols;
  const int channels = observationSpec_.channels;
  for (int row = 0; row < rows; ++row) {
    for (int col = 0; col < cols; ++col) {
      const double x = self.x + (col - cols / 2) * observationSpec_.cellSize;
      const double y = self.y + (row - rows / 2) * observationSpec_.cellSize;
      if (x < arena_.leftX || x > arena_.rightX || y < arena_.topY || y > arena_.bottomY) {
        const int base = (row * cols + col) * channels;
        if (base + 5 < bufferLen) buffer[base + 5] = 1.0f;
      }
    }
  }
}

int Simulation::writeObservation(int agentId, float* buffer, int bufferLen) const {
  const int required = observationFloatCount();
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  const Entity* self = findEntity(agentId);
  if (!self || self->kind != "agent") return -1;
  addObservationBoundary(*self, buffer, bufferLen);
  for (const auto& entity : entities_) {
    if (!entity.removed && !entity.deleting) addObservationOccupancy(entity, *self, buffer, bufferLen);
  }
  return required;
}

int Simulation::writeObservations(float* buffer, int bufferLen) const {
  const int perAgent = observationFloatCount();
  const int required = perAgent * static_cast<int>(possibleAgentIds_.size());
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) {
    const int agentId = possibleAgentIds_[i];
    if (std::find(agentIds_.begin(), agentIds_.end(), agentId) == agentIds_.end()) continue;
    const int offset = static_cast<int>(i) * perAgent;
    const int written = writeObservation(agentId, buffer + offset, perAgent);
    if (written < 0) continue;
  }
  return required;
}

int Simulation::writeAliveMask(int* buffer, int bufferLen) const {
  const int required = static_cast<int>(possibleAgentIds_.size());
  if (!buffer || bufferLen < required) return required;
  for (int i = 0; i < required; ++i) {
    const int agentId = possibleAgentIds_[static_cast<std::size_t>(i)];
    buffer[i] = std::find(agentIds_.begin(), agentIds_.end(), agentId) == agentIds_.end() ? 0 : 1;
  }
  return required;
}

int Simulation::writeAgentIds(int* buffer, int bufferLen) const {
  const int required = static_cast<int>(agentIds_.size());
  if (!buffer || bufferLen < required) return required;
  for (int i = 0; i < required; ++i) buffer[i] = agentIds_[static_cast<std::size_t>(i)];
  return required;
}

int Simulation::agentStateFloatCount() const { return 10; }

int Simulation::writeAgentStates(float* buffer, int bufferLen) const {
  const int fields = agentStateFloatCount();
  const int required = fields * static_cast<int>(possibleAgentIds_.size());
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) {
    const int agentId = possibleAgentIds_[i];
    const int base = static_cast<int>(i) * fields;
    buffer[base + 0] = static_cast<float>(agentId);
    const Entity* agent = findEntity(agentId);
    if (!agent || agent->kind != "agent") continue;
    buffer[base + 1] = 1.0f;
    buffer[base + 2] = static_cast<float>(agent->x);
    buffer[base + 3] = static_cast<float>(agent->y);
    buffer[base + 4] = static_cast<float>(agent->vx);
    buffer[base + 5] = static_cast<float>(agent->vy);
    buffer[base + 6] = static_cast<float>(agent->health);
    buffer[base + 7] = static_cast<float>(agent->maxHealth);
    buffer[base + 8] = static_cast<float>(agent->score);
    buffer[base + 9] = static_cast<float>(agent->teamId);
  }
  return required;
}

int Simulation::agentProgressionFloatCount() const { return 5 + HeadlessStatCount + HeadlessStatCount + HeadlessTankUpgradeSlots; }

int Simulation::writeAgentProgressions(float* buffer, int bufferLen) const {
  const int fields = agentProgressionFloatCount();
  const int required = fields * static_cast<int>(possibleAgentIds_.size());
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) {
    const int agentId = possibleAgentIds_[i];
    const int base = static_cast<int>(i) * fields;
    const Entity* agent = findEntity(agentId);
    if (!agent || agent->kind != "agent") continue;
    const int level = levelFor(*agent);
    const int statsAvailable = statsAvailableFor(*agent);
    bool canTankUpgrade = false;
    buffer[base + 0] = static_cast<float>(level);
    buffer[base + 1] = static_cast<float>(agent->currentTankId);
    buffer[base + 2] = static_cast<float>(statsAvailable);
    buffer[base + 3] = statsAvailable > 0 ? 1.0f : 0.0f;
    for (int slotIndex = 0; slotIndex < HeadlessTankUpgradeSlots; ++slotIndex) {
      const float legal = canApplyTankUpgradeSlot(*agent, slotIndex) ? 1.0f : 0.0f;
      buffer[base + 5 + (HeadlessStatCount * 2) + slotIndex] = legal;
      canTankUpgrade = canTankUpgrade || legal > 0.0f;
    }
    buffer[base + 4] = canTankUpgrade ? 1.0f : 0.0f;
    for (int statIndex = 0; statIndex < HeadlessStatCount; ++statIndex) {
      buffer[base + 5 + statIndex] = static_cast<float>(agent->statLevels[static_cast<std::size_t>(statIndex)]);
      buffer[base + 5 + HeadlessStatCount + statIndex] = canApplyStatUpgrade(*agent, statIndex) ? 1.0f : 0.0f;
    }
  }
  return required;
}

int Simulation::tick() const { return tick_; }
int Simulation::activeEntityCount() const { return static_cast<int>(entities_.size()); }
const Config& Simulation::config() const { return config_; }

} // namespace diepcustom::headless
