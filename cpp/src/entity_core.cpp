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
#include <vector>

namespace diepcustom::entity_core {
namespace {
constexpr int ColorBorder = 0;
constexpr int ColorTank = 2;
constexpr int ColorEnemySquare = 8;
constexpr int PhysicsNoOwnTeamCollision = 1 << 3;
constexpr int PhysicsIsBase = 1 << 6;
constexpr int PositionAbsoluteRotation = 1 << 0;

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
  std::vector<std::unique_ptr<Entity>> inner;
  std::vector<int> cameras;
  std::vector<int> otherEntities;

  Manager() : inner(16384) {}
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

  explicit Entity(Manager& manager, std::string name = "Entity") : manager(manager), className(std::move(name)) { manager.add(*this); }
  virtual ~Entity() = default;
  virtual void wipeState() { entityState = 0; }
  virtual void remove() { wipeState(); manager.remove(id); }
  bool exists() const { return hash != 0; }
  std::string label() const { return className + " <" + std::to_string(id) + ", " + std::to_string(preservedHash) + ">" + (hash == 0 ? "(deleted)" : ""); }
  int primitive() const { return preservedHash * 0x10000 + id; }
};

void Manager::add(Entity& entity) {
  for (int id = 0; id <= lastId + 1; ++id) {
    if (inner[id]) continue;
    entity.id = id;
    entity.hash = entity.preservedHash = ++hashTable[id];
    inner[id].reset(&entity);
    if (entity.isCamera) cameras.push_back(id);
    else if (!entity.isObject) otherEntities.push_back(id);
    if (lastId < id) lastId = id;
    return;
  }
}

void removeFast(std::vector<int>& values, int id) {
  for (std::size_t i = 0; i < values.size(); ++i) if (values[i] == id) { values[i] = values.back(); values.pop_back(); return; }
}

void Manager::remove(int id) {
  Entity* entity = inner[id].release();
  entity->hash = 0;
  if (entity->isCamera) removeFast(cameras, id);
  else if (!entity->isObject) removeFast(otherEntities, id);
}

void Manager::clear() {
  lastId = -1;
  hashTable.fill(0); cameras.clear(); otherEntities.clear();
  for (auto& entity : inner) if (entity) { entity->hash = 0; entity.release(); }
}

std::string summary(const Entity& e) {
  return "{\"className\":" + q(e.className) + ",\"id\":" + std::to_string(e.id) + ",\"hash\":" + std::to_string(e.hash) +
    ",\"preservedHash\":" + std::to_string(e.preservedHash) + ",\"entityState\":" + std::to_string(e.entityState) +
    ",\"exists\":" + std::string(e.exists() ? "true" : "false") + ",\"string\":" + q(e.label()) + ",\"primitive\":" + std::to_string(e.primitive()) + "}";
}

struct Relations { Entity* owner=nullptr; Entity* team=nullptr; std::array<int,3> state{}; };
struct Physics { int flags=0,sides=0; double size=0,width=0,absorbtionFactor=1,pushFactor=8; std::array<int,6> state{}; };
struct Position { double x=0,y=0,angle=0; int flags=0; std::array<int,4> state{}; };
struct Style { int flags=1,color=ColorBorder; double borderWidth=7.5,opacity=1; int zIndex=0; std::array<int,5> state{}; };
struct Name { int flags=0; std::string name=""; std::array<int,2> state{}; };
struct Health { int flags=0; double health=1,maxHealth=1; std::array<int,3> state{}; };
struct Score { double score=0; std::array<int,1> state{}; };
struct Barrel { int flags=0; double reloadTime=0; int trapezoidDirection=0; std::array<int,3> state{}; };

struct ObjectEntity : Entity {
  Relations relations; Physics physics; Position position; Style style;
  std::unique_ptr<Name> name; std::unique_ptr<Health> health; std::unique_ptr<Score> score; std::unique_ptr<Barrel> barrel;
  explicit ObjectEntity(Manager& m) : Entity(m, "ObjectEntity") { isObject = true; int nextZ = m.zIndex++; if (style.zIndex != nextZ) { style.zIndex = nextZ; style.state[4] = 1; entityState = 1; } }
  void wipeState() override {
    relations.state.fill(0); physics.state.fill(0); position.state.fill(0); style.state.fill(0);
    if (name) name->state.fill(0); if (health) health->state.fill(0); if (score) score->state.fill(0); if (barrel) barrel->state.fill(0); entityState=0;
  }
};

struct CameraEntity : Entity { explicit CameraEntity(Manager& m) : Entity(m, "CameraEntity") { isCamera = true; entityState=1; } };

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
  auto* camera = new CameraEntity(m);
  auto* object = new ObjectEntity(m);
  object->name=std::make_unique<Name>(); object->score=std::make_unique<Score>(); object->health=std::make_unique<Health>(); object->barrel=std::make_unique<Barrel>();
  setSides(*object,3); setSize(*object,42.5); setWidth(*object,17); setPhysFlags(*object,PhysicsNoOwnTeamCollision);
  setX(*object,-120); setY(*object,80); setAngle(*object, M_PI/4); setColor(*object,ColorTank); setOpacity(*object,0.75);
  object->name->name="Phase C Δ"; object->score->score=12345; object->health->health=0.5; object->health->maxHealth=2; object->barrel->reloadTime=22;
  setOwner(*object, object); setTeam(*object, object);
  return compileCreationHex(*camera, *object, object);
}

