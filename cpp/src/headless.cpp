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
constexpr double CombatLevelNorm = 45.0;
constexpr double CombatStatNorm = 7.0;
constexpr double CombatVelocityNorm = 100.0;
constexpr double CombatMaxUpgradeTier = 3.0;
constexpr double CombatRecentDamageDecayTicks = 20.0;
constexpr int CombatChannelWall = 0;
constexpr int CombatChannelFarmablePresence = 1;
constexpr int CombatChannelFarmableValue = 2;
constexpr int CombatChannelEnemyPresence = 3;
constexpr int CombatChannelEnemyThreat = 4;
constexpr int CombatChannelEnemyOpportunity = 5;
constexpr int CombatChannelEnemyHealthRatio = 6;
constexpr int CombatChannelEnemyVelocityX = 7;
constexpr int CombatChannelEnemyVelocityY = 8;
constexpr int CombatChannelEnemyTypeBalanced = 9;
constexpr int CombatChannelEnemyTypeSniper = 10;
constexpr int CombatChannelEnemyTypeSpammer = 11;
constexpr int CombatChannelEnemyTypeRammer = 12;
constexpr int CombatChannelEnemyTypeAreaControl = 13;
constexpr int CombatChannelEnemyTypeUnknown = 14;
constexpr int CombatChannelProjectilePresence = 15;
constexpr int CombatChannelProjectileVelocityX = 16;
constexpr int CombatChannelProjectileVelocityY = 17;
constexpr int TankCategoryBalanced = 0;
constexpr int TankCategorySniper = 1;
constexpr int TankCategorySpammer = 2;
constexpr int TankCategoryRammer = 3;
constexpr int TankCategoryAreaControl = 4;
constexpr int TankCategoryUnknown = 5;
constexpr int PackedStatBits = 3;
constexpr int PackedTankUpgradeBits = 3;
constexpr int PackedTankUpgradeOffset = HeadlessStatCount * PackedStatBits;
constexpr int MaxPackedTankUpgradeEvents = 3;

struct CombatRangeProfile {
  double minGoodRange = 0.0;
  double idealRange = 0.5;
  double maxGoodRange = 1.0;
};

struct CombatThreatWeights {
  double distance = 0.2;
  double closing = 0.2;
  double enemyType = 0.2;
  double bulletPressure = 0.2;
  double relativeStrength = 0.2;
};

struct CombatOpportunityWeights {
  double rangeFit = 0.2;
  double strengthAdvantage = 0.15;
  double catchability = 0.1;
  double matchup = 0.2;
  double targetValue = 0.15;
  double lineOfFire = 0.1;
  double pressurePenalty = 0.1;
};

struct DerivedCombatStats {
  double maxHealth = 50.0;
  double bulletDamage = 7.0;
  double bulletSpeed = 50.0;
  double bulletRange = 3750.0;
  double reloadTime = 15.0;
  double movementSpeed = 1.25;
};

constexpr std::array<int, HeadlessTankDefinitionCount> kTankCategoryById{
    TankCategoryBalanced, TankCategoryBalanced, TankCategorySpammer, TankCategorySpammer, TankCategorySpammer, TankCategorySpammer,
    TankCategorySniper, TankCategorySpammer, TankCategoryBalanced, TankCategoryRammer, TankCategoryBalanced, TankCategoryAreaControl,
    TankCategoryAreaControl, TankCategorySpammer, TankCategorySpammer, TankCategorySniper, TankCategoryUnknown, TankCategoryAreaControl,
    TankCategorySpammer, TankCategorySniper, TankCategorySpammer, TankCategorySniper, TankCategorySniper, TankCategoryRammer,
    TankCategoryRammer, TankCategoryBalanced, TankCategoryAreaControl, TankCategoryAreaControl, TankCategorySniper, TankCategorySpammer,
    TankCategoryUnknown, TankCategoryAreaControl, TankCategoryAreaControl, TankCategoryAreaControl, TankCategoryAreaControl, TankCategoryAreaControl,
    TankCategoryRammer, TankCategoryUnknown, TankCategoryRammer, TankCategorySpammer, TankCategorySpammer, TankCategorySpammer,
    TankCategorySpammer, TankCategorySpammer, TankCategoryAreaControl, TankCategoryAreaControl, TankCategoryAreaControl, TankCategoryAreaControl,
    TankCategoryAreaControl, TankCategoryBalanced, TankCategoryRammer, TankCategoryRammer, TankCategoryAreaControl, TankCategoryUnknown,
    TankCategoryBalanced, TankCategoryBalanced,
};

constexpr std::array<CombatRangeProfile, 6> kRangeProfiles{{
    {0.15, 0.50, 0.85},
    {0.35, 0.70, 1.00},
    {0.20, 0.55, 0.90},
    {0.00, 0.18, 0.45},
    {0.25, 0.60, 0.95},
    {0.20, 0.50, 0.85},
}};

constexpr std::array<CombatThreatWeights, 6> kThreatWeights{{
    {0.25, 0.20, 0.20, 0.20, 0.15},
    {0.15, 0.30, 0.20, 0.25, 0.10},
    {0.20, 0.15, 0.20, 0.30, 0.15},
    {0.15, 0.25, 0.15, 0.20, 0.25},
    {0.20, 0.15, 0.25, 0.25, 0.15},
    {0.20, 0.20, 0.20, 0.20, 0.20},
}};

constexpr std::array<CombatOpportunityWeights, 6> kOpportunityWeights{{
    {0.20, 0.15, 0.10, 0.20, 0.15, 0.15, 0.10},
    {0.30, 0.10, 0.05, 0.15, 0.10, 0.20, 0.10},
    {0.22, 0.10, 0.10, 0.18, 0.15, 0.10, 0.15},
    {0.28, 0.20, 0.20, 0.12, 0.10, 0.05, 0.05},
    {0.18, 0.10, 0.12, 0.15, 0.12, 0.18, 0.15},
    {0.18, 0.12, 0.10, 0.15, 0.12, 0.13, 0.10},
}};

