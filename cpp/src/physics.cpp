#include "diepcustom/physics.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace diepcustom::physics {
namespace {
constexpr int CellShift = 8;
constexpr int CellSize = 1 << CellShift;
constexpr std::size_t MaxEntityCount = PackedEntitySet::MaxEntityCount;

std::string number(double value) {
    if (std::isnan(value)) return "\"NaN\"";
    if (value == std::numeric_limits<double>::infinity()) return "\"Infinity\"";
    if (value == -std::numeric_limits<double>::infinity()) return "\"-Infinity\"";
    const double rounded = std::round(value * 1000000.0) / 1000000.0;
    std::ostringstream out;
    out << std::setprecision(15) << rounded;
    return out.str();
}

std::string boolean(bool value) { return value ? "true" : "false"; }

std::string vectorJson(const Vector& vector) {
    std::ostringstream out;
    out << "{\"x\":" << number(vector.x)
        << ",\"y\":" << number(vector.y)
        << ",\"magnitude\":" << number(vector.magnitude())
        << ",\"angle\":" << number(vector.angle())
        << ",\"finite\":" << boolean(Vector::isFinite(vector)) << "}";
    return out.str();
}

std::string escape(const std::string& input) {
    std::ostringstream out;
    for (const char c : input) {
        if (c == '"') out << "\\\"";
        else if (c == '\\') out << "\\\\";
        else out << c;
    }
    return out.str();
}

std::string idsJson(const PackedEntitySet& set, const std::vector<int>& probes) {
    std::ostringstream out;
    out << "[";
    bool first = true;
    for (const auto id : probes) {
        if (set.has(id)) {
            if (!first) out << ",";
            first = false;
            out << id;
        }
    }
    out << "]";
    return out.str();
}
} // namespace

Vector::Vector(double xValue, double yValue) : x(xValue), y(yValue) {}
bool Vector::isFinite(const Vector& vector) { return std::isfinite(vector.x) && std::isfinite(vector.y); }
Vector Vector::fromPolar(double theta, double distance) { return {distance * std::cos(theta), distance * std::sin(theta)}; }
void Vector::set(const Vector& vector) { x = vector.x; y = vector.y; }
void Vector::add(const Vector& vector) { x += vector.x; y += vector.y; }
void Vector::subtract(const Vector& vector) { x -= vector.x; y -= vector.y; }
double Vector::distanceToSQ(const Vector& vector) const { return std::pow(vector.x - x, 2) + std::pow(vector.y - y, 2); }
double Vector::magnitude() const { return std::sqrt(std::pow(x, 2) + std::pow(y, 2)); }
void Vector::setMagnitude(double value) { const auto currentDir = angle(); set({std::cos(currentDir) * value, std::sin(currentDir) * value}); }
double Vector::angle() const { return std::atan2(y, x); }
void Vector::setAngle(double value) { const auto currentMag = magnitude(); set({std::cos(value) * currentMag, std::sin(value) * currentMag}); }

void PackedEntitySet::add(std::uint32_t entityId) {
    if (entityId >= MaxEntityCount) return;
    data_[entityId >> 5u] |= (1u << (entityId & 31u));
}
void PackedEntitySet::remove(std::uint32_t entityId) {
    if (entityId >= MaxEntityCount) return;
    data_[entityId >> 5u] &= ~(1u << (entityId & 31u));
}
bool PackedEntitySet::has(std::uint32_t entityId) const {
    return entityId < MaxEntityCount && (data_[entityId >> 5u] & (1u << (entityId & 31u))) != 0;
}
void PackedEntitySet::clear() { data_.fill(0); }
const std::array<std::uint32_t, PackedEntitySet::WordCount>& PackedEntitySet::data() const { return data_; }
PackedEntitySet PackedEntitySet::fullSet() { PackedEntitySet set; set.data_.fill(0xffffffffu); return set; }

HashGrid::HashGrid(Arena arena, const std::vector<Entity>* entities)
    : arena_(arena), entities_(entities), collisionPairsSeen_(MaxEntityCount * (MaxEntityCount - 1) / 2 / 32) {}