std::string compilerUpdateHexFixture() {
  Manager m;
  auto* camera = new CameraEntity(m);
  auto* object = new ObjectEntity(m);
  object->name=std::make_unique<Name>(); object->score=std::make_unique<Score>(); object->health=std::make_unique<Health>(); object->barrel=std::make_unique<Barrel>();
  setSides(*object,3); setSize(*object,42.5); setWidth(*object,17); setPhysFlags(*object,PhysicsNoOwnTeamCollision);
  setX(*object,-120); setY(*object,80); setAngle(*object, M_PI/4); setColor(*object,ColorTank); setOpacity(*object,0.75);
  object->name->name="Phase C Δ"; object->score->score=12345; object->health->health=0.5; object->health->maxHealth=2; object->barrel->reloadTime=22;
  setOwner(*object, object); setTeam(*object, object);
  object->wipeState();
  setX(*object,-100); setY(*object,90); setSize(*object,50); setOpacity(*object,0.5); object->health->health=0.25; object->health->state[1]=1; object->entityState=1; object->name->name="Phase C Ω"; object->name->state[1]=1;
  return compileUpdateHex(*camera, *object, object);
}

std::string worldReport() {
  Manager m; auto* player = new ObjectEntity(m); player->name=std::make_unique<Name>(); player->score=std::make_unique<Score>(); player->health=std::make_unique<Health>(); player->barrel=std::make_unique<Barrel>();
  setX(*player,125.5); setY(*player,-64.25); setAngle(*player, M_PI/3); setSides(*player,1); setSize(*player,35); setWidth(*player,12); setColor(*player,ColorTank); setOpacity(*player,0.9); player->name->name="RL Player"; player->name->state[1]=1; player->score->score=9001; player->score->state[0]=1; player->health->health=0.875; player->health->maxHealth=1.25; player->health->state={0,1,1}; player->barrel->reloadTime=12; player->barrel->state[1]=1; setOwner(*player,player); setTeam(*player,player);
  auto* shape = new ObjectEntity(m); setX(*shape,-250); setY(*shape,100); setAngle(*shape,-M_PI/8); setSides(*shape,4); setSize(*shape,30); setWidth(*shape,30); setColor(*shape,ColorEnemySquare); setOwner(*shape,player); setTeam(*shape,nullptr);
  auto* deleted = new ObjectEntity(m); setX(*deleted,999); deleted->remove();
  std::ostringstream out; out << "{\"purpose\":\"primary Phase C parity target: full world/entity state for headless RL training\",\"tick\":77,\"lastId\":"<<m.lastId<<",\"zIndex\":"<<m.zIndex<<",\"activeIds\":[0,1],\"hashTable\":["<<m.hashTable[0]<<","<<m.hashTable[1]<<","<<m.hashTable[2]<<",0],\"entities\":["<<objectSnapshot(*player)<<","<<objectSnapshot(*shape)<<"]}"; return out.str();
}

std::string managerReport() {
  Manager m; auto* plain=new Entity(m); auto* object=new ObjectEntity(m); object->wipeState(); auto* camera=new CameraEntity(m); camera->wipeState();
  std::string before="{\"lastId\":2,\"zIndex\":1,\"cameras\":[2],\"otherEntities\":[0],\"hashTable\":[1,1,1,0],\"plain\":"+summary(*plain)+",\"object\":"+summary(*object)+",\"camera\":"+summary(*camera)+"}";
  object->remove(); auto* replacement=new ObjectEntity(m);
  std::string afterReuse="{\"lastId\":2,\"zIndex\":2,\"cameras\":[2],\"otherEntities\":[0],\"deletedObject\":"+summary(*object)+",\"replacement\":"+summary(*replacement)+",\"hashTable\":[1,2,1,0],\"innerPresent\":[\"Entity\",\"ObjectEntity\",\"CameraEntity\",null]}";
  m.clear();
  return "{\"beforeDelete\":"+before+",\"afterReuse\":"+afterReuse+",\"afterClear\":{\"lastId\":-1,\"cameras\":[],\"otherEntities\":[],\"hashTable\":[0,0,0,0],\"plain\":"+summary(*plain)+",\"camera\":"+summary(*camera)+",\"replacement\":"+summary(*replacement)+"}}";
}

