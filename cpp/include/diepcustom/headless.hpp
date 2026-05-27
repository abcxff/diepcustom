#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace diepcustom::headless {

struct Action {
  int agentId = -1;
  double moveX = 0;
  double moveY = 0;
  double aimX = 1;
  double aimY = 0;
  bool fire = false;
  bool altFire = false;
  int upgradeChoice = 0;
};

struct StepResult {
  int tick = 0;
  std::vector<double> rewards;
  bool done = false;
};

struct Config {
  std::uint64_t seed = 1;
  int agents = 1;
  int maxTicks = 1000;
  std::string scenario = "basic-ffa";
};

class Rng {
public:
  explicit Rng(std::uint64_t seed = 1);
  std::uint32_t nextU32();
  double nextDouble01();
  int rangeInt(int minInclusive, int maxInclusive);
  std::uint64_t drawCount() const;
  std::uint64_t state() const;

private:
  std::uint64_t state_ = 1;
  std::uint64_t draws_ = 0;
};

class Simulation {
public:
  explicit Simulation(Config config);

  void reset(std::uint64_t seed);
  StepResult step(const std::vector<Action>& actions);
  std::string fullWorldSnapshotJson() const;
  std::string finalReportJson(double elapsedMs) const;

  int tick() const;
  int activeEntityCount() const;
  const Config& config() const;

private:
  struct Arena {
    double leftX = -1000;
    double rightX = 1000;
    double topY = -1000;
    double bottomY = 1000;
    double padding = 200;
  };

  struct Entity {
    int id = 0;
    int hash = 1;
    std::string kind = "body";
    int agentIndex = -1;
    int ownerId = -1;
    int teamId = -1;
    double x = 0;
    double y = 0;
    double angle = 0;
    double vx = 0;
    double vy = 0;
    double velocityMagnitude = 0;
    double velocityAngle = 0;
    int sides = 1;
    double size = 30;
    double width = 30;
    double pushFactor = 8;
    double absorbtionFactor = 1;
    int physicsFlags = 0;
    double health = 1;
    double maxHealth = 1;
    double damagePerTick = 1;
    double damageReduction = 1;
    double minDamageMultiplier = 1;
    double maxDamageMultiplier = 4;
    int lastDamageTick = -1;
    int lastDamageAnimationTick = -1;
    int styleColor = 0;
    double score = 0;
    double scoreReward = 0;
    bool isPhysical = true;
    bool deleting = false;
    bool removed = false;
    int deletionFrame = 5;
    bool projectileMotion = false;
    int spawnTick = 0;
    int lifeLength = 0;
    double movementAngle = 0;
    double baseSpeed = 0;
    double baseAccel = 0;
    int cooldown = 0;
  };

  void initializeWorld();
  void spawnAgent(int index);
  void spawnShape(int index);
  Entity* findEntity(int id);
  const Entity* findEntity(int id) const;
  void applyActions(const std::vector<Action>& actions, StepResult& result);
  void fireProjectile(Entity& owner);
  void resolveCollisions(StepResult& result);
  void integrateEntities();
  void cleanupEntities();
  bool isColliding(const Entity& a, const Entity& b) const;
  void receiveKnockback(Entity& self, const Entity& other);
  void receiveDamage(Entity& target, Entity& source, double amount, StepResult& result);
  void keepInArena(Entity& entity) const;
  int agentIndexForId(int id) const;

  Config config_;
  Rng rng_;
  Arena arena_;
  std::vector<Entity> entities_;
  std::vector<int> agentIds_;
  int tick_ = 0;
  int nextId_ = 0;
  int nextHash_ = 1;
};

} // namespace diepcustom::headless