constexpr std::array<std::array<double, 6>, 6> kMatchupScores{{
    {0.50, 0.50, 0.50, 0.45, 0.45, 0.50},
    {0.60, 0.50, 0.55, 0.25, 0.50, 0.45},
    {0.55, 0.45, 0.50, 0.60, 0.45, 0.50},
    {0.55, 0.70, 0.45, 0.50, 0.35, 0.45},
    {0.55, 0.45, 0.55, 0.65, 0.50, 0.50},
    {0.50, 0.45, 0.50, 0.45, 0.45, 0.50},
}};

constexpr std::array<DerivedCombatStats, 6> kBaseDerivedStats{{
    {50.0, 7.0, 50.0, 3750.0, 15.0, 1.25},
    {45.0, 8.5, 58.0, 5336.0, 18.0, 1.15},
    {50.0, 6.0, 48.0, 3456.0, 11.0, 1.20},
    {60.0, 5.0, 42.0, 2604.0, 14.0, 1.45},
    {55.0, 6.5, 44.0, 4400.0, 16.0, 1.05},
    {50.0, 6.5, 48.0, 3600.0, 15.0, 1.15},
}};

constexpr DerivedCombatStats kMaxDerivedStats{100.0, 16.0, 75.0, 9000.0, 20.0, 2.2};

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

double clip01(double value) { return std::max(0.0, std::min(1.0, value)); }

double clipSigned(double value, double scale) {
  if (scale <= 0.0) return 0.0;
  return std::max(-1.0, std::min(1.0, value / scale));
}

double arenaCenterNorm(double value, double low, double high) {
  if (high <= low) return 0.5;
  return clip01((value - low) / (high - low));
}

double normalizedScore(double score) {
  const double reference = std::max(1.0, levelToScore(MaxPlayerLevel));
  return clip01(std::log1p(std::max(0.0, score)) / std::log1p(reference));
}

