#include "diepcustom/gameplay.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace diepcustom::gameplay {
namespace {
constexpr int ColorTank = 2;
constexpr int ColorEnemySquare = 8;

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
  if (s == "-0") return "0";
  return s;
}

std::string intArrayJson(const std::vector<int>& values) {
  std::ostringstream out;
  out << '[';
  for (std::size_t i = 0; i < values.size(); ++i) {
    if (i) out << ',';
    out << values[i];
  }
  out << ']';
  return out.str();
}

struct Arena {
  double leftX = -1000;
  double rightX = 1000;
  double topY = -1000;
  double bottomY = 1000;
  double padding = 200;
};

struct Body {
  int id = 0;
  int hash = 1;
  int preservedHash = 1;
  std::string fixtureName;
  int entityState = 1;
  double x = 0;
  double y = 0;
  double angle = 0;
  int positionFlags = 0;
  int sides = 1;
  double size = 30;
  double width = 30;
  double pushFactor = 8;
  double absorbtionFactor = 1;
  int physicsFlags = 0;
  double health = 1;
  double maxHealth = 1;
  int healthFlags = 0;
  double damagePerTick = 1;
  double damageReduction = 1;
  double minDamageMultiplier = 1;
  double maxDamageMultiplier = 4;
  int lastDamageTick = -1;
  int lastDamageAnimationTick = -1;
  int styleColor = 0;
  double opacity = 1;
  int styleFlags = 1;
  double vx = 0;
  double vy = 0;
  double velocityMagnitude = 0;
  double velocityAngle = 0;
  bool deleting = false;
  int deletionFrame = 5;
};

void refreshVelocity(Body& b) {
  b.velocityMagnitude = std::sqrt(b.vx*b.vx + b.vy*b.vy);
  b.velocityAngle = b.velocityMagnitude == 0 ? 0 : std::atan2(b.vy, b.vx);
}

void addVelocity(Body& b, double angle, double magnitude) {
  b.vx += std::cos(angle) * magnitude;
  b.vy += std::sin(angle) * magnitude;
  refreshVelocity(b);
}

void setVelocity(Body& b, double angle, double magnitude) {
  b.vx = std::cos(angle) * magnitude;
  b.vy = std::sin(angle) * magnitude;
  refreshVelocity(b);
}

void scale(Body& b, double value) {
  b.size *= value;
  b.width *= value;
}

void deletionTick(Body& b) {
  if (!b.deleting) return;
  if (b.deletionFrame == 5) b.opacity = 1 - (1.0 / 6.0);
  scale(b, 1.1);
  b.opacity -= 1.0 / 6.0;
  if (b.opacity < 0) b.opacity = 0;
  b.deletionFrame -= 1;
}

void destroy(Body& b) {
  b.health = 0;
  if (!b.deleting) b.deleting = true;
}

void keepInArena(Body& b, const Arena& arena) {
  if (b.x < arena.leftX - arena.padding) b.x = arena.leftX - arena.padding;
  else if (b.x > arena.rightX + arena.padding) b.x = arena.rightX + arena.padding;
  if (b.y < arena.topY - arena.padding) b.y = arena.topY - arena.padding;
  else if (b.y > arena.bottomY + arena.padding) b.y = arena.bottomY + arena.padding;
}

void applyPhysics(Body& b) {
  if (b.velocityMagnitude < 0.01) setVelocity(b, b.velocityAngle, 0);
  else if (b.deleting) setVelocity(b, b.velocityAngle, b.velocityMagnitude / 2.0);
  b.x += b.vx;
  b.y += b.vy;
  addVelocity(b, b.velocityAngle, b.velocityMagnitude * -0.1);
  if (b.health <= 0) destroy(b);
}

bool isColliding(const Body& a, const Body& b) {
  double dx = a.x - b.x;
  double dy = a.y - b.y;
  double r = a.size + b.size;
  return dx*dx + dy*dy <= r*r;
}