void HashGrid::preTick(std::uint32_t) {
    const auto widthInCells = (arena_.width + (CellSize - 1)) >> CellShift;
    const auto heightInCells = (arena_.height + (CellSize - 1)) >> CellShift;
    hashMul_ = widthInCells;
    hashMap_.clear();
    hashMap_.resize(static_cast<std::size_t>(widthInCells * heightInCells));
    queryIdMap_.fill(0);
    lastQueryId_ = 0;
    isLocked_ = false;
}

void HashGrid::postTick(std::uint32_t) {
    isLocked_ = true;
    hashMap_.clear();
}

std::int32_t HashGrid::cellCoord(double value) const { return static_cast<std::int32_t>(value) >> CellShift; }
std::size_t HashGrid::cellKey(std::int32_t x, std::int32_t y) const { return static_cast<std::size_t>(std::abs(x + (y * hashMul_))); }
const Entity* HashGrid::entityById(std::uint32_t id) const { return id < entities_->size() ? &(*entities_)[id] : nullptr; }
void HashGrid::requireUnlocked(const std::string& method) const { if (isLocked_) throw std::runtime_error("HashGrid is locked! Cannot " + method); }

void HashGrid::insert(const Entity& entity) {
    requireUnlocked("insert() entity outside of tick");
    if (entity.id >= MaxEntityCount) return;
    const bool isLine = entity.sides == 2;
    const auto halfWidth = isLine ? entity.size / 2 : entity.size;
    const auto halfHeight = isLine ? entity.width / 2 : entity.size;
    const auto topX = cellCoord(entity.x - halfWidth - arena_.leftX);
    const auto topY = cellCoord(entity.y - halfHeight - arena_.topY);
    const auto bottomX = cellCoord(entity.x + halfWidth - arena_.leftX);
    const auto bottomY = cellCoord(entity.y + halfHeight - arena_.topY);
    for (auto y = topY; y <= bottomY; ++y) {
        for (auto x = topX; x <= bottomX; ++x) {
            const auto key = cellKey(x, y);
            if (key >= hashMap_.size()) hashMap_.resize(key + 1);
            hashMap_[key].push_back(entity.id);
        }
    }
}

const PackedEntitySet& HashGrid::retrieve(double centerX, double centerY, double halfWidth, double halfHeight) {
    requireUnlocked("retrieve() entity outside of tick");
    resultSet_.clear();
    const auto startX = cellCoord(centerX - halfWidth - arena_.leftX);
    const auto startY = cellCoord(centerY - halfHeight - arena_.topY);
    const auto endX = cellCoord(centerX + halfWidth - arena_.leftX);
    const auto endY = cellCoord(centerY + halfHeight - arena_.topY);
    const auto queryId = lastQueryId_ == 0xffffu ? static_cast<std::uint16_t>(1) : static_cast<std::uint16_t>(lastQueryId_ + 1);
    lastQueryId_ = queryId;
    for (auto y = startY; y <= endY; ++y) {
        for (auto x = startX; x <= endX; ++x) {
            const auto key = cellKey(x, y);
            if (key >= hashMap_.size()) continue;
            for (const auto entityId : hashMap_[key]) {
                if (entityId >= MaxEntityCount) continue;
                if (queryIdMap_[entityId] == queryId) continue;
                queryIdMap_[entityId] = queryId;
                const auto* entity = entityById(entityId);
                if (!entity || entity->hash == 0) continue;
                resultSet_.add(entityId);
            }
        }
    }
    return resultSet_;
}