double xpProgressToNextLevel(double score, int level) {
  if (level >= MaxPlayerLevel) return 1.0;
  const double currentFloor = levelToScore(level);
  const double nextFloor = levelToScore(level + 1);
  if (nextFloor <= currentFloor) return 0.0;
  return clip01((score - currentFloor) / (nextFloor - currentFloor));
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

int tankCategoryForTankId(int tankId) {
  if (tankId < 0 || tankId >= HeadlessTankDefinitionCount) return TankCategoryUnknown;
  return kTankCategoryById[static_cast<std::size_t>(tankId)];
}

int upgradeTierForTankId(int tankId) {
  if (tankId <= 0) return 0;
  const TankRuntimeDefinition* definition = tankDefinitionFor(tankId);
  if (!definition) return 0;
  if (definition->levelRequirement >= 45) return 3;
  if (definition->levelRequirement >= 30) return 2;
  if (definition->levelRequirement >= 15) return 1;
  return 0;
}

DerivedCombatStats derivedCombatStatsFor(int tankId, const std::array<int, HeadlessStatCount>& statLevels, bool forceRammer = false) {
  const int category = forceRammer ? TankCategoryRammer : tankCategoryForTankId(tankId);
  DerivedCombatStats stats = kBaseDerivedStats[static_cast<std::size_t>(std::max(0, std::min(TankCategoryUnknown, category)))];
  const double maxHealthStat = static_cast<double>(statLevels[0]);
  const double bulletSpeedStat = static_cast<double>(statLevels[3]);
  const double bulletPenStat = static_cast<double>(statLevels[4]);
  const double bulletDamageStat = static_cast<double>(statLevels[5]);
  const double reloadStat = static_cast<double>(statLevels[6]);
  const double movementStat = static_cast<double>(statLevels[7]);
  stats.maxHealth *= 1.0 + 0.12 * maxHealthStat;
  stats.bulletDamage *= 1.0 + 0.08 * bulletPenStat + 0.10 * bulletDamageStat;
  stats.bulletSpeed *= 1.0 + 0.08 * bulletSpeedStat;
  stats.bulletRange *= 1.0 + 0.06 * bulletPenStat + 0.04 * bulletSpeedStat;
  stats.reloadTime = std::max(4.0, stats.reloadTime * (1.0 - 0.06 * reloadStat));
  stats.movementSpeed *= 1.0 + 0.06 * movementStat;
  return stats;
}

double enemyTypeThreatScore(int enemyCategory) {
  switch (enemyCategory) {
    case TankCategoryBalanced: return 0.50;
    case TankCategorySniper: return 0.60;
    case TankCategorySpammer: return 0.58;
    case TankCategoryRammer: return 0.72;
    case TankCategoryAreaControl: return 0.62;
    default: return 0.50;
  }
}

double rangeFitScore(int selfCategory, double distanceNorm) {
  const auto& profile = kRangeProfiles[static_cast<std::size_t>(std::max(0, std::min(TankCategoryUnknown, selfCategory)))];
  if (distanceNorm <= profile.idealRange) {
    const double span = std::max(0.000001, profile.idealRange - profile.minGoodRange);
    return clip01((distanceNorm - profile.minGoodRange) / span);
  }
  const double span = std::max(0.000001, profile.maxGoodRange - profile.idealRange);
  return clip01(1.0 - ((distanceNorm - profile.idealRange) / span));
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
  resetEpisodeStats();
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
  resetEpisodeStats();
  combatPrevActions_.assign(static_cast<std::size_t>(std::max(0, config_.agents)), std::array<float, 5>{});
  initializeWorld();
}

void Simulation::initializeWorld() {
  arena_ = Arena();
  combatPrevActions_.assign(static_cast<std::size_t>(std::max(0, config_.agents)), std::array<float, 5>{});
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
  syncEpisodeStatsFromEntity(entities_.back());
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

int Simulation::possibleAgentSlotForId(int id) const {
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) {
    if (possibleAgentIds_[i] == id) return static_cast<int>(i);
  }
  return -1;
}

void Simulation::resetEpisodeStats() {
  episodeStats_.assign(static_cast<std::size_t>(std::max(0, config_.agents)), EpisodeStats{});
}

EpisodeStats* Simulation::episodeStatsForAgentId(int id) {
  const int slot = possibleAgentSlotForId(id);
  if (slot < 0 || static_cast<std::size_t>(slot) >= episodeStats_.size()) return nullptr;
  return &episodeStats_[static_cast<std::size_t>(slot)];
}

const EpisodeStats* Simulation::episodeStatsForAgentId(int id) const {
  const int slot = possibleAgentSlotForId(id);
  if (slot < 0 || static_cast<std::size_t>(slot) >= episodeStats_.size()) return nullptr;
  return &episodeStats_[static_cast<std::size_t>(slot)];
}

void Simulation::updatePackedStatLevels(EpisodeStats& stats, const Entity& entity) const {
  std::uint64_t packed = static_cast<std::uint64_t>(stats.upgradeChoices);
  packed &= ~((static_cast<std::uint64_t>(1) << PackedTankUpgradeOffset) - 1);
  for (int statIndex = 0; statIndex < HeadlessStatCount; ++statIndex) {
    const std::uint64_t value = static_cast<std::uint64_t>(std::max(0, std::min(7, entity.statLevels[static_cast<std::size_t>(statIndex)])));
    packed |= value << (statIndex * PackedStatBits);
  }
  stats.upgradeChoices = static_cast<double>(packed);
}

void Simulation::syncEpisodeStatsFromEntity(const Entity& entity) {
  EpisodeStats* stats = episodeStatsForAgentId(entity.id);
  if (!stats) return;
  stats->scoreTotal = entity.score;
  stats->levelReached = levelFor(entity);
  stats->tankClass = entity.currentTankId;
  updatePackedStatLevels(*stats, entity);
}

void Simulation::syncEpisodeStatsFromLiveAgents() {
  for (const auto& entity : entities_) {
    if (entity.kind == "agent" && entity.agentIndex >= 0) syncEpisodeStatsFromEntity(entity);
  }
}

void Simulation::recordShotFired(const Entity& owner) {
  if (EpisodeStats* stats = episodeStatsForAgentId(owner.id)) stats->shotsFired += 1;
}

void Simulation::recordShotHit(const Entity& source) {
  const int agentId = source.ownerId >= 0 ? source.ownerId : source.id;
  if (EpisodeStats* stats = episodeStatsForAgentId(agentId)) stats->shotsHit += 1;
}

void Simulation::recordDamageDealt(const Entity& source, double amount) {
  const int agentId = source.ownerId >= 0 ? source.ownerId : source.id;
  if (EpisodeStats* stats = episodeStatsForAgentId(agentId)) stats->damageDealt += std::max(0.0, amount);
}

void Simulation::recordDamageTaken(const Entity& target, double amount) {
  if (EpisodeStats* stats = episodeStatsForAgentId(target.id)) stats->damageTaken += std::max(0.0, amount);
}

void Simulation::recordKill(const Entity& source, const Entity& target) {
  if (target.kind != "agent") return;
  const int agentId = source.ownerId >= 0 ? source.ownerId : source.id;
  if (EpisodeStats* stats = episodeStatsForAgentId(agentId)) stats->kills += 1;
}

void Simulation::recordScoreReward(const Entity& source, const Entity& target) {
  const int agentId = source.ownerId >= 0 ? source.ownerId : source.id;
  EpisodeStats* stats = episodeStatsForAgentId(agentId);
  if (!stats) return;
  if (target.kind == "agent") stats->scoreFromPvp += target.scoreReward;
  else stats->scoreFromFarming += target.scoreReward;
}

void Simulation::recordDeath(Entity& target, const Entity&, DeathCause cause) {
  EpisodeStats* stats = episodeStatsForAgentId(target.id);
  if (!stats || target.kind != "agent") return;
  if (stats->deathCount <= 0) {
    stats->deathCount = 1;
    stats->deathCause = cause;
  }
  syncEpisodeStatsFromEntity(target);
}

void Simulation::recordBoundaryDeath(Entity& target) {
  EpisodeStats* stats = episodeStatsForAgentId(target.id);
  if (!stats || target.kind != "agent") return;
  if (stats->deathCount <= 0) {
    stats->deathCount = 1;
    stats->deathCause = DeathCause::Boundary;
  }
  syncEpisodeStatsFromEntity(target);
}

void Simulation::recordStatUpgrade(const Entity& entity) { syncEpisodeStatsFromEntity(entity); }

void Simulation::recordTankUpgrade(const Entity& entity, int slotIndex) {
  EpisodeStats* stats = episodeStatsForAgentId(entity.id);
  if (!stats) return;
  const int clampedCount = std::max(0, std::min(MaxPackedTankUpgradeEvents, stats->tankUpgradeCount));
  if (slotIndex >= 0 && slotIndex < 7 && clampedCount < MaxPackedTankUpgradeEvents) {
    std::uint64_t packed = static_cast<std::uint64_t>(stats->upgradeChoices);
    packed |= static_cast<std::uint64_t>(slotIndex + 1) << (PackedTankUpgradeOffset + clampedCount * PackedTankUpgradeBits);
    stats->upgradeChoices = static_cast<double>(packed);
    stats->tankUpgradeCount = clampedCount + 1;
  }
  syncEpisodeStatsFromEntity(entity);
}

StepResult Simulation::step(const std::vector<Action>& actions) {
  StepResult result;
  result.rewards.assign(static_cast<std::size_t>(std::max(0, config_.agents)), 0.0);
  tick_ += 1;
  for (const auto& entity : entities_) {
    if (entity.kind == "agent" && !entity.removed && !entity.deleting && entity.health > 0.0001) {
      if (EpisodeStats* stats = episodeStatsForAgentId(entity.id)) stats->lifetimeSteps += 1;
    }
  }
  if (config_.scenario == "basic-ai-parity") applyBasicAi();
  applyActions(actions, result);
  resolveCollisions(result);
  integrateEntities();
  syncEpisodeStatsFromLiveAgents();
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
  for (auto& entity : entities_) {
    if (entity.cooldown > 0) entity.cooldown -= 1;
    if (entity.recentDamageTaken > 0.0) {
      entity.recentDamageTaken = std::max(0.0, entity.recentDamageTaken - (entity.maxHealth / CombatRecentDamageDecayTicks));
      if (entity.recentDamageTaken <= 0.0001) {
        entity.recentDamageTaken = 0.0;
        entity.recentDamageDirectionX = 0.0;
        entity.recentDamageDirectionY = 0.0;
      }
    }
  }
  for (const auto& action : actions) {
    const int slot = possibleAgentSlotForId(action.agentId);
    if (slot >= 0 && static_cast<std::size_t>(slot) < combatPrevActions_.size()) {
      combatPrevActions_[static_cast<std::size_t>(slot)] = normalizeCombatPrevAction(action);
    }
    Entity* agent = findEntity(action.agentId);
    if (!agent || agent->kind != "agent" || agent->deleting) continue;
    const double clampedMoveX = std::max(-1.0, std::min(1.0, action.moveX));
    const double clampedMoveY = std::max(-1.0, std::min(1.0, action.moveY));
    const double clampedAimX = std::max(-1.0, std::min(1.0, action.aimX));
    const double clampedAimY = std::max(-1.0, std::min(1.0, action.aimY));
    const double moveMag = std::sqrt(clampedMoveX * clampedMoveX + clampedMoveY * clampedMoveY);
    if (moveMag > 0.000001) {
      const double scale = std::min(1.0, moveMag);
      const DerivedCombatStats derived = derivedCombatStatsFor(agent->currentTankId, agent->statLevels);
      agent->vx += (clampedMoveX / moveMag) * scale * derived.movementSpeed;
      agent->vy += (clampedMoveY / moveMag) * scale * derived.movementSpeed;
    }
    if (std::fabs(clampedAimX) > 0.000001 || std::fabs(clampedAimY) > 0.000001) {
      agent->angle = std::atan2(clampedAimY, clampedAimX);
    }
    tryApplyStatUpgrade(*agent, action.statUpgradeChoice);
    tryApplyTankUpgradeSlot(*agent, action.tankUpgradeChoice);
    if (action.fire && agent->cooldown == 0) {
      const DerivedCombatStats derived = derivedCombatStatsFor(agent->currentTankId, agent->statLevels);
      agent->cooldown = std::max(1, static_cast<int>(std::round(derived.reloadTime)));
      fireProjectile(*agent);
    }
  }
}

void Simulation::applyTankDefinition(Entity& entity) {
  const TankRuntimeDefinition* definition = tankDefinitionFor(entity.currentTankId);
  if (!definition) return;
  entity.absorbtionFactor = definition->absorbtionFactor;
  entity.sides = definition->sides;
  entity.barrels.assign(static_cast<std::size_t>(std::max(0, definition->barrelCount)), BarrelSnapshot{});
  for (int statIndex = 0; statIndex < HeadlessStatCount; ++statIndex) {
    const int maxAllowed = definition->statCaps[static_cast<std::size_t>(statIndex)];
    if (entity.statLevels[static_cast<std::size_t>(statIndex)] > maxAllowed) {
      entity.statLevels[static_cast<std::size_t>(statIndex)] = maxAllowed;
    }
  }
  const DerivedCombatStats derived = derivedCombatStatsFor(entity.currentTankId, entity.statLevels);
  entity.maxHealth = derived.maxHealth;
  entity.health = std::min(entity.health, entity.maxHealth);
  entity.cooldownBase = std::max(1, static_cast<int>(std::round(derived.reloadTime)));
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
  applyTankDefinition(entity);
  recordStatUpgrade(entity);
  return true;
}

bool Simulation::tryApplyTankUpgradeSlot(Entity& entity, int slotIndex) {
  if (slotIndex == HeadlessNoUpgradeChoice || !canApplyTankUpgradeSlot(entity, slotIndex)) return false;
  const TankRuntimeDefinition* definition = tankDefinitionFor(entity.currentTankId);
  if (!definition) return false;
  entity.currentTankId = definition->upgradeIds[static_cast<std::size_t>(slotIndex)];
  applyTankDefinition(entity);
  recordTankUpgrade(entity, slotIndex);
  return true;
}

void Simulation::fireProjectile(Entity& owner) {
  if (owner.barrels.empty()) return;
  const DerivedCombatStats derived = derivedCombatStatsFor(owner.currentTankId, owner.statLevels);
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
  const double bulletPenStat = static_cast<double>(owner.statLevels[4]);
  projectile.health = projectile.maxHealth = 2.0 * (1.0 + 0.12 * bulletPenStat);
  projectile.damagePerTick = derived.bulletDamage;
  projectile.minDamageMultiplier = 0.25;
  projectile.maxDamageMultiplier = 1;
  projectile.size = projectile.width = 18.0 + std::min(10.0, static_cast<double>(owner.statLevels[5]));
  projectile.pushFactor = 7.0 / 3.0;
  projectile.absorbtionFactor = 1;
  projectile.styleColor = ColorTank;
  projectile.projectileMotion = true;
  projectile.spawnTick = tick_;
  projectile.lifeLength = std::max(30, static_cast<int>(std::round(derived.bulletRange / std::max(1.0, derived.bulletSpeed))));
  projectile.movementAngle = projectile.angle;
  projectile.baseAccel = std::max(6.0, derived.bulletSpeed * 0.4);
  projectile.baseSpeed = std::max(10.0, derived.bulletSpeed - rng_.nextDouble01());
  owner.vx += std::cos(projectile.angle + Pi) * 2.0;
  owner.vy += std::sin(projectile.angle + Pi) * 2.0;
  projectile.vx = owner.vx;
  projectile.vy = owner.vy;
  refreshVelocity(projectile.vx, projectile.vy, projectile.velocityMagnitude, projectile.velocityAngle);
  recordShotFired(owner);
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
    recordBoundaryDeath(self);
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
  if (amount > 0.0 && target.kind == "agent") {
    target.recentDamageTaken = std::min(target.maxHealth, target.recentDamageTaken * 0.5 + amount);
    const double dx = target.x - source.x;
    const double dy = target.y - source.y;
    const double magnitude = std::sqrt(dx * dx + dy * dy);
    if (magnitude > 0.000001) {
      target.recentDamageDirectionX = dx / magnitude;
      target.recentDamageDirectionY = dy / magnitude;
    }
  }
  const double before = target.health;
  target.health -= amount;
  const double appliedDamage = std::max(0.0, before - std::max(0.0, target.health));
  if (appliedDamage > 0.0) {
    recordDamageDealt(source, appliedDamage);
    if (target.kind == "agent") recordDamageTaken(target, appliedDamage);
    if (source.kind == "projectile" && target.kind != "projectile") recordShotHit(source);
  }
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
    recordScoreReward(source, target);
    recordKill(source, target);
    recordDeath(target, source, source.kind == "projectile" ? DeathCause::Projectile : DeathCause::Collision);
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
        << ",\"currentTankId\":" << e.currentTankId
        << ",\"position\":{\"x\":" << num(e.x) << ",\"y\":" << num(e.y) << ",\"angle\":" << num(e.angle) << "}"
        << ",\"velocity\":{\"x\":" << num(e.vx) << ",\"y\":" << num(e.vy) << ",\"magnitude\":" << num(e.velocityMagnitude) << ",\"angle\":" << num(e.velocityAngle) << "}"
        << ",\"physics\":{\"sides\":" << e.sides << ",\"size\":" << num(e.size) << ",\"width\":" << num(e.width) << ",\"flags\":" << e.physicsFlags << ",\"absorbtionFactor\":" << num(e.absorbtionFactor) << ",\"pushFactor\":" << num(e.pushFactor) << "}"
        << ",\"style\":{\"color\":" << e.styleColor << "}"
        << ",\"styleColor\":" << e.styleColor
        << ",\"health\":{\"health\":" << num(e.health) << ",\"maxHealth\":" << num(e.maxHealth) << "}"
        << ",\"damage\":{\"damagePerTick\":" << num(e.damagePerTick) << ",\"lastDamageTick\":" << e.lastDamageTick
        << ",\"recentTaken\":" << num(e.recentDamageTaken) << ",\"recentDirectionX\":" << num(e.recentDamageDirectionX)
        << ",\"recentDirectionY\":" << num(e.recentDamageDirectionY) << "}"
        << ",\"score\":{\"score\":" << num(e.score) << ",\"scoreReward\":" << num(e.scoreReward) << "}"
        << ",\"cooldown\":{\"remaining\":" << e.cooldown << ",\"base\":" << e.cooldownBase << "}"
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

std::array<float, 5> Simulation::normalizeCombatPrevAction(const Action& action) const {
  const double moveX = std::max(-1.0, std::min(1.0, action.moveX));
  const double moveY = std::max(-1.0, std::min(1.0, action.moveY));
  const double aimX = std::max(-1.0, std::min(1.0, action.aimX));
  const double aimY = std::max(-1.0, std::min(1.0, action.aimY));
  return {
      static_cast<float>(moveX),
      static_cast<float>(moveY),
      static_cast<float>(aimX),
      static_cast<float>(aimY),
      action.fire ? 1.0f : 0.0f,
  };
}

int Simulation::combatGridFloatCount() const {
  return combatObservationSpec_.channels * combatObservationSpec_.rows * combatObservationSpec_.cols;
}

int Simulation::writeCombatGrid(int agentId, float* buffer, int bufferLen) const {
  const int required = combatGridFloatCount();
  const int slot = possibleAgentSlotForId(agentId);
  if (slot < 0) return -1;
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);

  const Entity* self = findEntity(agentId);
  if (!self || self->kind != "agent") return required;

  const int rows = combatObservationSpec_.rows;
  const int cols = combatObservationSpec_.cols;
  const double cellSize = combatObservationSpec_.cellSize;
  const double selfAimX = std::cos(self->angle);
  const double selfAimY = std::sin(self->angle);
  const double gridRadius = std::max(1.0, (rows / 2) * cellSize);
  const auto indexFor = [rows, cols](int channel, int row, int col) { return ((channel * rows) + row) * cols + col; };
  const int selfCategory = tankCategoryForTankId(self->currentTankId);
  const DerivedCombatStats selfStats = derivedCombatStatsFor(self->currentTankId, self->statLevels);

  struct FarmableCandidate {
    bool present = false;
    double rank = -1.0;
    double value = 0.0;
  };
  struct ProjectileCandidate {
    bool present = false;
    double rank = -1.0;
    double velocityX = 0.0;
    double velocityY = 0.0;
  };
  struct EnemyCandidate {
    bool present = false;
    double rank = -1.0;
    double threat = 0.0;
    double opportunity = 0.0;
    double healthRatio = 0.0;
    double velocityX = 0.0;
    double velocityY = 0.0;
    int category = TankCategoryUnknown;
  };
  std::vector<FarmableCandidate> farmables(static_cast<std::size_t>(rows * cols));
  std::vector<ProjectileCandidate> projectiles(static_cast<std::size_t>(rows * cols));
  std::vector<EnemyCandidate> enemies(static_cast<std::size_t>(rows * cols));
  const auto cellOffset = [cols](int row, int col) { return row * cols + col; };

  auto farmableValue = [](const Entity& entity) {
    const double scoreReward = clip01(entity.scoreReward / 130.0) * 0.70;
    const double healthValue = clip01(entity.maxHealth / 100.0) * 0.30;
    return clip01(scoreReward + healthValue);
  };
  auto threatAndOpportunity = [&](int enemyCategory, double distance, double enemyVx, double enemyVy, double enemyHealthRatio, double enemyScoreNorm,
                                  double bulletPressure, double dx, double dy) {
    const double distanceNorm = clip01(distance / gridRadius);
    const double relativeVx = enemyVx - self->vx;
    const double relativeVy = enemyVy - self->vy;
    double closingScore = 0.0;
    if (distance > 0.000001) {
      const double closing = -((dx / distance) * relativeVx + (dy / distance) * relativeVy);
      closingScore = clip01(closing / CombatVelocityNorm);
    }
    const double relativeStrength =
        clip01((enemyHealthRatio * 0.75) + (1.0 - clip01(selfStats.maxHealth / kMaxDerivedStats.maxHealth)) * 0.25);
    const auto& threatWeights = kThreatWeights[static_cast<std::size_t>(selfCategory)];
    const double distanceThreat = 1.0 - distanceNorm;
    double threat =
        threatWeights.distance * distanceThreat +
        threatWeights.closing * closingScore +
        threatWeights.enemyType * enemyTypeThreatScore(enemyCategory) +
        threatWeights.bulletPressure * bulletPressure +
        threatWeights.relativeStrength * relativeStrength;
    double lineOfFire = 0.0;
    if (distance > 0.000001) {
      lineOfFire = clip01((((dx / distance) * selfAimX) + ((dy / distance) * selfAimY) + 1.0) * 0.5);
    }
    const double strengthAdvantage =
        clip01((selfStats.bulletDamage / std::max(1.0, kMaxDerivedStats.bulletDamage)) + (1.0 - enemyHealthRatio)) * 0.5;
    const double catchability = clip01(1.0 - (std::sqrt(relativeVx * relativeVx + relativeVy * relativeVy) / (CombatVelocityNorm * 1.25)));
    const double matchup = kMatchupScores[static_cast<std::size_t>(selfCategory)][static_cast<std::size_t>(enemyCategory)];
    const auto& opportunityWeights = kOpportunityWeights[static_cast<std::size_t>(selfCategory)];
    double opportunity =
        opportunityWeights.rangeFit * rangeFitScore(selfCategory, distanceNorm) +
        opportunityWeights.strengthAdvantage * strengthAdvantage +
        opportunityWeights.catchability * catchability +
        opportunityWeights.matchup * matchup +
        opportunityWeights.targetValue * enemyScoreNorm +
        opportunityWeights.lineOfFire * lineOfFire -
        opportunityWeights.pressurePenalty * bulletPressure;
    return std::pair<double, double>{clip01(threat), clip01(opportunity)};
  };

  for (int row = 0; row < rows; ++row) {
    const double y = self->y + (row - rows / 2) * cellSize;
    for (int col = 0; col < cols; ++col) {
      const double x = self->x + (col - cols / 2) * cellSize;
      if (x < arena_.leftX || x > arena_.rightX || y < arena_.topY || y > arena_.bottomY) {
        buffer[indexFor(CombatChannelWall, row, col)] = 1.0f;
      }
    }
  }

  std::vector<const Entity*> hostileProjectiles;
  hostileProjectiles.reserve(entities_.size());
  for (const auto& entity : entities_) {
    if (!entity.removed && !entity.deleting && entity.kind == "projectile" && entity.teamId != self->teamId) {
      hostileProjectiles.push_back(&entity);
    }
  }

  for (const auto& entity : entities_) {
    if (entity.removed || entity.deleting || entity.id == self->id) continue;

    const int col = static_cast<int>(std::floor((entity.x - self->x) / cellSize)) + cols / 2;
    const int row = static_cast<int>(std::floor((entity.y - self->y) / cellSize)) + rows / 2;
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;

    const double dx = entity.x - self->x;
    const double dy = entity.y - self->y;
    const double distance = std::sqrt(dx * dx + dy * dy);
    const int offset = cellOffset(row, col);

    if (entity.kind == "shape") {
      const double value = farmableValue(entity);
      const double rank = value * 0.8 + (1.0 - clip01(distance / gridRadius)) * 0.2;
      if (!farmables[static_cast<std::size_t>(offset)].present || rank > farmables[static_cast<std::size_t>(offset)].rank) {
        farmables[static_cast<std::size_t>(offset)] = FarmableCandidate{true, rank, value};
      }
      continue;
    }

    if (entity.teamId == self->teamId) continue;

    if (entity.kind == "projectile") {
      const double relativeVx = clipSigned(entity.vx - self->vx, CombatVelocityNorm);
      const double relativeVy = clipSigned(entity.vy - self->vy, CombatVelocityNorm);
      const double danger =
          clip01((1.0 - distance / gridRadius) * 0.5 + (std::sqrt((entity.vx - self->vx) * (entity.vx - self->vx) + (entity.vy - self->vy) * (entity.vy - self->vy)) / (CombatVelocityNorm * 2.0)) * 0.5);
      if (!projectiles[static_cast<std::size_t>(offset)].present || danger > projectiles[static_cast<std::size_t>(offset)].rank) {
        projectiles[static_cast<std::size_t>(offset)] = ProjectileCandidate{true, danger, relativeVx, relativeVy};
      }
      continue;
    }

    if (!(entity.kind == "agent" || entity.kind == "crasher")) continue;
    const int enemyCategory = entity.kind == "crasher" ? TankCategoryRammer : tankCategoryForTankId(entity.currentTankId);
    double bulletPressure = 0.0;
    for (const Entity* projectile : hostileProjectiles) {
      const double pdx = projectile->x - entity.x;
      const double pdy = projectile->y - entity.y;
      if (std::sqrt(pdx * pdx + pdy * pdy) <= cellSize * 2.0) {
        const double projectileDistanceToSelf = std::sqrt((projectile->x - self->x) * (projectile->x - self->x) + (projectile->y - self->y) * (projectile->y - self->y));
        bulletPressure = std::max(bulletPressure, clip01(1.0 - projectileDistanceToSelf / gridRadius));
      }
    }
    const double enemyHealthRatio = entity.maxHealth > 0.0 ? clip01(entity.health / entity.maxHealth) : 0.0;
    const double enemyScoreNorm = normalizedScore(entity.score + entity.scoreReward);
    const auto [threat, opportunity] =
        threatAndOpportunity(enemyCategory, distance, entity.vx, entity.vy, enemyHealthRatio, enemyScoreNorm, bulletPressure, dx, dy);
    const double relevance = 0.45 * threat + 0.35 * opportunity + 0.10 * (1.0 - clip01(distance / gridRadius)) + 0.10 * enemyScoreNorm;
    if (!enemies[static_cast<std::size_t>(offset)].present || relevance > enemies[static_cast<std::size_t>(offset)].rank) {
      enemies[static_cast<std::size_t>(offset)] = EnemyCandidate{
          true,
          relevance,
          threat,
          opportunity,
          enemyHealthRatio,
          clipSigned(entity.vx - self->vx, CombatVelocityNorm),
          clipSigned(entity.vy - self->vy, CombatVelocityNorm),
          enemyCategory,
      };
    }
  }

  for (int row = 0; row < rows; ++row) {
    for (int col = 0; col < cols; ++col) {
      const int offset = cellOffset(row, col);
      const auto& farmable = farmables[static_cast<std::size_t>(offset)];
      if (farmable.present) {
        buffer[indexFor(CombatChannelFarmablePresence, row, col)] = 1.0f;
        buffer[indexFor(CombatChannelFarmableValue, row, col)] = static_cast<float>(farmable.value);
      }
      const auto& projectile = projectiles[static_cast<std::size_t>(offset)];
      if (projectile.present) {
        buffer[indexFor(CombatChannelProjectilePresence, row, col)] = 1.0f;
        buffer[indexFor(CombatChannelProjectileVelocityX, row, col)] = static_cast<float>(projectile.velocityX);
        buffer[indexFor(CombatChannelProjectileVelocityY, row, col)] = static_cast<float>(projectile.velocityY);
      }
      const auto& enemy = enemies[static_cast<std::size_t>(offset)];
      if (!enemy.present) continue;
      buffer[indexFor(CombatChannelEnemyPresence, row, col)] = 1.0f;
      buffer[indexFor(CombatChannelEnemyThreat, row, col)] = static_cast<float>(enemy.threat);
      buffer[indexFor(CombatChannelEnemyOpportunity, row, col)] = static_cast<float>(enemy.opportunity);
      buffer[indexFor(CombatChannelEnemyHealthRatio, row, col)] = static_cast<float>(enemy.healthRatio);
      buffer[indexFor(CombatChannelEnemyVelocityX, row, col)] = static_cast<float>(enemy.velocityX);
      buffer[indexFor(CombatChannelEnemyVelocityY, row, col)] = static_cast<float>(enemy.velocityY);
      switch (enemy.category) {
        case TankCategoryBalanced: buffer[indexFor(CombatChannelEnemyTypeBalanced, row, col)] = 1.0f; break;
        case TankCategorySniper: buffer[indexFor(CombatChannelEnemyTypeSniper, row, col)] = 1.0f; break;
        case TankCategorySpammer: buffer[indexFor(CombatChannelEnemyTypeSpammer, row, col)] = 1.0f; break;
        case TankCategoryRammer: buffer[indexFor(CombatChannelEnemyTypeRammer, row, col)] = 1.0f; break;
        case TankCategoryAreaControl: buffer[indexFor(CombatChannelEnemyTypeAreaControl, row, col)] = 1.0f; break;
        default: buffer[indexFor(CombatChannelEnemyTypeUnknown, row, col)] = 1.0f; break;
      }
    }
  }

  return required;
}

int Simulation::writeCombatGrids(float* buffer, int bufferLen) const {
  const int perAgent = combatGridFloatCount();
  const int required = perAgent * static_cast<int>(possibleAgentIds_.size());
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) {
    const int offset = static_cast<int>(i) * perAgent;
    const int result = writeCombatGrid(possibleAgentIds_[i], buffer + offset, perAgent);
    if (result < 0) return result;
  }
  return required;
}

