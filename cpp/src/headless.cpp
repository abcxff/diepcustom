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
constexpr int PhysicsNoOwnTeamCollision = 1 << 3;
constexpr int PhysicsSolidWall = 1 << 4;
constexpr int PhysicsOnlySameOwnerCollision = 1 << 5;
constexpr int PhysicsCanEscapeArena = 1 << 8;
constexpr double Pi = 3.141592653589793238462643383279502884;

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
  initializeWorld();
}

void Simulation::initializeWorld() {
  arena_ = Arena();
  if (config_.scenario == "empty-arena") return;
  for (int i = 0; i < config_.agents; ++i) spawnAgent(i);
  if (config_.scenario == "dense-collision") {
    for (int i = 0; i < 24; ++i) spawnShape(i);
  } else if (config_.scenario == "agents-projectiles") {
    for (int i = 0; i < config_.agents; ++i) {
      if (Entity* agent = findEntity(agentIds_[static_cast<std::size_t>(i)])) fireProjectile(*agent);
    }
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
  e.health = e.maxHealth = 100;
  e.damagePerTick = 2;
  e.size = e.width = 30;
  e.styleColor = ColorTank;
  e.scoreReward = 25;
  entities_.push_back(e);
  agentIds_.push_back(e.id);
}

void Simulation::spawnShape(int index) {
  Entity e;
  e.id = nextId_++;
  e.hash = nextHash_++;
  e.kind = "shape";
  e.teamId = -100 - index;
  if (config_.scenario == "dense-collision") {
    e.x = -120 + (index % 8) * 32;
    e.y = -48 + (index / 8) * 32;
  } else {
    e.x = -500 + index * 250 + (rng_.nextDouble01() - 0.5) * 20.0;
    e.y = 120 + index * 40 + (rng_.nextDouble01() - 0.5) * 20.0;
  }
  e.health = e.maxHealth = 20;
  e.damagePerTick = 1;
  e.size = e.width = 22;
  e.styleColor = ColorEnemySquare;
  e.scoreReward = 10;
  entities_.push_back(e);
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
  for (std::size_t i = 0; i < agentIds_.size(); ++i) if (agentIds_[i] == id) return static_cast<int>(i);
  return -1;
}

StepResult Simulation::step(const std::vector<Action>& actions) {
  StepResult result;
  result.rewards.assign(static_cast<std::size_t>(std::max(0, config_.agents)), 0.0);
  tick_ += 1;
  applyActions(actions, result);
  resolveCollisions(result);
  integrateEntities();
  cleanupEntities();
  result.tick = tick_;
  result.done = tick_ >= config_.maxTicks || agentIds_.empty();
  return result;
}

void Simulation::applyActions(const std::vector<Action>& actions, StepResult&) {
  for (auto& entity : entities_) if (entity.cooldown > 0) entity.cooldown -= 1;
  for (const auto& action : actions) {
    Entity* agent = findEntity(action.agentId);
    if (!agent || agent->kind != "agent" || agent->deleting) continue;
    const double moveMag = std::sqrt(action.moveX * action.moveX + action.moveY * action.moveY);
    if (moveMag > 0.000001) {
      const double scale = std::min(1.0, moveMag);
      agent->vx += (action.moveX / moveMag) * scale * 1.25;
      agent->vy += (action.moveY / moveMag) * scale * 1.25;
    }
    if (std::fabs(action.aimX) > 0.000001 || std::fabs(action.aimY) > 0.000001) {
      agent->angle = std::atan2(action.aimY, action.aimX);
    }
    if (action.fire && agent->cooldown == 0) {
      agent->cooldown = action.altFire ? 12 : 8;
      fireProjectile(*agent);
    }
  }
}

void Simulation::fireProjectile(Entity& owner) {
  Entity projectile;
  projectile.id = nextId_++;
  projectile.hash = nextHash_++;
  projectile.kind = "projectile";
  projectile.ownerId = owner.id;
  projectile.teamId = owner.teamId;
  projectile.x = owner.x + std::cos(owner.angle) * (owner.size + 8);
  projectile.y = owner.y + std::sin(owner.angle) * (owner.size + 8);
  projectile.angle = owner.angle;
  projectile.health = projectile.maxHealth = 12;
  projectile.damagePerTick = 6;
  projectile.size = projectile.width = 10;
  projectile.pushFactor = 4;
  projectile.styleColor = ColorTank;
  projectile.projectileMotion = true;
  projectile.spawnTick = tick_;
  projectile.lifeLength = 50;
  projectile.movementAngle = owner.angle;
  projectile.baseSpeed = 9;
  projectile.baseAccel = 0;
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
        << ",\"physics\":{\"sides\":" << e.sides << ",\"size\":" << num(e.size) << ",\"width\":" << num(e.width) << ",\"flags\":" << e.physicsFlags << "}"
        << ",\"health\":{\"health\":" << num(e.health) << ",\"maxHealth\":" << num(e.maxHealth) << "}"
        << ",\"damage\":{\"damagePerTick\":" << num(e.damagePerTick) << ",\"lastDamageTick\":" << e.lastDamageTick << "}"
        << ",\"score\":{\"score\":" << num(e.score) << ",\"scoreReward\":" << num(e.scoreReward) << "}"
        << ",\"lifecycle\":{\"deleting\":" << (e.deleting ? "true" : "false") << ",\"removed\":" << (e.removed ? "true" : "false") << ",\"deletionFrame\":" << e.deletionFrame << "}"
        << ",\"projectile\":{\"active\":" << (e.projectileMotion ? "true" : "false") << ",\"spawnTick\":" << e.spawnTick << ",\"lifeLength\":" << e.lifeLength << "}}";
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

int Simulation::tick() const { return tick_; }
int Simulation::activeEntityCount() const { return static_cast<int>(entities_.size()); }
const Config& Simulation::config() const { return config_; }

} // namespace diepcustom::headless
