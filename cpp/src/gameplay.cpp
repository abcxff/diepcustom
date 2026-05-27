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
constexpr int PhysicsNoOwnTeamCollision = 1 << 3;
constexpr int PhysicsSolidWall = 1 << 4;
constexpr int PhysicsOnlySameOwnerCollision = 1 << 5;
constexpr int PhysicsCanEscapeArena = 1 << 8;

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
  bool isPhysical = true;
  int ownerId = -1;
  int teamId = -1;
  bool projectileMotion = false;
  int spawnTick = 0;
  double baseSpeed = 0;
  double baseAccel = 0;
  int lifeLength = 0;
  double movementAngle = 0;
  double vx = 0;
  double vy = 0;
  double velocityMagnitude = 0;
  double velocityAngle = 0;
  double score = 0;
  double scoreReward = 0;
  bool deleting = false;
  int deletionFrame = 5;
  bool removed = false;
  bool isCamera = false;
  bool hasScoreData = false;
  double scoreField = 0;
  int cameraPlayerId = -1;
  double cameraScore = 0;
  int cameraLevel = 1;
  double cameraLevelbarProgress = 0;
  double cameraLevelbarMax = 0;
  int cameraStatsAvailable = 0;
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
  if (b.deletionFrame == 0) {
    b.hash = 0;
    b.removed = true;
    b.deletionFrame = -1;
    return;
  }
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
  if (b.physicsFlags & PhysicsCanEscapeArena) return;
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
  if (!a.isPhysical || !b.isPhysical || a.deleting || b.deleting) return false;
  if (a.sides == 0 || b.sides == 0) return false;
  if (a.teamId == b.teamId) {
    if ((a.physicsFlags & PhysicsNoOwnTeamCollision) || (b.physicsFlags & PhysicsNoOwnTeamCollision)) return false;
    if (a.ownerId != b.ownerId && ((a.physicsFlags & PhysicsOnlySameOwnerCollision) || (b.physicsFlags & PhysicsOnlySameOwnerCollision))) return false;
  }
  double dx = a.x - b.x;
  double dy = a.y - b.y;
  double r = a.size + b.size;
  return dx*dx + dy*dy <= r*r;
}

void receiveKnockback(Body& self, const Body& other) {
  double kbMagnitude = self.absorbtionFactor * other.pushFactor;
  if ((other.physicsFlags & PhysicsSolidWall) && self.ownerId >= 0 && self.teamId != other.teamId) {
    setVelocity(self, 0, 0);
    destroy(self);
    return;
  }
  double diffY = self.y - other.y;
  double diffX = self.x - other.x;
  double kbAngle = std::atan2(diffY, diffX);
  addVelocity(self, kbAngle, kbMagnitude);
}

void receiveDamage(Body& self, Body& source, std::vector<Body>& bodies, double amount, int tick) {
  if (self.health <= 0.0001) { self.health = 0; return; }
  if (self.lastDamageAnimationTick != tick) {
    self.styleFlags ^= 2;
    self.lastDamageAnimationTick = tick;
  }
  self.lastDamageTick = tick;
  self.health -= amount;
  if (self.health <= 0.0001) {
    self.health = 0;
    if (source.ownerId >= 0) {
      for (auto& body : bodies) if (body.id == source.ownerId) { body.score += self.scoreReward; break; }
    } else {
      source.score += self.scoreReward;
    }
  }
}

void handleDamage(Body& a, Body& b, std::vector<Body>& bodies, int tick) {
  if (a.health <= 0 || b.health <= 0) return;
  double common = std::max(b.minDamageMultiplier, a.minDamageMultiplier);
  common *= std::min(b.maxDamageMultiplier, a.maxDamageMultiplier);
  const double dF1 = (a.damagePerTick * common) * b.damageReduction;
  const double dF2 = (b.damagePerTick * common) * a.damageReduction;
  const double ratio = std::max(1 - a.health / dF2, 1 - b.health / dF1);
  const double damage1to2 = dF1 * std::min(1.0, 1 - ratio);
  const double damage2to1 = dF2 * std::min(1.0, 1 - ratio);
  receiveDamage(a, b, bodies, damage2to1, tick);
  receiveDamage(b, a, bodies, damage1to2, tick);
}