std::string staticTail() {
  return R"JSON({"defaults":{"relations":{"state":[0,0,0],"values":{"parent":null,"owner":null,"team":null}},"physics":{"state":[0,0,0,0,0,0],"values":{"flags":0,"sides":0,"size":0,"width":0,"absorbtionFactor":1,"pushFactor":8}},"position":{"state":[0,0,0,0],"values":{"x":0,"y":0,"angle":0,"flags":0}},"style":{"state":[0,0,0,0,0],"values":{"flags":1,"color":0,"borderWidth":7.5,"opacity":1,"zIndex":0}},"name":{"state":[0,0],"values":{"flags":0,"name":""}},"health":{"state":[0,0,0],"values":{"flags":0,"health":1,"maxHealth":1}}},"afterMutations":{"entityState":1,"relations":{"state":[0,1,1],"ownerId":0,"teamId":0},"physics":{"state":[1,1,1,0,0,0],"values":{"flags":72,"sides":3,"size":42.5,"width":0,"absorbtionFactor":1,"pushFactor":8}},"position":{"state":[1,1,1,1],"values":{"x":-120,"y":80,"angle":0.7853981633974483,"flags":1}},"style":{"state":[0,1,0,1,0],"values":{"flags":1,"color":2,"borderWidth":7.5,"opacity":0.75,"zIndex":0}},"name":{"state":[0,1],"values":{"flags":0,"name":"Phase C Δ"}},"score":{"state":[1],"values":{"score":12345}},"health":{"state":[0,1,1],"values":{"flags":0,"health":0.5,"maxHealth":2}},"barrel":{"state":[0,1,0],"values":{"flags":0,"reloadTime":22,"trapezoidDirection":0}}},"afterWipe":{"entityState":0,"relations":[0,0,0],"physics":[0,0,0,0,0,0],"position":[0,0,0,0],"style":[0,0,0,0,0],"name":[0,0],"score":[0],"health":[0,0,0],"barrel":[0,0,0],"valuesPersist":{"x":-120,"y":80,"size":42.5,"name":"Phase C Δ","score":12345}},"cameraTable":{"entityState":1,"cameraState":[0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0],"statNamesState":[1,0,0,0,0,0,0,0],"statLevelsState":[1,0,0,0,0,0,0,0],"statLimitsState":[1,0,0,0,0,0,0,0],"values":{"statName0":"Reload","statLevel0":4,"statLimit0":7},"afterWipe":{"entityState":0,"cameraState":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"statNamesState":[0,0,0,0,0,0,0,0],"statLevelsState":[0,0,0,0,0,0,0,0],"statLimitsState":[0,0,0,0,0,0,0,0]}}},"compatibility":{"camera":{"followsPlayer":{"cameraX":0,"cameraY":0,"flags":1,"cameraState":[0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},"missingPlayer":{"flags":1,"usesCameraCoords":true,"cameraState":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},"compiler":{"ids":{"camera":{"className":"CameraEntity","id":0,"hash":1,"preservedHash":1,"entityState":1,"exists":true,"string":"CameraEntity <0, 1>","primitive":65536},"object":{"className":"ObjectEntity","id":1,"hash":1,"preservedHash":1,"entityState":1,"exists":true,"string":"ObjectEntity <1, 1>","primitive":65537}},"creationHex":"010101000300000503000301a001ef016400002a420203000000803f00000040010000000000000101c00700008841005068617365204320ce940001010000003f0000403f0000b0410000000000410800e44046","updateState":{"position":[1,1,0,0],"physics":[0,0,1,0,0,0],"style":[0,0,0,1,0],"health":[0,1,0],"name":[0,1],"entityState":1},"updateHex":"0101000100b40100c70103000048422c5068617365204320cea900030000803e030000003f01"}})JSON";
}
} // namespace

std::string entityCoreReportJson() {
  auto fieldsAndCompatibility = staticTail();
  fieldsAndCompatibility = replaceAll(fieldsAndCompatibility,
      "010101000300000503000301a001ef016400002a420203000000803f00000040010000000000000101c00700008841005068617365204320ce940001010000003f0000403f0000b0410000000000410800e44046",
      compilerCreationHexFixture());
  fieldsAndCompatibility = replaceAll(fieldsAndCompatibility,
      "0101000100b40100c70103000048422c5068617365204320cea900030000803e030000003f01",
      compilerUpdateHexFixture());
  return "{\"world\":" + worldReport() + ",\"manager\":" + managerReport() + ",\"fields\":" + fieldsAndCompatibility + "}";
}

} // namespace diepcustom::entity_core
