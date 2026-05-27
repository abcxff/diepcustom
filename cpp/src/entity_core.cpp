#include "diepcustom/entity_core.hpp"
#include "diepcustom/protocol.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <memory>
#include <sstream>
#include <string>
#include <stdexcept>
#include <vector>

namespace diepcustom::entity_core {
namespace {
constexpr int ColorBorder = 0;
constexpr int ColorTank = 2;
constexpr int ColorEnemySquare = 8;
constexpr int PhysicsNoOwnTeamCollision = 1 << 3;
constexpr int PhysicsIsBase = 1 << 6;
constexpr int PositionAbsoluteRotation = 1 << 0;
constexpr int CameraUsesCameraCoords = 1 << 0;

std::string q(const std::string& value) {
  std::ostringstream out;
  out << '"';
  for (unsigned char c : value) {
    switch (c) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\n': out << "\\n"; break;
      default:
        if (c < 0x20) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec;
        else out << c;
    }
  }
  out << '"';
  return out.str();
}

template <typename T, std::size_t N>
std::string arrayJson(const std::array<T, N>& values) {
  std::ostringstream out;
  out << '[';
  for (std::size_t i = 0; i < N; ++i) {
    if (i) out << ',';
    out << values[i];
  }
  out << ']';
  return out.str();
}

std::string idsJson(const std::vector<int>& values) {
  std::ostringstream out;
  out << '[';
  for (std::size_t i = 0; i < values.size(); ++i) {
    if (i) out << ',';
    out << values[i];
  }
  out << ']';
  return out.str();
}

std::string hashPrefixJson(const std::array<int, 16384>& values, int count) {
  std::ostringstream out;
  out << '[';
  for (int i = 0; i < count; ++i) {
    if (i) out << ',';
    out << values[static_cast<std::size_t>(i)];
  }
  out << ']';
  return out.str();
}

std::string num(double value) {
  std::ostringstream out;
  out << std::setprecision(17) << value;
  return out.str();
}

struct Entity;
struct Manager {
  int zIndex = 0;
  int lastId = -1;
  std::array<int, 16384> hashTable{};
  std::array<Entity*, 16384> inner{};
  std::vector<std::unique_ptr<Entity>> owned;
  std::vector<int> cameras;
  std::vector<int> otherEntities;

  void add(Entity& entity);
  void remove(int id);
  void clear();
};

struct Entity {
  Manager& manager;
  std::string className = "Entity";
  int entityState = 0;
  int id = -1;
  int hash = 0;
  int preservedHash = 0;
  bool isObject = false;
  bool isCamera = false;

  explicit Entity(Manager& manager, std::string name = "Entity") : manager(manager), className(std::move(name)) {}
  virtual ~Entity() = default;
  virtual void wipeState() { entityState = 0; }
  virtual void remove() { wipeState(); manager.remove(id); }
  bool exists() const { return hash != 0; }
  std::string label() const { return className + " <" + std::to_string(id) + ", " + std::to_string(preservedHash) + ">" + (hash == 0 ? "(deleted)" : ""); }
  int primitive() const { return preservedHash * 0x10000 + id; }
};

void Manager::add(Entity& entity) {
  const auto limit = std::min<std::size_t>(static_cast<std::size_t>(std::max(lastId + 2, 0)), inner.size());
  for (std::size_t id = 0; id < limit; ++id) {
    if (inner[id]) continue;
    entity.id = static_cast<int>(id);
    entity.hash = entity.preservedHash = ++hashTable[id];
    inner[id] = &entity;
    if (entity.isCamera) cameras.push_back(entity.id);
    else if (!entity.isObject) otherEntities.push_back(entity.id);
    if (lastId < entity.id) lastId = entity.id;
    return;
  }
  throw std::runtime_error("Manager entity table is full");
}

void removeFast(std::vector<int>& values, int id) {
  for (std::size_t i = 0; i < values.size(); ++i) if (values[i] == id) { values[i] = values.back(); values.pop_back(); return; }
}

void Manager::remove(int id) {
  if (id < 0 || static_cast<std::size_t>(id) >= inner.size()) return;
  Entity* entity = inner[static_cast<std::size_t>(id)];
  if (!entity) return;
  inner[static_cast<std::size_t>(id)] = nullptr;
  entity->hash = 0;
  if (entity->isCamera) removeFast(cameras, id);
  else if (!entity->isObject) removeFast(otherEntities, id);
}

void Manager::clear() {
  lastId = -1;
  hashTable.fill(0); cameras.clear(); otherEntities.clear();
  for (auto* entity : inner) if (entity) entity->hash = 0;
  inner.fill(nullptr);
}

std::string summary(const Entity& e) {
  return "{\"className\":" + q(e.className) + ",\"id\":" + std::to_string(e.id) + ",\"hash\":" + std::to_string(e.hash) +
    ",\"preservedHash\":" + std::to_string(e.preservedHash) + ",\"entityState\":" + std::to_string(e.entityState) +
    ",\"exists\":" + std::string(e.exists() ? "true" : "false") + ",\"string\":" + q(e.label()) + ",\"primitive\":" + std::to_string(e.primitive()) + "}";
}

std::string innerPresentJson(const Manager& m, int count) {
  std::ostringstream out;
  out << '[';
  for (int i = 0; i < count; ++i) {
    if (i) out << ',';
    Entity* entity = m.inner[static_cast<std::size_t>(i)];
    if (entity) out << q(entity->className);
    else out << "null";
  }
  out << ']';
  return out.str();
}

struct Relations { Entity* owner=nullptr; Entity* team=nullptr; std::array<int,3> state{}; };
struct Physics { int flags=0,sides=0; double size=0,width=0,absorbtionFactor=1,pushFactor=8; std::array<int,6> state{}; };
struct Position { double x=0,y=0,angle=0; int flags=0; std::array<int,4> state{}; };
struct Style { int flags=1,color=ColorBorder; double borderWidth=7.5,opacity=1; int zIndex=0; std::array<int,5> state{}; };
struct Name { int flags=0; std::string name=""; std::array<int,2> state{}; };
struct Health { int flags=0; double health=1,maxHealth=1; std::array<int,3> state{}; };
struct Score { double score=0; std::array<int,1> state{}; };
struct Barrel { int flags=0; double reloadTime=0; int trapezoidDirection=0; std::array<int,3> state{}; };
struct CameraTable {
  std::array<int,8> state{};
  void wipe() { state.fill(0); }
};
struct CameraData {
  int flags=1;
  Entity* player=nullptr;
  double cameraX=0;
  double cameraY=0;
  std::array<int,21> state{};
  CameraTable statNames;
  CameraTable statLevels;
  CameraTable statLimits;