void receiveKnockback(Body& self, const Body& other) {
  double kbMagnitude = self.absorbtionFactor * other.pushFactor;
  double diffY = self.y - other.y;
  double diffX = self.x - other.x;
  double kbAngle = std::atan2(diffY, diffX);
  addVelocity(self, kbAngle, kbMagnitude);
}

void receiveDamage(Body& self, const Body&, double amount, int tick) {
  if (self.health <= 0.0001) { self.health = 0; return; }
  if (self.lastDamageAnimationTick != tick) {
    self.styleFlags ^= 2;
    self.lastDamageAnimationTick = tick;
  }
  self.lastDamageTick = tick;
  self.health -= amount;
  if (self.health <= 0.0001) self.health = 0;
}

void handleDamage(Body& a, Body& b, int tick) {
  if (a.health <= 0 || b.health <= 0) return;
  double common = std::max(b.minDamageMultiplier, a.minDamageMultiplier);
  common *= std::min(b.maxDamageMultiplier, a.maxDamageMultiplier);
  const double dF1 = (a.damagePerTick * common) * b.damageReduction;
  const double dF2 = (b.damagePerTick * common) * a.damageReduction;
  const double ratio = std::max(1 - a.health / dF2, 1 - b.health / dF1);
  const double damage1to2 = dF1 * std::min(1.0, 1 - ratio);
  const double damage2to1 = dF2 * std::min(1.0, 1 - ratio);
  receiveDamage(a, b, damage2to1, tick);
  receiveDamage(b, a, damage1to2, tick);
}

void tickBody(Body& b, const Arena& arena) {
  deletionTick(b);
  keepInArena(b, arena);
}

void tickHeadless(std::vector<Body>& bodies, const Arena& arena, int tick) {
  if (bodies.size() >= 2 && isColliding(bodies[0], bodies[1])) {
    receiveKnockback(bodies[0], bodies[1]);
    receiveKnockback(bodies[1], bodies[0]);
    handleDamage(bodies[0], bodies[1], tick);
  }
  for (auto& body : bodies) {
    applyPhysics(body);
    tickBody(body, arena);
  }
  for (auto& body : bodies) body.entityState = 0;
}

std::string refJson(const Body& b) {
  return "{\"id\":" + std::to_string(b.id) + ",\"hash\":" + std::to_string(b.hash) + "}";
}

std::string bodyJson(const Body& b) {
  std::ostringstream out;
  out << "{\"id\":" << b.id << ",\"hash\":" << b.hash << ",\"preservedHash\":" << b.preservedHash
      << ",\"className\":\"LivingEntity\",\"fixtureName\":" << q(b.fixtureName)
      << ",\"exists\":true,\"entityState\":" << b.entityState
      << ",\"relations\":{\"parent\":null,\"owner\":null,\"team\":null}"
      << ",\"position\":{\"x\":" << num(b.x) << ",\"y\":" << num(b.y) << ",\"angle\":" << num(b.angle) << ",\"flags\":" << b.positionFlags << "}"
      << ",\"physics\":{\"sides\":" << b.sides << ",\"size\":" << num(b.size) << ",\"width\":" << num(b.width)
      << ",\"pushFactor\":" << num(b.pushFactor) << ",\"absorbtionFactor\":" << num(b.absorbtionFactor) << ",\"flags\":" << b.physicsFlags << "}"
      << ",\"health\":{\"health\":" << num(b.health) << ",\"maxHealth\":" << num(b.maxHealth) << ",\"flags\":" << b.healthFlags << "}"
      << ",\"damage\":{\"damagePerTick\":" << num(b.damagePerTick) << ",\"damageReduction\":" << num(b.damageReduction)
      << ",\"minDamageMultiplier\":" << num(b.minDamageMultiplier) << ",\"maxDamageMultiplier\":" << num(b.maxDamageMultiplier)
      << ",\"lastDamageTick\":" << b.lastDamageTick << "}"
      << ",\"style\":{\"color\":" << b.styleColor << ",\"opacity\":" << num(b.opacity) << ",\"flags\":" << b.styleFlags << "}"
      << ",\"velocity\":{\"x\":" << num(b.vx) << ",\"y\":" << num(b.vy) << ",\"magnitude\":" << num(b.velocityMagnitude)
      << ",\"angle\":" << num(b.velocityAngle) << "}}";
  return out.str();
}