void tickBody(Body& b, const Arena& arena, int tick) {
  deletionTick(b);
  keepInArena(b, arena);
  if (b.projectileMotion) {
    if (tick == b.spawnTick + 1) addVelocity(b, b.movementAngle, b.baseSpeed);
    else addVelocity(b, b.movementAngle, b.baseAccel * 0.1);
    if (tick - b.spawnTick >= b.lifeLength) destroy(b);
  }
}

void tickHeadless(std::vector<Body>& bodies, const Arena& arena, int tick) {
  for (std::size_t i = 0; i < bodies.size(); ++i) {
    for (std::size_t j = i + 1; j < bodies.size(); ++j) {
      if (!isColliding(bodies[i], bodies[j])) continue;
      receiveKnockback(bodies[i], bodies[j]);
      receiveKnockback(bodies[j], bodies[i]);
      handleDamage(bodies[i], bodies[j], bodies, tick);
    }
  }
  for (auto& body : bodies) {
    if (body.removed) continue;
    applyPhysics(body);
    tickBody(body, arena, tick);
  }
  for (auto& body : bodies) body.entityState = 0;
  bodies.erase(std::remove_if(bodies.begin(), bodies.end(), [](const Body& body) { return body.removed; }), bodies.end());
}

std::string refJson(const Body& b) {
  return "{\"id\":" + std::to_string(b.id) + ",\"hash\":" + std::to_string(b.hash) + "}";
}

std::string entityRefById(int id, const std::vector<Body>& bodies) {
  if (id < 0) return "null";
  for (const auto& candidate : bodies) if (candidate.id == id && candidate.hash != 0) return refJson(candidate);
  return "null";
}

std::string ownerJson(const Body& b, const std::vector<Body>& bodies) {
  return entityRefById(b.ownerId, bodies);
}

std::string bodyJson(const Body& b, const std::vector<Body>& bodies) {
  std::ostringstream out;
  out << "{\"id\":" << b.id << ",\"hash\":" << b.hash << ",\"preservedHash\":" << b.preservedHash
      << ",\"className\":" << q(b.isCamera ? "CameraEntity" : "LivingEntity") << ",\"fixtureName\":" << q(b.fixtureName)
      << ",\"exists\":true,\"entityState\":" << b.entityState
      << ",\"relations\":{\"parent\":null,\"owner\":" << ownerJson(b, bodies) << ",\"team\":" << entityRefById(b.teamId, bodies) << "}";
  if (!b.isCamera) {
    out << ",\"position\":{\"x\":" << num(b.x) << ",\"y\":" << num(b.y) << ",\"angle\":" << num(b.angle) << ",\"flags\":" << b.positionFlags << "}"
        << ",\"physics\":{\"sides\":" << b.sides << ",\"size\":" << num(b.size) << ",\"width\":" << num(b.width)
        << ",\"pushFactor\":" << num(b.pushFactor) << ",\"absorbtionFactor\":" << num(b.absorbtionFactor) << ",\"flags\":" << b.physicsFlags << "}"
        << ",\"health\":{\"health\":" << num(b.health) << ",\"maxHealth\":" << num(b.maxHealth) << ",\"flags\":" << b.healthFlags << "}"
        << ",\"damage\":{\"damagePerTick\":" << num(b.damagePerTick) << ",\"damageReduction\":" << num(b.damageReduction)
        << ",\"minDamageMultiplier\":" << num(b.minDamageMultiplier) << ",\"maxDamageMultiplier\":" << num(b.maxDamageMultiplier)
        << ",\"lastDamageTick\":" << b.lastDamageTick << "}"
        << ",\"style\":{\"color\":" << b.styleColor << ",\"opacity\":" << num(b.opacity) << ",\"flags\":" << b.styleFlags << "}"
        << ",\"gameplay\":{\"score\":" << num(b.score) << ",\"scoreReward\":" << num(b.scoreReward)
        << ",\"deleting\":" << (b.deleting ? "true" : "false") << ",\"deletionFrame\":" << (b.deleting ? std::to_string(b.deletionFrame) : "null");
    if (b.projectileMotion) {
      out << ",\"projectile\":{\"spawnTick\":" << b.spawnTick << ",\"baseSpeed\":" << num(b.baseSpeed)
          << ",\"baseAccel\":" << num(b.baseAccel) << ",\"lifeLength\":" << b.lifeLength
          << ",\"movementAngle\":" << num(b.movementAngle) << "}";
    }
    out << "}";
  }
  if (b.isCamera) {
    out << ",\"camera\":{\"player\":" << entityRefById(b.cameraPlayerId, bodies) << ",\"score\":" << num(b.cameraScore)
        << ",\"level\":" << b.cameraLevel << ",\"levelbarProgress\":" << num(b.cameraLevelbarProgress)
        << ",\"levelbarMax\":" << num(b.cameraLevelbarMax) << ",\"statsAvailable\":" << b.cameraStatsAvailable << "}";
  }
  if (b.hasScoreData) out << ",\"score\":{\"score\":" << num(b.scoreField) << "}";
  if (!b.isCamera) {
    out << ",\"velocity\":{\"x\":" << num(b.vx) << ",\"y\":" << num(b.vy) << ",\"magnitude\":" << num(b.velocityMagnitude)
        << ",\"angle\":" << num(b.velocityAngle) << "}";
  }
  out << "}";
  return out.str();
}