const Entity* HashGrid::getFirstMatch(double centerX, double centerY, double halfWidth, double halfHeight, const std::function<bool(const Entity&)>& predicate) {
    requireUnlocked("getFirstMatch() outside of tick");
    const auto startX = cellCoord(centerX - halfWidth - arena_.leftX);
    const auto startY = cellCoord(centerY - halfHeight - arena_.topY);
    const auto endX = cellCoord(centerX + halfWidth - arena_.leftX);
    const auto endY = cellCoord(centerY + halfHeight - arena_.topY);
    const auto queryId = lastQueryId_ == 0xffffu ? static_cast<std::uint16_t>(1) : static_cast<std::uint16_t>(lastQueryId_ + 1);
    lastQueryId_ = queryId;
    for (auto y = startY; y <= endY; ++y) {
        for (auto x = startX; x <= endX; ++x) {
            const auto key = cellKey(x, y);
            if (key >= hashMap_.size()) continue;
            for (const auto entityId : hashMap_[key]) {
                if (entityId >= MaxEntityCount) continue;
                if (queryIdMap_[entityId] == queryId) continue;
                queryIdMap_[entityId] = queryId;
                const auto* entity = entityById(entityId);
                if (!entity || entity->hash == 0) continue;
                if (predicate(*entity)) return entity;
            }
        }
    }
    return nullptr;
}

void HashGrid::forEachCollisionPair(const std::function<void(const Entity&, const Entity&)>& callback) {
    requireUnlocked("forEachCollisionPair() entity outside of tick");
    std::fill(collisionPairsSeen_.begin(), collisionPairsSeen_.end(), 0);
    for (const auto& cell : hashMap_) {
        if (cell.size() < 2) continue;
        for (std::size_t a = 0; a < cell.size() - 1; ++a) {
            const auto eidA = cell[a];
            if (eidA >= MaxEntityCount) continue;
            const auto* entityA = entityById(eidA);
            if (!entityA || entityA->hash == 0) continue;
            for (std::size_t b = a + 1; b < cell.size(); ++b) {
                const auto eidB = cell[b];
                if (eidA == eidB) continue;
                if (eidB >= MaxEntityCount) continue;
                const auto* entityB = entityById(eidB);
                if (!entityB || entityB->hash == 0) continue;
                const auto idA = std::min(eidA, eidB);
                const auto idB = std::max(eidA, eidB);
                const auto* entA = eidA < eidB ? entityA : entityB;
                const auto* entB = eidA < eidB ? entityB : entityA;
                const auto triangularIndex = static_cast<std::size_t>(idB * (idB - 1) / 2 + idA);
                const auto arrayIndex = triangularIndex >> 5u;
                const auto bitIndex = triangularIndex & 31u;
                const auto bitMask = 1u << bitIndex;
                if ((collisionPairsSeen_[arrayIndex] & bitMask) != 0) continue;
                collisionPairsSeen_[arrayIndex] |= bitMask;
                callback(*entA, *entB);
            }
        }
    }
}