int Simulation::combatSelfFloatCount() const { return combatObservationSpec_.selfFields; }

int Simulation::writeCombatSelf(int agentId, float* buffer, int bufferLen) const {
  const int required = combatSelfFloatCount();
  const int slot = possibleAgentSlotForId(agentId);
  if (slot < 0) return -1;
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);

  const Entity* agent = findEntity(agentId);
  const bool alive = agent && agent->kind == "agent";
  const double vx = alive ? agent->vx : 0.0;
  const double vy = alive ? agent->vy : 0.0;
  const double health = alive ? agent->health : 0.0;
  const double score = alive ? agent->score : 0.0;
  const double level = alive ? static_cast<double>(levelFor(*agent)) : 0.0;
  const double currentTank = alive ? static_cast<double>(agent->currentTankId) : 0.0;
  const DerivedCombatStats derived = alive ? derivedCombatStatsFor(agent->currentTankId, agent->statLevels) : DerivedCombatStats{};
  const double timeAlive = alive ? static_cast<double>(std::max(0, tick_ - agent->spawnTick)) : 0.0;

  buffer[0] = static_cast<float>(alive && derived.maxHealth > 0.0 ? clip01(health / derived.maxHealth) : 0.0);
  buffer[1] = static_cast<float>(clip01(level / CombatLevelNorm));
  buffer[2] = static_cast<float>(xpProgressToNextLevel(score, static_cast<int>(level)));
  buffer[3] = static_cast<float>(normalizedScore(score));
  buffer[4] = static_cast<float>(clip01(timeAlive / std::max(1, config_.maxTicks)));
  buffer[5] = static_cast<float>(clipSigned(vx, kMaxDerivedStats.movementSpeed * CombatVelocityNorm));
  buffer[6] = static_cast<float>(clipSigned(vy, kMaxDerivedStats.movementSpeed * CombatVelocityNorm));
  buffer[7] = static_cast<float>(alive ? clip01(static_cast<double>(agent->cooldown) / std::max(1.0, derived.reloadTime)) : 0.0);
  buffer[8] = static_cast<float>(alive ? clip01(derived.movementSpeed / kMaxDerivedStats.movementSpeed) : 0.0);
  buffer[9] = static_cast<float>(clip01(upgradeTierForTankId(static_cast<int>(currentTank)) / CombatMaxUpgradeTier));

  for (int statIndex = 0; statIndex < HeadlessStatCount; ++statIndex) {
    const double statLevel = alive ? static_cast<double>(agent->statLevels[static_cast<std::size_t>(statIndex)]) : 0.0;
    buffer[10 + statIndex] = static_cast<float>(clip01(statLevel / CombatStatNorm));
  }

  buffer[18] = static_cast<float>(alive ? clip01(derived.maxHealth / kMaxDerivedStats.maxHealth) : 0.0);
  buffer[19] = static_cast<float>(alive ? clip01(derived.bulletDamage / kMaxDerivedStats.bulletDamage) : 0.0);
  buffer[20] = static_cast<float>(alive ? clip01(derived.bulletSpeed / kMaxDerivedStats.bulletSpeed) : 0.0);
  buffer[21] = static_cast<float>(alive ? clip01(derived.bulletRange / kMaxDerivedStats.bulletRange) : 0.0);
  buffer[22] = static_cast<float>(alive ? clip01(derived.reloadTime / kMaxDerivedStats.reloadTime) : 0.0);
  buffer[23] = static_cast<float>(alive ? clip01(derived.movementSpeed / kMaxDerivedStats.movementSpeed) : 0.0);
  buffer[24] = static_cast<float>(alive && derived.maxHealth > 0.0 ? clip01(agent->recentDamageTaken / derived.maxHealth) : 0.0);
  buffer[25] = static_cast<float>(alive ? std::max(-1.0, std::min(1.0, agent->recentDamageDirectionX)) : 0.0);
  buffer[26] = static_cast<float>(alive ? std::max(-1.0, std::min(1.0, agent->recentDamageDirectionY)) : 0.0);
  return required;
}