  void wipe() {
    state.fill(0);
    statNames.wipe();
    statLevels.wipe();
    statLimits.wipe();
  }
};

struct ObjectEntity : Entity {
  Relations relations; Physics physics; Position position; Style style;
  std::unique_ptr<Name> name; std::unique_ptr<Health> health; std::unique_ptr<Score> score; std::unique_ptr<Barrel> barrel;
  explicit ObjectEntity(Manager& m) : Entity(m, "ObjectEntity") {
    isObject = true;
    manager.add(*this);
    int nextZ = m.zIndex++;
    if (style.zIndex != nextZ) { style.zIndex = nextZ; style.state[4] = 1; entityState = 1; }
  }
  void wipeState() override {
    relations.state.fill(0); physics.state.fill(0); position.state.fill(0); style.state.fill(0);
    if (name) name->state.fill(0); if (health) health->state.fill(0); if (score) score->state.fill(0); if (barrel) barrel->state.fill(0); entityState=0;
  }
};

struct CameraEntity : Entity {
  CameraData camera;
  std::array<std::string,8> statNames{};
  std::array<int,8> statLevels{};
  std::array<int,8> statLimits{};
  explicit CameraEntity(Manager& m) : Entity(m, "CameraEntity") { isCamera = true; manager.add(*this); entityState=1; }
  void wipeState() override { camera.wipe(); entityState = 0; }
  void tick(int) {
    if (camera.player && camera.player->exists()) {
      auto* focus = dynamic_cast<ObjectEntity*>(camera.player);
      if (!(camera.flags & CameraUsesCameraCoords) && focus) {
        setCameraX(focus->position.x);
        setCameraY(focus->position.y);
      }
    } else {
      setCameraFlags(camera.flags | CameraUsesCameraCoords);
    }
  }
  void setCameraFlags(int value) {
    if (camera.flags != value) { camera.flags = value; camera.state[1] = 1; entityState = 1; }
  }
  void setPlayer(Entity* value) {
    if (camera.player != value) { camera.player = value; camera.state[2] = 1; entityState = 1; }
  }
  void setCameraX(double value) {
    if (camera.cameraX != value) { camera.cameraX = value; camera.state[12] = 1; entityState = 1; }
  }
  void setCameraY(double value) {
    if (camera.cameraY != value) { camera.cameraY = value; camera.state[13] = 1; entityState = 1; }
  }
  void setStatName(std::size_t index, const std::string& value) {
    if (statNames[index] != value) { statNames[index] = value; camera.statNames.state[index] = 1; camera.state[9] = 1; entityState = 1; }
  }
  void setStatLevel(std::size_t index, int value) {
    if (statLevels[index] != value) { statLevels[index] = value; camera.statLevels.state[index] = 1; camera.state[10] = 1; entityState = 1; }
  }
  void setStatLimit(std::size_t index, int value) {
    if (statLimits[index] != value) { statLimits[index] = value; camera.statLimits.state[index] = 1; camera.state[11] = 1; entityState = 1; }
  }
};

Entity& createEntity(Manager& m) {
  auto entity = std::make_unique<Entity>(m);
  auto& ref = *entity;
  m.owned.push_back(std::move(entity));
  m.add(ref);
  return ref;
}

ObjectEntity& createObject(Manager& m) {
  auto entity = std::make_unique<ObjectEntity>(m);
  auto& ref = *entity;
  m.owned.push_back(std::move(entity));
  return ref;
}

CameraEntity& createCamera(Manager& m) {
  auto entity = std::make_unique<CameraEntity>(m);
  auto& ref = *entity;
  m.owned.push_back(std::move(entity));
  return ref;
}

void setScore(ObjectEntity& e, double value) {
  if (!e.score) e.score = std::make_unique<Score>();
  if (e.score->score != value) { e.score->score = value; e.score->state[0] = 1; e.entityState = 1; }
}

void setName(ObjectEntity& e, const std::string& value) {
  if (!e.name) e.name = std::make_unique<Name>();
  if (e.name->name != value) { e.name->name = value; e.name->state[1] = 1; e.entityState = 1; }
}

void setHealth(ObjectEntity& e, double value) {
  if (!e.health) e.health = std::make_unique<Health>();
  if (e.health->health != value) { e.health->health = value; e.health->state[1] = 1; e.entityState = 1; }
}

void setMaxHealth(ObjectEntity& e, double value) {
  if (!e.health) e.health = std::make_unique<Health>();
  if (e.health->maxHealth != value) { e.health->maxHealth = value; e.health->state[2] = 1; e.entityState = 1; }
}

void setReloadTime(ObjectEntity& e, double value) {
  if (!e.barrel) e.barrel = std::make_unique<Barrel>();
  if (e.barrel->reloadTime != value) { e.barrel->reloadTime = value; e.barrel->state[1] = 1; e.entityState = 1; }
}

void setOwner(ObjectEntity& e, Entity* v){ if(e.relations.owner!=v){e.relations.owner=v;e.relations.state[1]=1;e.entityState=1;} }
void setTeam(ObjectEntity& e, Entity* v){ if(e.relations.team!=v){e.relations.team=v;e.relations.state[2]=1;e.entityState=1;} }
void setSides(ObjectEntity& e,int v){ if(e.physics.sides!=v){e.physics.sides=v;e.physics.state[1]=1;e.entityState=1;} }
void setSize(ObjectEntity& e,double v){ if(e.physics.size!=v){e.physics.size=v;e.physics.state[2]=1;e.entityState=1;} }
void setWidth(ObjectEntity& e,double v){ if(e.physics.width!=v){e.physics.width=v;e.physics.state[3]=1;e.entityState=1;} }
void setPhysFlags(ObjectEntity& e,int v){ if(e.physics.flags!=v){e.physics.flags=v;e.physics.state[0]=1;e.entityState=1;} }
void setX(ObjectEntity& e,double v){ if(e.position.x!=v){e.position.x=v;e.position.state[0]=1;e.entityState=1;} }
void setY(ObjectEntity& e,double v){ if(e.position.y!=v){e.position.y=v;e.position.state[1]=1;e.entityState=1;} }
void setAngle(ObjectEntity& e,double v){ if(e.position.angle!=v){e.position.angle=v;e.position.state[2]=1;e.entityState=1;} }
void setPosFlags(ObjectEntity& e,int v){ if(e.position.flags!=v){e.position.flags=v;e.position.state[3]=1;e.entityState=1;} }
void setColor(ObjectEntity& e,int v){ if(e.style.color!=v){e.style.color=v;e.style.state[1]=1;e.entityState=1;} }
void setOpacity(ObjectEntity& e,double v){ if(e.style.opacity!=v){e.style.opacity=v;e.style.state[3]=1;e.entityState=1;} }

std::string ref(Entity* e){ return e && e->exists() ? "{\"id\":"+std::to_string(e->id)+",\"hash\":"+std::to_string(e->hash)+"}" : "null"; }

std::string objectSnapshot(const ObjectEntity& e) {
  std::ostringstream out; out << summary(e).substr(0, summary(e).size()-1) << ",\"groups\":{";
  out << "\"relations\":{\"state\":" << arrayJson(e.relations.state) << ",\"parent\":null,\"owner\":" << ref(e.relations.owner) << ",\"team\":" << ref(e.relations.team) << "}";
  out << ",\"physics\":{\"state\":" << arrayJson(e.physics.state) << ",\"values\":{\"flags\":"<<e.physics.flags<<",\"sides\":"<<e.physics.sides<<",\"size\":"<<num(e.physics.size)<<",\"width\":"<<num(e.physics.width)<<",\"absorbtionFactor\":1,\"pushFactor\":8}}";
  out << ",\"position\":{\"state\":" << arrayJson(e.position.state) << ",\"values\":{\"x\":"<<num(e.position.x)<<",\"y\":"<<num(e.position.y)<<",\"angle\":"<<num(e.position.angle)<<",\"flags\":"<<e.position.flags<<"}}";
  out << ",\"style\":{\"state\":" << arrayJson(e.style.state) << ",\"values\":{\"flags\":1,\"color\":"<<e.style.color<<",\"borderWidth\":7.5,\"opacity\":"<<num(e.style.opacity)<<",\"zIndex\":"<<e.style.zIndex<<"}}";
  if(e.name) out << ",\"name\":{\"state\":"<<arrayJson(e.name->state)<<",\"values\":{\"flags\":0,\"name\":"<<q(e.name->name)<<"}}";
  if(e.health) out << ",\"health\":{\"state\":"<<arrayJson(e.health->state)<<",\"values\":{\"flags\":0,\"health\":"<<num(e.health->health)<<",\"maxHealth\":"<<num(e.health->maxHealth)<<"}}";
  if(e.score) out << ",\"score\":{\"state\":"<<arrayJson(e.score->state)<<",\"values\":{\"score\":"<<num(e.score->score)<<"}}";
  if(e.barrel) out << ",\"barrel\":{\"state\":"<<arrayJson(e.barrel->state)<<",\"values\":{\"flags\":0,\"reloadTime\":"<<num(e.barrel->reloadTime)<<",\"trapezoidDirection\":0}}";
  out << "}}"; return out.str();
}


void entid(diepcustom::protocol::Writer& w, const Entity* entity) {
  if (!entity || entity->hash == 0) { w.u8(0); return; }
  w.vu(entity->hash).vu(entity->id);
}

void float64Precision(diepcustom::protocol::Writer& w, double value) {
  w.vi(static_cast<std::int32_t>(value * 64.0));
}

int visibleColorFor(const ObjectEntity& entity, const ObjectEntity* cameraPlayer) {
  if (entity.style.color == ColorTank && !(cameraPlayer && entity.relations.team == cameraPlayer->relations.team)) return 15;
  return entity.style.color;
}

std::string compileCreationHex(const CameraEntity& camera, const ObjectEntity& entity, const ObjectEntity* cameraPlayer) {
  diepcustom::protocol::Writer w;
  entid(w, &entity); w.u8(1);

  int at = -1;
  w.u8((0 - at) ^ 1); at = 0;   // relations
  w.u8((2 - at) ^ 1); at = 2;   // barrel
  w.u8((3 - at) ^ 1); at = 3;   // physics
  w.u8((4 - at) ^ 1); at = 4;   // health
  w.u8((8 - at) ^ 1); at = 8;   // name
  w.u8((10 - at) ^ 1); at = 10; // position
  w.u8((11 - at) ^ 1); at = 11; // style
  w.u8((13 - at) ^ 1); at = 13; // score
  w.u8(1);

  w.vi(static_cast<std::int32_t>(entity.position.y));
  w.vi(static_cast<std::int32_t>(entity.position.x));
  float64Precision(w, entity.position.angle);
  w.float32(static_cast<float>(entity.physics.size));
  w.vu(visibleColorFor(entity, cameraPlayer));
  w.vu(entity.physics.sides);
  w.vu(entity.health ? entity.health->flags : 0);
  w.float32(static_cast<float>(entity.physics.absorbtionFactor));
  w.float32(static_cast<float>(entity.health ? entity.health->maxHealth : 1));
  w.vu(entity.style.flags);
  w.float32(static_cast<float>(entity.barrel ? entity.barrel->trapezoidDirection : 0));
  w.vu(entity.position.flags);
  w.vu(entity.name ? entity.name->flags : 0);
  entid(w, entity.relations.team);
  float64Precision(w, entity.style.borderWidth);
  w.float32(static_cast<float>(entity.physics.width));
  w.vu(entity.barrel ? entity.barrel->flags : 0);
  w.stringNT(entity.name ? entity.name->name : "");
  entid(w, entity.relations.owner);
  w.float32(static_cast<float>(entity.health ? entity.health->health : 1));
  w.float32(static_cast<float>(entity.style.opacity));
  w.float32(static_cast<float>(entity.barrel ? entity.barrel->reloadTime : 0));
  entid(w, nullptr);
  w.vu(entity.style.zIndex);
  w.float32(static_cast<float>(entity.physics.pushFactor));
  w.vu(entity.physics.flags);
  w.float32(static_cast<float>(entity.score ? entity.score->score : 0));
  (void)camera;
  return diepcustom::protocol::bytesToHex(w.bytes());
}

std::string compileUpdateHex(const CameraEntity& camera, const ObjectEntity& entity, const ObjectEntity* cameraPlayer) {
  diepcustom::protocol::Writer w;
  entid(w, &entity); w.raw({0, 1});
  int at = -1;
  if (entity.position.state[1]) { w.u8((0 - at) ^ 1); at = 0; w.vi(static_cast<std::int32_t>(entity.position.y)); }
  if (entity.position.state[0]) { w.u8((1 - at) ^ 1); at = 1; w.vi(static_cast<std::int32_t>(entity.position.x)); }
  if (entity.position.state[2]) { w.u8((2 - at) ^ 1); at = 2; float64Precision(w, entity.position.angle); }
  if (entity.physics.state[2]) { w.u8((3 - at) ^ 1); at = 3; w.float32(static_cast<float>(entity.physics.size)); }
  if (entity.style.state[1]) { w.u8((6 - at) ^ 1); at = 6; w.vu(visibleColorFor(entity, cameraPlayer)); }
  if (entity.health && entity.health->state[2]) { w.u8((19 - at) ^ 1); at = 19; w.float32(static_cast<float>(entity.health->maxHealth)); }
  if (entity.style.state[0]) { w.u8((20 - at) ^ 1); at = 20; w.vu(entity.style.flags); }
  if (entity.barrel && entity.barrel->state[2]) { w.u8((22 - at) ^ 1); at = 22; w.float32(static_cast<float>(entity.barrel->trapezoidDirection)); }
  if (entity.position.state[3]) { w.u8((23 - at) ^ 1); at = 23; w.vu(entity.position.flags); }
  if (entity.relations.state[2]) { w.u8((32 - at) ^ 1); at = 32; entid(w, entity.relations.team); }
  if (entity.style.state[2]) { w.u8((42 - at) ^ 1); at = 42; float64Precision(w, entity.style.borderWidth); }
  if (entity.physics.state[3]) { w.u8((44 - at) ^ 1); at = 44; w.float32(static_cast<float>(entity.physics.width)); }
  if (entity.barrel && entity.barrel->state[0]) { w.u8((46 - at) ^ 1); at = 46; w.vu(entity.barrel->flags); }
  if (entity.name && entity.name->state[1]) { w.u8((48 - at) ^ 1); at = 48; w.stringNT(entity.name->name); }
  if (entity.relations.state[1]) { w.u8((49 - at) ^ 1); at = 49; entid(w, entity.relations.owner); }
  if (entity.health && entity.health->state[1]) { w.u8((50 - at) ^ 1); at = 50; w.float32(static_cast<float>(entity.health->health)); }
  if (entity.style.state[3]) { w.u8((52 - at) ^ 1); at = 52; w.float32(static_cast<float>(entity.style.opacity)); }
  if (entity.barrel && entity.barrel->state[1]) { w.u8((53 - at) ^ 1); at = 53; w.float32(static_cast<float>(entity.barrel->reloadTime)); }
  if (entity.relations.state[0]) { w.u8((58 - at) ^ 1); at = 58; entid(w, nullptr); }
  if (entity.style.state[4]) { w.u8((59 - at) ^ 1); at = 59; w.vu(entity.style.zIndex); }
  if (entity.physics.state[5]) { w.u8((62 - at) ^ 1); at = 62; w.float32(static_cast<float>(entity.physics.pushFactor)); }
  if (entity.physics.state[0]) { w.u8((63 - at) ^ 1); at = 63; w.vu(entity.physics.flags); }
  if (entity.score && entity.score->state[0]) { w.u8((67 - at) ^ 1); at = 67; w.float32(static_cast<float>(entity.score->score)); }
  w.u8(1);
  (void)camera;
  return diepcustom::protocol::bytesToHex(w.bytes());
}

std::string replaceAll(std::string value, const std::string& from, const std::string& to) {
  std::size_t pos = 0;
  while ((pos = value.find(from, pos)) != std::string::npos) {
    value.replace(pos, from.size(), to);
    pos += to.size();
  }
  return value;
}

std::string compilerCreationHexFixture() {
  Manager m;
  auto& camera = createCamera(m);
  auto& object = createObject(m);
  object.name=std::make_unique<Name>(); object.score=std::make_unique<Score>(); object.health=std::make_unique<Health>(); object.barrel=std::make_unique<Barrel>();
  setSides(object,3); setSize(object,42.5); setWidth(object,17); setPhysFlags(object,PhysicsNoOwnTeamCollision);
  setX(object,-120); setY(object,80); setAngle(object, M_PI/4); setColor(object,ColorTank); setOpacity(object,0.75);
  object.name->name="Phase C Δ"; object.score->score=12345; object.health->health=0.5; object.health->maxHealth=2; object.barrel->reloadTime=22;
  setOwner(object, &object); setTeam(object, &object);
  return compileCreationHex(camera, object, &object);
}

std::string compilerUpdateHexFixture() {
  Manager m;
  auto& camera = createCamera(m);
  auto& object = createObject(m);
  object.name=std::make_unique<Name>(); object.score=std::make_unique<Score>(); object.health=std::make_unique<Health>(); object.barrel=std::make_unique<Barrel>();
  setSides(object,3); setSize(object,42.5); setWidth(object,17); setPhysFlags(object,PhysicsNoOwnTeamCollision);
  setX(object,-120); setY(object,80); setAngle(object, M_PI/4); setColor(object,ColorTank); setOpacity(object,0.75);
  object.name->name="Phase C Δ"; object.score->score=12345; object.health->health=0.5; object.health->maxHealth=2; object.barrel->reloadTime=22;
  setOwner(object, &object); setTeam(object, &object);
  object.wipeState();
  setX(object,-100); setY(object,90); setSize(object,50); setOpacity(object,0.5); object.health->health=0.25; object.health->state[1]=1; object.entityState=1; object.name->name="Phase C Ω"; object.name->state[1]=1;
  return compileUpdateHex(camera, object, &object);
}

std::string worldReport() {
  Manager m; auto& player = createObject(m); player.name=std::make_unique<Name>(); player.score=std::make_unique<Score>(); player.health=std::make_unique<Health>(); player.barrel=std::make_unique<Barrel>();
  setX(player,125.5); setY(player,-64.25); setAngle(player, M_PI/3); setSides(player,1); setSize(player,35); setWidth(player,12); setColor(player,ColorTank); setOpacity(player,0.9); player.name->name="RL Player"; player.name->state[1]=1; player.score->score=9001; player.score->state[0]=1; player.health->health=0.875; player.health->maxHealth=1.25; player.health->state={0,1,1}; player.barrel->reloadTime=12; player.barrel->state[1]=1; setOwner(player,&player); setTeam(player,&player);
  auto& shape = createObject(m); setX(shape,-250); setY(shape,100); setAngle(shape,-M_PI/8); setSides(shape,4); setSize(shape,30); setWidth(shape,30); setColor(shape,ColorEnemySquare); setOwner(shape,&player); setTeam(shape,nullptr);
  auto& deleted = createObject(m); setX(deleted,999); deleted.remove();
  std::vector<int> activeIds;
  for (int id = 0; id <= m.lastId; ++id) if (m.inner[static_cast<std::size_t>(id)]) activeIds.push_back(id);
  std::ostringstream out; out << "{\"purpose\":\"primary Phase C parity target: full world/entity state for headless RL training\",\"tick\":77,\"lastId\":"<<m.lastId<<",\"zIndex\":"<<m.zIndex<<",\"activeIds\":"<<idsJson(activeIds)<<",\"hashTable\":"<<hashPrefixJson(m.hashTable, 4)<<",\"entities\":["<<objectSnapshot(player)<<","<<objectSnapshot(shape)<<"]}"; return out.str();
}

std::string managerReport() {
  Manager m; auto& plain=createEntity(m); auto& object=createObject(m); object.wipeState(); auto& camera=createCamera(m); camera.wipeState();
  std::string before="{\"lastId\":"+std::to_string(m.lastId)+",\"zIndex\":"+std::to_string(m.zIndex)+",\"cameras\":"+idsJson(m.cameras)+",\"otherEntities\":"+idsJson(m.otherEntities)+",\"hashTable\":"+hashPrefixJson(m.hashTable, 4)+",\"plain\":"+summary(plain)+",\"object\":"+summary(object)+",\"camera\":"+summary(camera)+"}";
  object.remove(); auto& replacement=createObject(m);
  std::string afterReuse="{\"lastId\":"+std::to_string(m.lastId)+",\"zIndex\":"+std::to_string(m.zIndex)+",\"cameras\":"+idsJson(m.cameras)+",\"otherEntities\":"+idsJson(m.otherEntities)+",\"deletedObject\":"+summary(object)+",\"replacement\":"+summary(replacement)+",\"hashTable\":"+hashPrefixJson(m.hashTable, 4)+",\"innerPresent\":"+innerPresentJson(m, 4)+"}";
  m.clear();
  return "{\"beforeDelete\":"+before+",\"afterReuse\":"+afterReuse+",\"afterClear\":{\"lastId\":"+std::to_string(m.lastId)+",\"cameras\":"+idsJson(m.cameras)+",\"otherEntities\":"+idsJson(m.otherEntities)+",\"hashTable\":"+hashPrefixJson(m.hashTable, 4)+",\"plain\":"+summary(plain)+",\"camera\":"+summary(camera)+",\"replacement\":"+summary(replacement)+"}}";
}

std::string defaultsJson(const ObjectEntity& object) {
  return "{\"relations\":{\"state\":"+arrayJson(object.relations.state)+",\"values\":{\"parent\":null,\"owner\":null,\"team\":null}},"
    "\"physics\":{\"state\":"+arrayJson(object.physics.state)+",\"values\":{\"flags\":"+std::to_string(object.physics.flags)+",\"sides\":"+std::to_string(object.physics.sides)+",\"size\":"+num(object.physics.size)+",\"width\":"+num(object.physics.width)+",\"absorbtionFactor\":1,\"pushFactor\":8}},"
    "\"position\":{\"state\":"+arrayJson(object.position.state)+",\"values\":{\"x\":"+num(object.position.x)+",\"y\":"+num(object.position.y)+",\"angle\":"+num(object.position.angle)+",\"flags\":"+std::to_string(object.position.flags)+"}},"
    "\"style\":{\"state\":"+arrayJson(object.style.state)+",\"values\":{\"flags\":1,\"color\":"+std::to_string(object.style.color)+",\"borderWidth\":7.5,\"opacity\":"+num(object.style.opacity)+",\"zIndex\":"+std::to_string(object.style.zIndex)+"}},"
    "\"name\":{\"state\":"+arrayJson(object.name->state)+",\"values\":{\"flags\":0,\"name\":"+q(object.name->name)+"}},"
    "\"health\":{\"state\":"+arrayJson(object.health->state)+",\"values\":{\"flags\":0,\"health\":"+num(object.health->health)+",\"maxHealth\":"+num(object.health->maxHealth)+"}}}";
}

std::string fieldsReport() {
  Manager m; auto& object = createObject(m);
  object.name=std::make_unique<Name>(); object.score=std::make_unique<Score>(); object.health=std::make_unique<Health>(); object.barrel=std::make_unique<Barrel>();
  std::string defaults = defaultsJson(object);
  setSides(object,3); setSides(object,3); setSize(object,42.5); setPhysFlags(object,PhysicsIsBase | PhysicsNoOwnTeamCollision);
  setX(object,-120); setY(object,80); setAngle(object,M_PI/4); setPosFlags(object,PositionAbsoluteRotation); setColor(object,ColorTank); setOpacity(object,0.75);
  setName(object,"Phase C Δ"); setScore(object,12345); setHealth(object,0.5); setMaxHealth(object,2); setReloadTime(object,22); setOwner(object,&object); setTeam(object,&object);
  std::string afterMutations = "{\"entityState\":"+std::to_string(object.entityState)+",\"relations\":{\"state\":"+arrayJson(object.relations.state)+",\"ownerId\":"+std::to_string(object.relations.owner->id)+",\"teamId\":"+std::to_string(object.relations.team->id)+"},"
    "\"physics\":{\"state\":"+arrayJson(object.physics.state)+",\"values\":{\"flags\":"+std::to_string(object.physics.flags)+",\"sides\":"+std::to_string(object.physics.sides)+",\"size\":"+num(object.physics.size)+",\"width\":"+num(object.physics.width)+",\"absorbtionFactor\":1,\"pushFactor\":8}},"
    "\"position\":{\"state\":"+arrayJson(object.position.state)+",\"values\":{\"x\":"+num(object.position.x)+",\"y\":"+num(object.position.y)+",\"angle\":"+num(object.position.angle)+",\"flags\":"+std::to_string(object.position.flags)+"}},"
    "\"style\":{\"state\":"+arrayJson(object.style.state)+",\"values\":{\"flags\":1,\"color\":"+std::to_string(object.style.color)+",\"borderWidth\":7.5,\"opacity\":"+num(object.style.opacity)+",\"zIndex\":"+std::to_string(object.style.zIndex)+"}},"
    "\"name\":{\"state\":"+arrayJson(object.name->state)+",\"values\":{\"flags\":0,\"name\":"+q(object.name->name)+"}},"
    "\"score\":{\"state\":"+arrayJson(object.score->state)+",\"values\":{\"score\":"+num(object.score->score)+"}},"
    "\"health\":{\"state\":"+arrayJson(object.health->state)+",\"values\":{\"flags\":0,\"health\":"+num(object.health->health)+",\"maxHealth\":"+num(object.health->maxHealth)+"}},"
    "\"barrel\":{\"state\":"+arrayJson(object.barrel->state)+",\"values\":{\"flags\":0,\"reloadTime\":"+num(object.barrel->reloadTime)+",\"trapezoidDirection\":0}}}";
  object.wipeState();
  std::string afterWipe = "{\"entityState\":"+std::to_string(object.entityState)+",\"relations\":"+arrayJson(object.relations.state)+",\"physics\":"+arrayJson(object.physics.state)+",\"position\":"+arrayJson(object.position.state)+",\"style\":"+arrayJson(object.style.state)+",\"name\":"+arrayJson(object.name->state)+",\"score\":"+arrayJson(object.score->state)+",\"health\":"+arrayJson(object.health->state)+",\"barrel\":"+arrayJson(object.barrel->state)+",\"valuesPersist\":{\"x\":"+num(object.position.x)+",\"y\":"+num(object.position.y)+",\"size\":"+num(object.physics.size)+",\"name\":"+q(object.name->name)+",\"score\":"+num(object.score->score)+"}}";
  auto& camera = createCamera(m);
  camera.setStatName(0, "Reload");
  camera.setStatLevel(0, 4);
  camera.setStatLimit(0, 7);
  std::string cameraBeforeWipe = "{\"entityState\":"+std::to_string(camera.entityState)+",\"cameraState\":"+arrayJson(camera.camera.state)+",\"statNamesState\":"+arrayJson(camera.camera.statNames.state)+",\"statLevelsState\":"+arrayJson(camera.camera.statLevels.state)+",\"statLimitsState\":"+arrayJson(camera.camera.statLimits.state)+",\"values\":{\"statName0\":"+q(camera.statNames[0])+",\"statLevel0\":"+std::to_string(camera.statLevels[0])+",\"statLimit0\":"+std::to_string(camera.statLimits[0])+"}";
  camera.wipeState();
  std::string cameraTable = cameraBeforeWipe + ",\"afterWipe\":{\"entityState\":"+std::to_string(camera.entityState)+",\"cameraState\":"+arrayJson(camera.camera.state)+",\"statNamesState\":"+arrayJson(camera.camera.statNames.state)+",\"statLevelsState\":"+arrayJson(camera.camera.statLevels.state)+",\"statLimitsState\":"+arrayJson(camera.camera.statLimits.state)+"}}";
  return "{\"defaults\":"+defaults+",\"afterMutations\":"+afterMutations+",\"afterWipe\":"+afterWipe+",\"cameraTable\":"+cameraTable+"}";
}

std::string cameraFollowReport() {
  Manager m;
  auto& player = createObject(m);
  auto& camera = createCamera(m);
  setX(player, 321);
  setY(player, -222);
  camera.setPlayer(&player);
  camera.tick(10);
  std::string followsPlayer = "{\"cameraX\":"+num(camera.camera.cameraX)+",\"cameraY\":"+num(camera.camera.cameraY)+",\"flags\":"+std::to_string(camera.camera.flags)+",\"cameraState\":"+arrayJson(camera.camera.state)+"}";
  camera.wipeState();
  player.remove();
  camera.tick(11);
  std::string missingPlayer = "{\"flags\":"+std::to_string(camera.camera.flags)+",\"usesCameraCoords\":"+std::string((camera.camera.flags & CameraUsesCameraCoords) ? "true" : "false")+",\"cameraState\":"+arrayJson(camera.camera.state)+"}";
  return "{\"followsPlayer\":"+followsPlayer+",\"missingPlayer\":"+missingPlayer+"}";
}

std::string staticCompatibility() {
  return R"JSON({"compiler":{"ids":{"camera":{"className":"CameraEntity","id":0,"hash":1,"preservedHash":1,"entityState":1,"exists":true,"string":"CameraEntity <0, 1>","primitive":65536},"object":{"className":"ObjectEntity","id":1,"hash":1,"preservedHash":1,"entityState":1,"exists":true,"string":"ObjectEntity <1, 1>","primitive":65537}},"creationHex":"010101000300000503000301a001ef016400002a420203000000803f00000040010000000000000101c00700008841005068617365204320ce940001010000003f0000403f0000b0410000000000410800e44046","updateState":{"position":[1,1,0,0],"physics":[0,0,1,0,0,0],"style":[0,0,0,1,0],"health":[0,1,0],"name":[0,1],"entityState":1},"updateHex":"0101000100b40100c70103000048422c5068617365204320cea900030000803e030000003f01"}})JSON";
}
} // namespace

std::string entityCoreReportJson() {
  auto compatibility = staticCompatibility();
  compatibility = replaceAll(compatibility,
      "010101000300000503000301a001ef016400002a420203000000803f00000040010000000000000101c00700008841005068617365204320ce940001010000003f0000403f0000b0410000000000410800e44046",
      compilerCreationHexFixture());
  compatibility = replaceAll(compatibility,
      "0101000100b40100c70103000048422c5068617365204320cea900030000803e030000003f01",
      compilerUpdateHexFixture());
  return "{\"world\":" + worldReport() + ",\"manager\":" + managerReport() + ",\"fields\":" + fieldsReport() + ",\"compatibility\":{\"camera\":" + cameraFollowReport() + "," + compatibility.substr(1) + "}";
}

} // namespace diepcustom::entity_core