std::string physicsReportJson() {
    std::ostringstream out;
    Vector base(3, 4);
    Vector afterSet; afterSet.set({-8, 9});
    Vector afterAdd(3, 4); afterAdd.add({-1, 2});
    Vector afterSubtract(3, 4); afterSubtract.subtract({10, -3});
    Vector angleSet(3, 4); angleSet.setAngle(3.14159265358979323846 / 2);
    Vector magnitudeSet(3, 4); magnitudeSet.setMagnitude(10);
    Vector zeroMagnitude(0, 0); zeroMagnitude.setMagnitude(5);
    Vector polar = Vector::fromPolar(3.14159265358979323846 / 6, 12);
    Vector nonFinite(std::numeric_limits<double>::infinity(), std::numeric_limits<double>::quiet_NaN());

    out << "{\n  \"vector\": {";
    out << "\n    \"base\": " << vectorJson(base) << ",";
    out << "\n    \"afterSet\": " << vectorJson(afterSet) << ",";
    out << "\n    \"afterAdd\": " << vectorJson(afterAdd) << ",";
    out << "\n    \"afterSubtract\": " << vectorJson(afterSubtract) << ",";
    out << "\n    \"distanceToSQ\": " << number(base.distanceToSQ({-1, 7})) << ",";
    out << "\n    \"angleSet\": " << vectorJson(angleSet) << ",";
    out << "\n    \"magnitudeSet\": " << vectorJson(magnitudeSet) << ",";
    out << "\n    \"zeroMagnitude\": " << vectorJson(zeroMagnitude) << ",";
    out << "\n    \"polar\": " << vectorJson(polar) << ",";
    out << "\n    \"finiteChecks\": [" << boolean(Vector::isFinite(base)) << "," << boolean(Vector::isFinite(nonFinite)) << "]\n  },";

    PackedEntitySet set;
    for (const auto id : {0, 1, 31, 32, 33, 1024, 16383}) set.add(id);
    set.remove(32);
    const std::vector<int> probes{0, 1, 2, 31, 32, 33, 1024, 16383};
    out << "\n  \"packedEntitySet\": {\n    \"beforeClear\": [";
    for (std::size_t i = 0; i < probes.size(); ++i) { if (i) out << ","; out << "[" << probes[i] << "," << boolean(set.has(probes[i])) << "]"; }
    out << "],\n    \"firstWords\": [";
    for (std::size_t i = 0; i < 35; ++i) { if (i) out << ","; out << set.data()[i]; }
    out << "],";
    set.clear();
    out << "\n    \"afterClear\": [";
    for (std::size_t i = 0; i < probes.size(); ++i) { if (i) out << ","; out << "[" << probes[i] << "," << boolean(set.has(probes[i])) << "]"; }
    const auto full = PackedEntitySet::fullSet();
    out << "],\n    \"fullSetHas\": [[0," << boolean(full.has(0)) << "],[31," << boolean(full.has(31)) << "],[32," << boolean(full.has(32)) << "],[16383," << boolean(full.has(16383)) << "]]\n  },";

    std::vector<Entity> entities(6);
    entities[1] = {1, 1001, -300, -100, 30, 30, 4};
    entities[2] = {2, 1002, -275, -105, 20, 20, 4};
    entities[3] = {3, 1003, 260, 100, 40, 40, 4};
    entities[4] = {4, 1004, 0, 0, 200, 20, 2};
    entities[5] = {5, 0, -300, -100, 10, 10, 4};
    HashGrid grid({1024, 768, -512, -384}, &entities);
    std::string lockedInsert;
    try { grid.insert(entities[1]); lockedInsert = "no-error"; } catch (const std::exception& error) { lockedInsert = error.what(); }
    grid.preTick(1);
    for (const auto id : {1, 2, 3, 4, 5}) grid.insert(entities[id]);
    const auto nearCluster = idsJson(grid.retrieve(-300, -100, 80, 80), {0, 1, 2, 3, 4, 5});
    const auto wholeArena = idsJson(grid.retrieve(0, 0, 600, 500), {0, 1, 2, 3, 4, 5});
    const auto lineEntity = idsJson(grid.retrieve(0, 0, 130, 30), {0, 1, 2, 3, 4, 5});
    const auto* firstAny = grid.getFirstMatch(-300, -100, 80, 80, [](const Entity&) { return true; });
    const auto* firstLargeId = grid.getFirstMatch(-512, -384, 1024, 768, [](const Entity& e) { return e.id >= 3; });
    std::vector<std::array<std::uint32_t, 2>> pairs;
    grid.forEachCollisionPair([&pairs](const Entity& a, const Entity& b) { pairs.push_back({a.id, b.id}); });
    grid.postTick(1);
    std::string lockedRetrieve;
    try { grid.retrieve(0, 0, 1, 1); lockedRetrieve = "no-error"; } catch (const std::exception& error) { lockedRetrieve = error.what(); }

    out << "\n  \"hashGrid\": {";
    out << "\n    \"lockedInsert\": \"" << escape(lockedInsert) << "\",";
    out << "\n    \"nearCluster\": " << nearCluster << ",";
    out << "\n    \"wholeArena\": " << wholeArena << ",";
    out << "\n    \"lineEntity\": " << lineEntity << ",";
    out << "\n    \"firstAny\": " << (firstAny ? std::to_string(firstAny->id) : "null") << ",";
    out << "\n    \"firstLargeId\": " << (firstLargeId ? std::to_string(firstLargeId->id) : "null") << ",";
    out << "\n    \"pairs\": [";
    for (std::size_t i = 0; i < pairs.size(); ++i) { if (i) out << ","; out << "[" << pairs[i][0] << "," << pairs[i][1] << "]"; }
    out << "],";
    out << "\n    \"lockedRetrieve\": \"" << escape(lockedRetrieve) << "\"\n  }\n}\n";
    return out.str();
}

} // namespace diepcustom::physics