int Simulation::writeCombatSelves(float* buffer, int bufferLen) const {
  const int perAgent = combatSelfFloatCount();
  const int required = perAgent * static_cast<int>(possibleAgentIds_.size());
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) {
    const int offset = static_cast<int>(i) * perAgent;
    const int result = writeCombatSelf(possibleAgentIds_[i], buffer + offset, perAgent);
    if (result < 0) return result;
  }
  return required;
}

int Simulation::combatPrevActionFloatCount() const { return combatObservationSpec_.prevActionFields; }

int Simulation::writeCombatPrevAction(int agentId, float* buffer, int bufferLen) const {
  const int required = combatPrevActionFloatCount();
  const int slot = possibleAgentSlotForId(agentId);
  if (slot < 0) return -1;
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  if (static_cast<std::size_t>(slot) >= combatPrevActions_.size()) return required;
  const auto& action = combatPrevActions_[static_cast<std::size_t>(slot)];
  std::copy(action.begin(), action.end(), buffer);
  return required;
}

int Simulation::writeCombatPrevActions(float* buffer, int bufferLen) const {
  const int perAgent = combatPrevActionFloatCount();
  const int required = perAgent * static_cast<int>(possibleAgentIds_.size());
  if (!buffer || bufferLen < required) return required;
  std::fill(buffer, buffer + bufferLen, 0.0f);
  for (std::size_t i = 0; i < possibleAgentIds_.size(); ++i) {
    const int offset = static_cast<int>(i) * perAgent;
    const int result = writeCombatPrevAction(possibleAgentIds_[i], buffer + offset, perAgent);
    if (result < 0) return result;
  }
  return required;
}