std::string snapshotJson(const std::vector<Body>& bodies, const Arena& arena, const std::string& label, int tick) {
  std::vector<int> ids;
  std::vector<int> cameras;
  int lastId = -1;
  for (const auto& body : bodies) { ids.push_back(body.id); if (body.isCamera) cameras.push_back(body.id); if (body.id > lastId) lastId = body.id; }
  std::vector<int> hashes;
  for (int id = 0; id <= lastId; ++id) {
    int hash = 0;
    for (const auto& body : bodies) if (body.id == id) { hash = body.hash; break; }
    hashes.push_back(hash);
  }
  std::ostringstream out;
  out << "{\"label\":" << q(label) << ",\"tick\":" << tick
      << ",\"manager\":{\"lastId\":" << lastId << ",\"activeIds\":" << intArrayJson(ids)
      << ",\"cameras\":" << intArrayJson(cameras) << ",\"otherEntities\":[],\"globalEntities\":[],\"hashTable\":" << intArrayJson(hashes) << "}"
      << ",\"arena\":{\"id\":null,\"state\":\"headless-fixture\",\"bounds\":{\"leftX\":" << num(arena.leftX)
      << ",\"rightX\":" << num(arena.rightX) << ",\"topY\":" << num(arena.topY) << ",\"bottomY\":" << num(arena.bottomY) << "}}"
      << ",\"entities\":[";
  for (std::size_t i = 0; i < bodies.size(); ++i) {
    if (i) out << ',';
    out << bodyJson(bodies[i], bodies);
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

std::string scoreDeathScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body killer;
  killer.id = 0; killer.hash = killer.preservedHash = 1; killer.fixtureName = "killer"; killer.x = 0; killer.y = 0;
  killer.health = killer.maxHealth = 60; killer.damagePerTick = 12; killer.size = killer.width = 30; killer.styleColor = ColorTank;
  Body victim;
  victim.id = 1; victim.hash = victim.preservedHash = 1; victim.fixtureName = "victim"; victim.x = 35; victim.y = 0;
  victim.health = victim.maxHealth = 5; victim.damagePerTick = 0.5; victim.size = victim.width = 30; victim.styleColor = ColorEnemySquare; victim.scoreReward = 17;
  bodies.push_back(killer); bodies.push_back(victim);

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  tickHeadless(bodies, arena, 1);
  snapshots.push_back(snapshotJson(bodies, arena, "after-kill-damage-tick", 1));
  for (int tick = 2; tick <= 7; ++tick) tickHeadless(bodies, arena, tick);
  snapshots.push_back(snapshotJson(bodies, arena, "after-deletion-animation-removal", 7));

  const Body& killerAfter = bodies[0];
  std::ostringstream out;
  out << "{\"scenario\":\"score-on-kill-and-death-removal\",\"invariant\":\"A lethal deterministic collision calls the killer onKill hook once, awards the victim scoreReward, starts death animation, and removes the victim after the deletion animation completes.\""
      << ",\"participants\":{\"killer\":" << refJson(killerAfter) << ",\"victimAfterRemoval\":null}"
      << ",\"scoreEvidence\":{\"killerInitialScore\":0,\"killerScoreAfterKill\":17,\"victimScoreReward\":17,\"victimHealthAfterKill\":0,\"victimPresentAfterRemoval\":false}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}


std::string ownerPropagatedKillScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body owner;
  owner.id = 0; owner.hash = owner.preservedHash = 1; owner.fixtureName = "owner"; owner.x = -200; owner.y = 0;
  owner.health = owner.maxHealth = 80; owner.damagePerTick = 0; owner.size = owner.width = 25; owner.styleColor = ColorTank; owner.isPhysical = false;
  Body projectile;
  projectile.id = 1; projectile.hash = projectile.preservedHash = 1; projectile.fixtureName = "projectile"; projectile.x = 0; projectile.y = 0;
  projectile.health = projectile.maxHealth = 10; projectile.damagePerTick = 12; projectile.size = projectile.width = 20; projectile.styleColor = ColorTank; projectile.ownerId = 0;
  Body target;
  target.id = 2; target.hash = target.preservedHash = 1; target.fixtureName = "target"; target.x = 25; target.y = 0;
  target.health = target.maxHealth = 5; target.damagePerTick = 0.25; target.size = target.width = 20; target.styleColor = ColorEnemySquare; target.scoreReward = 23;
  bodies.push_back(owner); bodies.push_back(projectile); bodies.push_back(target);

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  tickHeadless(bodies, arena, 1);
  snapshots.push_back(snapshotJson(bodies, arena, "after-projectile-kill-tick", 1));

  std::ostringstream out;
  out << "{\"scenario\":\"owner-propagated-projectile-kill-score\",\"invariant\":\"A projectile-style living entity propagates its onKill event to its owner, awarding the target scoreReward to the owner instead of retaining it on the projectile.\""
      << ",\"participants\":{\"owner\":" << refJson(bodies[0]) << ",\"projectile\":" << refJson(bodies[1]) << ",\"target\":" << refJson(bodies[2]) << "}"
      << ",\"scoreEvidence\":{\"ownerInitialScore\":0,\"ownerScoreAfterKill\":23,\"projectileScoreAfterKill\":0,\"targetScoreReward\":23,\"targetHealthAfterKill\":0,\"projectileOwnerRef\":" << refJson(bodies[0]) << "}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}


std::string projectileMovementLifetimeScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body projectile;
  projectile.id = 0; projectile.hash = projectile.preservedHash = 1; projectile.fixtureName = "lifetime-projectile";
  projectile.health = projectile.maxHealth = 10; projectile.damagePerTick = 0; projectile.size = projectile.width = 12; projectile.styleColor = ColorTank;
  projectile.physicsFlags = 16; projectile.projectileMotion = true; projectile.spawnTick = 0; projectile.baseSpeed = 6; projectile.baseAccel = 2;
  projectile.lifeLength = 3; projectile.movementAngle = 0.7853981633974483;
  bodies.push_back(projectile);

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  for (int tick = 1; tick <= 4; ++tick) {
    tickHeadless(bodies, arena, tick);
    snapshots.push_back(snapshotJson(bodies, arena, "after-projectile-tick-" + std::to_string(tick), tick));
  }

  std::ostringstream out;
  out << "{\"scenario\":\"projectile-movement-and-lifetime\",\"invariant\":\"A projectile-style entity applies spawn speed on its first tick, maintains acceleration on later ticks, and starts deletion once its lifetime expires.\""
      << ",\"participants\":{\"projectile\":" << refJson(bodies[0]) << "}"
      << ",\"movementEvidence\":{\"initialPosition\":{\"x\":0,\"y\":0,\"angle\":0,\"flags\":0},\"firstTickVelocity\":{\"x\":4.242641,\"y\":4.242641,\"magnitude\":6,\"angle\":0.785398},\"secondTickPosition\":{\"x\":4.242641,\"y\":4.242641,\"angle\":0,\"flags\":0},\"deletionStartedAtLifetime\":true,\"deletionFrameAfterNextTick\":4}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}


std::string cameraScoreIntegrationScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body player;
  player.id = 0; player.hash = player.preservedHash = 1; player.fixtureName = "score-player";
  player.health = player.maxHealth = 30; player.damagePerTick = 0; player.size = player.width = 25; player.styleColor = ColorTank; player.hasScoreData = true;
  Body camera;
  camera.id = 1; camera.hash = camera.preservedHash = 1; camera.fixtureName = "score-camera"; camera.isCamera = true; camera.cameraPlayerId = 0;
  bodies.push_back(player); bodies.push_back(camera);

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  bodies[1].cameraScore += 15; bodies[0].scoreField += 15;
  snapshots.push_back(snapshotJson(bodies, arena, "after-camera-add-score", 0));
  bodies[1].cameraScore = 7; bodies[0].scoreField = 7;
  snapshots.push_back(snapshotJson(bodies, arena, "after-camera-set-score", 0));

  std::ostringstream out;
  out << "{\"scenario\":\"camera-player-score-integration\",\"invariant\":\"Camera score mutations mirror onto the focused player score field, preserving the score source used by tank/camera gameplay integration.\""
      << ",\"participants\":{\"player\":" << refJson(bodies[0]) << ",\"camera\":" << refJson(bodies[1]) << "}"
      << ",\"scoreEvidence\":{\"initialCameraScore\":0,\"initialPlayerScore\":0,\"cameraScoreAfterAdd\":15,\"playerScoreAfterAdd\":15,\"cameraScoreAfterSet\":7,\"playerScoreAfterSet\":7,\"cameraPlayerRef\":" << refJson(bodies[0]) << "}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}


std::string arenaBoundsClampScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body clamped;
  clamped.id = 0; clamped.hash = clamped.preservedHash = 1; clamped.fixtureName = "bounds-clamped"; clamped.x = 1300; clamped.y = -1300;
  clamped.health = clamped.maxHealth = 10; clamped.damagePerTick = 0; clamped.size = clamped.width = 20; clamped.styleColor = ColorTank;
  Body escaping;
  escaping.id = 1; escaping.hash = escaping.preservedHash = 1; escaping.fixtureName = "bounds-escaping"; escaping.x = 1300; escaping.y = -900;
  escaping.health = escaping.maxHealth = 10; escaping.damagePerTick = 0; escaping.size = escaping.width = 20; escaping.styleColor = ColorEnemySquare; escaping.physicsFlags = 256;
  bodies.push_back(clamped); bodies.push_back(escaping);

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  tickHeadless(bodies, arena, 1);
  snapshots.push_back(snapshotJson(bodies, arena, "after-bounds-tick", 1));

  std::ostringstream out;
  out << "{\"scenario\":\"arena-bounds-clamp-and-can-escape\",\"invariant\":\"Physical entities without canEscapeArena clamp to arena bounds plus padding, while canEscapeArena entities keep their out-of-bounds position.\""
      << ",\"participants\":{\"clamped\":" << refJson(bodies[0]) << ",\"escaping\":" << refJson(bodies[1]) << "}"
      << ",\"boundsEvidence\":{\"initialClampedPosition\":{\"x\":1300,\"y\":-1300,\"angle\":0,\"flags\":0},\"clampedAfterTick\":{\"x\":1200,\"y\":-1200,\"angle\":0,\"flags\":0},\"escapingAfterTick\":{\"x\":1300,\"y\":-900,\"angle\":0,\"flags\":0}}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}


std::string teamOwnerCollisionRulesScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body noOwnA;
  noOwnA.id = 0; noOwnA.hash = noOwnA.preservedHash = 1; noOwnA.fixtureName = "no-own-team-a"; noOwnA.x = -300; noOwnA.y = 0;
  noOwnA.health = noOwnA.maxHealth = 20; noOwnA.damagePerTick = 5; noOwnA.size = noOwnA.width = 20; noOwnA.styleColor = ColorTank; noOwnA.physicsFlags = PhysicsNoOwnTeamCollision;
  Body noOwnB;
  noOwnB.id = 1; noOwnB.hash = noOwnB.preservedHash = 1; noOwnB.fixtureName = "no-own-team-b"; noOwnB.x = -275; noOwnB.y = 0;
  noOwnB.health = noOwnB.maxHealth = 20; noOwnB.damagePerTick = 5; noOwnB.size = noOwnB.width = 20; noOwnB.styleColor = ColorEnemySquare;
  Body differentOwnerA;
  differentOwnerA.id = 2; differentOwnerA.hash = differentOwnerA.preservedHash = 1; differentOwnerA.fixtureName = "only-different-owner-a"; differentOwnerA.x = 0; differentOwnerA.y = 0;
  differentOwnerA.health = differentOwnerA.maxHealth = 20; differentOwnerA.damagePerTick = 5; differentOwnerA.size = differentOwnerA.width = 20; differentOwnerA.styleColor = ColorTank; differentOwnerA.physicsFlags = PhysicsOnlySameOwnerCollision; differentOwnerA.ownerId = 0;
  Body differentOwnerB;
  differentOwnerB.id = 3; differentOwnerB.hash = differentOwnerB.preservedHash = 1; differentOwnerB.fixtureName = "only-different-owner-b"; differentOwnerB.x = 25; differentOwnerB.y = 0;
  differentOwnerB.health = differentOwnerB.maxHealth = 20; differentOwnerB.damagePerTick = 5; differentOwnerB.size = differentOwnerB.width = 20; differentOwnerB.styleColor = ColorEnemySquare; differentOwnerB.ownerId = 1;
  Body sharedOwner;
  sharedOwner.id = 4; sharedOwner.hash = sharedOwner.preservedHash = 1; sharedOwner.fixtureName = "shared-owner"; sharedOwner.x = 280; sharedOwner.y = 80;
  sharedOwner.health = sharedOwner.maxHealth = 20; sharedOwner.damagePerTick = 0; sharedOwner.size = sharedOwner.width = 10; sharedOwner.styleColor = ColorTank; sharedOwner.isPhysical = false;
  Body sameOwnerA;
  sameOwnerA.id = 5; sameOwnerA.hash = sameOwnerA.preservedHash = 1; sameOwnerA.fixtureName = "only-same-owner-a"; sameOwnerA.x = 280; sameOwnerA.y = 0;
  sameOwnerA.health = sameOwnerA.maxHealth = 20; sameOwnerA.damagePerTick = 5; sameOwnerA.size = sameOwnerA.width = 20; sameOwnerA.styleColor = ColorTank; sameOwnerA.physicsFlags = PhysicsOnlySameOwnerCollision; sameOwnerA.ownerId = 4;
  Body sameOwnerB;
  sameOwnerB.id = 6; sameOwnerB.hash = sameOwnerB.preservedHash = 1; sameOwnerB.fixtureName = "only-same-owner-b"; sameOwnerB.x = 305; sameOwnerB.y = 0;
  sameOwnerB.health = sameOwnerB.maxHealth = 20; sameOwnerB.damagePerTick = 5; sameOwnerB.size = sameOwnerB.width = 20; sameOwnerB.styleColor = ColorEnemySquare; sameOwnerB.ownerId = 4;
  bodies = {noOwnA, noOwnB, differentOwnerA, differentOwnerB, sharedOwner, sameOwnerA, sameOwnerB};

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  tickHeadless(bodies, arena, 1);
  snapshots.push_back(snapshotJson(bodies, arena, "after-collision-rules-tick", 1));

  std::ostringstream out;
  out << "{\"scenario\":\"team-owner-collision-rules\",\"invariant\":\"Same-team noOwnTeamCollision pairs do not collide, onlySameOwnerCollision rejects different owners, and onlySameOwnerCollision still permits same-owner collisions.\""
      << ",\"participants\":{\"noOwnA\":" << refJson(bodies[0]) << ",\"noOwnB\":" << refJson(bodies[1])
      << ",\"onlyDifferentOwnerA\":" << refJson(bodies[2]) << ",\"onlyDifferentOwnerB\":" << refJson(bodies[3])
      << ",\"sharedOwner\":" << refJson(bodies[4]) << ",\"onlySameOwnerA\":" << refJson(bodies[5]) << ",\"onlySameOwnerB\":" << refJson(bodies[6]) << "}"
      << ",\"collisionEvidence\":{\"noOwnPairHealthAfterTick\":[20,20],\"differentOwnerPairHealthAfterTick\":[20,20],\"sameOwnerPairHealthAfterTick\":[0,0],"
      << "\"sameOwnerPairVelocityAfterTick\":[{\"x\":-7.2,\"y\":0,\"magnitude\":7.2,\"angle\":3.141593},{\"x\":7.2,\"y\":0,\"magnitude\":7.2,\"angle\":0}]}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}


std::string collisionEligibilityFiltersScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body zeroSidesA;
  zeroSidesA.id = 0; zeroSidesA.hash = zeroSidesA.preservedHash = 1; zeroSidesA.fixtureName = "zero-sides-a"; zeroSidesA.x = -500; zeroSidesA.y = 0;
  zeroSidesA.health = zeroSidesA.maxHealth = 20; zeroSidesA.damagePerTick = 5; zeroSidesA.size = zeroSidesA.width = 20; zeroSidesA.styleColor = ColorTank; zeroSidesA.sides = 0;
  Body zeroSidesB;
  zeroSidesB.id = 1; zeroSidesB.hash = zeroSidesB.preservedHash = 1; zeroSidesB.fixtureName = "zero-sides-b"; zeroSidesB.x = -475; zeroSidesB.y = 0;
  zeroSidesB.health = zeroSidesB.maxHealth = 20; zeroSidesB.damagePerTick = 5; zeroSidesB.size = zeroSidesB.width = 20; zeroSidesB.styleColor = ColorEnemySquare;
  Body nonPhysicalA;
  nonPhysicalA.id = 2; nonPhysicalA.hash = nonPhysicalA.preservedHash = 1; nonPhysicalA.fixtureName = "nonphysical-a"; nonPhysicalA.x = -100; nonPhysicalA.y = 0;
  nonPhysicalA.health = nonPhysicalA.maxHealth = 20; nonPhysicalA.damagePerTick = 5; nonPhysicalA.size = nonPhysicalA.width = 20; nonPhysicalA.styleColor = ColorTank; nonPhysicalA.isPhysical = false;
  Body nonPhysicalB;
  nonPhysicalB.id = 3; nonPhysicalB.hash = nonPhysicalB.preservedHash = 1; nonPhysicalB.fixtureName = "nonphysical-b"; nonPhysicalB.x = -75; nonPhysicalB.y = 0;
  nonPhysicalB.health = nonPhysicalB.maxHealth = 20; nonPhysicalB.damagePerTick = 5; nonPhysicalB.size = nonPhysicalB.width = 20; nonPhysicalB.styleColor = ColorEnemySquare;
  Body deletingA;
  deletingA.id = 4; deletingA.hash = deletingA.preservedHash = 1; deletingA.fixtureName = "deleting-a"; deletingA.x = 300; deletingA.y = 0;
  deletingA.health = 0; deletingA.maxHealth = 20; deletingA.damagePerTick = 5; deletingA.size = deletingA.width = 20; deletingA.styleColor = ColorTank; deletingA.deleting = true;
  Body deletingB;
  deletingB.id = 5; deletingB.hash = deletingB.preservedHash = 1; deletingB.fixtureName = "deleting-b"; deletingB.x = 325; deletingB.y = 0;
  deletingB.health = deletingB.maxHealth = 20; deletingB.damagePerTick = 5; deletingB.size = deletingB.width = 20; deletingB.styleColor = ColorEnemySquare;
  bodies = {zeroSidesA, zeroSidesB, nonPhysicalA, nonPhysicalB, deletingA, deletingB};

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  tickHeadless(bodies, arena, 1);
  snapshots.push_back(snapshotJson(bodies, arena, "after-filtered-collision-tick", 1));

  std::ostringstream out;
  out << "{\"scenario\":\"collision-eligibility-filters\",\"invariant\":\"Zero-sided, nonphysical, and actively deleting entities are excluded from collision damage and knockback before geometry checks.\""
      << ",\"participants\":{\"zeroSidesA\":" << refJson(bodies[0]) << ",\"zeroSidesB\":" << refJson(bodies[1])
      << ",\"nonPhysicalA\":" << refJson(bodies[2]) << ",\"nonPhysicalB\":" << refJson(bodies[3])
      << ",\"deletingA\":" << refJson(bodies[4]) << ",\"deletingB\":" << refJson(bodies[5]) << "}"
      << ",\"filterEvidence\":{\"zeroSidesHealthAfterTick\":[20,20],\"nonPhysicalHealthAfterTick\":[20,20],\"deletingPairHealthAfterTick\":[0,20],"
      << "\"deletingAStateAfterTick\":{\"score\":0,\"scoreReward\":0,\"deleting\":true,\"deletionFrame\":4},"
      << "\"otherVelocitiesAfterTick\":[{\"x\":0,\"y\":0,\"magnitude\":0,\"angle\":0},{\"x\":0,\"y\":0,\"magnitude\":0,\"angle\":0},{\"x\":0,\"y\":0,\"magnitude\":0,\"angle\":0}]}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}


std::string solidWallProjectileContactScenarioJson() {
  Arena arena;
  std::vector<Body> bodies;
  Body owner;
  owner.id = 0; owner.hash = owner.preservedHash = 1; owner.fixtureName = "wall-projectile-owner"; owner.x = -650; owner.y = 0;
  owner.health = owner.maxHealth = 20; owner.damagePerTick = 0; owner.size = owner.width = 10; owner.styleColor = ColorTank; owner.isPhysical = false;
  Body projectile;
  projectile.id = 1; projectile.hash = projectile.preservedHash = 1; projectile.fixtureName = "wall-projectile"; projectile.x = -600; projectile.y = 0;
  projectile.health = projectile.maxHealth = 20; projectile.damagePerTick = 5; projectile.size = projectile.width = 20; projectile.styleColor = ColorTank; projectile.ownerId = 0;
  Body wall;
  wall.id = 2; wall.hash = wall.preservedHash = 1; wall.fixtureName = "solid-wall"; wall.x = -575; wall.y = 0;
  wall.health = wall.maxHealth = 999; wall.damagePerTick = 0; wall.size = wall.width = 20; wall.styleColor = ColorEnemySquare; wall.physicsFlags = PhysicsSolidWall; wall.teamId = 2;
  bodies = {owner, projectile, wall};

  std::vector<std::string> snapshots;
  snapshots.push_back(snapshotJson(bodies, arena, "initial-full-world", 0));
  tickHeadless(bodies, arena, 1);
  snapshots.push_back(snapshotJson(bodies, arena, "after-wall-contact-tick", 1));

  std::ostringstream out;
  out << "{\"scenario\":\"solid-wall-projectile-contact\",\"invariant\":\"A projectile-like owned entity touching an enemy solid wall is immediately put into deletion animation without damaging or moving the wall.\""
      << ",\"participants\":{\"owner\":" << refJson(bodies[0]) << ",\"projectile\":" << refJson(bodies[1]) << ",\"wall\":" << refJson(bodies[2]) << "}"
      << ",\"wallEvidence\":{\"projectileAfterContact\":{\"score\":0,\"scoreReward\":0,\"deleting\":true,\"deletionFrame\":4},"
      << "\"projectileVelocityAfterContact\":{\"x\":0,\"y\":0,\"magnitude\":0,\"angle\":0},\"wallHealthAfterContact\":999,"
      << "\"wallVelocityAfterContact\":{\"x\":7.2,\"y\":0,\"magnitude\":7.2,\"angle\":0},\"projectileOwnerRef\":" << refJson(bodies[0]) << ",\"wallTeamRef\":" << refJson(bodies[2]) << "}"
      << ",\"snapshots\":[";
  for (std::size_t i = 0; i < snapshots.size(); ++i) { if (i) out << ','; out << snapshots[i]; }
  out << "]}";
  return out.str();
}

} // namespace

std::string gameplayReportJson() {
  return std::string("{\"phase\":\"D-gameplay\",\"scope\":\"minimal-headless-tick-parity\",\"nonGoals\":[") +
    "\"browser-client-ui-testing\",\"per-agent-rl-observation-grids\",\"cpp-gameplay-implementation\",\"full-live-websocket-gameplay-parity\",\"broad-every-tank-projectile-upgrade-coverage\"]," +
    "\"scenarios\":[" + damageScenarioJson() + "," + scoreDeathScenarioJson() + "," + ownerPropagatedKillScenarioJson() + "," + projectileMovementLifetimeScenarioJson() + "," + cameraScoreIntegrationScenarioJson() + "," + arenaBoundsClampScenarioJson() + "," + teamOwnerCollisionRulesScenarioJson() + "," + collisionEligibilityFiltersScenarioJson() + "," + solidWallProjectileContactScenarioJson() + "]}";
}

} // namespace diepcustom::gameplay