std::string snapshotJson(const std::vector<Body>& bodies, const Arena& arena, const std::string& label, int tick) {
  std::vector<int> ids;
  std::vector<int> hashes;
  for (const auto& body : bodies) { ids.push_back(body.id); hashes.push_back(body.hash); }
  std::ostringstream out;
  out << "{\"label\":" << q(label) << ",\"tick\":" << tick
      << ",\"manager\":{\"lastId\":1,\"activeIds\":" << intArrayJson(ids)
      << ",\"cameras\":[],\"otherEntities\":[],\"globalEntities\":[],\"hashTable\":" << intArrayJson(hashes) << "}"
      << ",\"arena\":{\"id\":null,\"state\":\"headless-fixture\",\"bounds\":{\"leftX\":" << num(arena.leftX)
      << ",\"rightX\":" << num(arena.rightX) << ",\"topY\":" << num(arena.topY) << ",\"bottomY\":" << num(arena.bottomY) << "}}"
      << ",\"entities\":[";
  for (std::size_t i = 0; i < bodies.size(); ++i) {
    if (i) out << ',';
    out << bodyJson(bodies[i]);
  }
  out << "]}";
  return out.str();
}

std::string damageScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body attacker;
  attacker.id = 0; attacker.hash = attacker.preservedHash = 1; attacker.fixtureName = "attacker"; attacker.x = 0; attacker.y = 0;
  attacker.health = attacker.maxHealth = 50; attacker.damagePerTick = 3; attacker.size = attacker.width = 30; attacker.styleColor = ColorTank;
  Body defender;
  defender.id = 1; defender.hash = defender.preservedHash = 1; defender.fixtureName = "defender"; defender.x = 35; defender.y = 0;
  defender.health = defender.maxHealth = 20; defender.damagePerTick = 1; defender.size = defender.width = 30; defender.styleColor = ColorEnemySquare;
  bodies.push_back(attacker); bodies.push_back(defender);

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  tickHeadless(bodies, arena, 1);
  snapshots.push_back(snapshotJson(bodies, arena, "after-1-damage-tick", 1));
  tickHeadless(bodies, arena, 2);
  snapshots.push_back(snapshotJson(bodies, arena, "after-2-damage-ticks", 2));

  std::ostringstream out;
  out << "{\"scenario\":\"overlapping-living-entities-damage\",\"invariant\":\"Two overlapping living entities with different damage values exchange deterministic collision damage during headless manager ticks.\""
      << ",\"participants\":{\"attacker\":" << refJson(bodies[0]) << ",\"defender\":" << refJson(bodies[1]) << "}"
      << ",\"damageEvidence\":{\"attackerInitialHealth\":50,\"attackerFinalHealth\":" << num(bodies[0].health)
      << ",\"defenderInitialHealth\":20,\"defenderFinalHealth\":" << num(bodies[1].health) << "}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}
} // namespace

std::string gameplayReportJson() {
  return std::string("{\"phase\":\"D-gameplay\",\"scope\":\"minimal-headless-tick-parity\",\"nonGoals\":[") +
    "\"browser-client-ui-testing\",\"per-agent-rl-observation-grids\",\"cpp-gameplay-implementation\",\"full-live-websocket-gameplay-parity\",\"broad-every-tank-projectile-upgrade-coverage\"]," +
    "\"scenarios\":[" + damageScenarioJson() + "]}";
}

} // namespace diepcustom::gameplay