int Simulation::episodeStatsFieldCount() const { return EpisodeStatsFieldCount; }

int Simulation::writeEpisodeStats(double* buffer, int bufferLen) const {
  const int perAgent = episodeStatsFieldCount();
  const int required = perAgent * static_cast<int>(episodeStats_.size());
  if (!buffer || bufferLen < required) return required;
  for (std::size_t i = 0; i < episodeStats_.size(); ++i) {
    const auto& stats = episodeStats_[i];
    const int offset = static_cast<int>(i) * perAgent;
    buffer[offset + 0] = static_cast<double>(stats.lifetimeSteps);
    buffer[offset + 1] = stats.scoreTotal;
    buffer[offset + 2] = stats.scoreFromFarming;
    buffer[offset + 3] = stats.scoreFromPvp;
    buffer[offset + 4] = stats.damageDealt;
    buffer[offset + 5] = stats.damageTaken;
    buffer[offset + 6] = static_cast<double>(stats.shotsFired);
    buffer[offset + 7] = static_cast<double>(stats.shotsHit);
    buffer[offset + 8] = static_cast<double>(stats.kills);
    buffer[offset + 9] = static_cast<double>(stats.deathCount);
    buffer[offset + 10] = static_cast<double>(static_cast<int>(stats.deathCause));
    buffer[offset + 11] = static_cast<double>(stats.levelReached);
    buffer[offset + 12] = static_cast<double>(stats.tankClass);
    buffer[offset + 13] = stats.upgradeChoices;
  }
  return required;
}

int Simulation::tick() const { return tick_; }
int Simulation::activeEntityCount() const { return static_cast<int>(entities_.size()); }
const Config& Simulation::config() const { return config_; }
const CombatObservationSpec& Simulation::combatObservationSpec() const { return combatObservationSpec_; }

} // namespace diepcustom::headless
