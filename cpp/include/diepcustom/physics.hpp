#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace diepcustom::physics {

struct Vector {
    double x = 0;
    double y = 0;

    Vector() = default;
    Vector(double x, double y);

    static bool isFinite(const Vector& vector);
    static Vector fromPolar(double theta, double distance);

    void set(const Vector& vector);
    void add(const Vector& vector);
    void subtract(const Vector& vector);
    double distanceToSQ(const Vector& vector) const;
    double magnitude() const;
    void setMagnitude(double magnitude);
    double angle() const;
    void setAngle(double angle);
};

class PackedEntitySet {
public:
    static constexpr std::size_t MaxEntityCount = 16384;
    static constexpr std::size_t BitsPerWord = 32;
    static constexpr std::size_t WordCount = MaxEntityCount / BitsPerWord;

    void add(std::uint32_t entityId);
    void remove(std::uint32_t entityId);
    bool has(std::uint32_t entityId) const;
    void clear();
    const std::array<std::uint32_t, WordCount>& data() const;
    static PackedEntitySet fullSet();

private:
    std::array<std::uint32_t, WordCount> data_{};
};

struct Entity {
    std::uint32_t id = 0;
    std::uint32_t hash = 0;
    double x = 0;
    double y = 0;
    double size = 0;
    double width = 0;
    std::uint32_t sides = 0;
};

struct Arena {
    std::int32_t width = 0;
    std::int32_t height = 0;
    std::int32_t leftX = 0;
    std::int32_t topY = 0;
};

class HashGrid {
public:
    explicit HashGrid(Arena arena, const std::vector<Entity>* entities);

    void preTick(std::uint32_t tick);
    void postTick(std::uint32_t tick);
    void insert(const Entity& entity);
    const PackedEntitySet& retrieve(double centerX, double centerY, double halfWidth, double halfHeight);
    const Entity* getFirstMatch(double centerX, double centerY, double halfWidth, double halfHeight, const std::function<bool(const Entity&)>& predicate);
    void forEachCollisionPair(const std::function<void(const Entity&, const Entity&)>& callback);

private:
    std::int32_t cellCoord(double value) const;
    std::size_t cellKey(std::int32_t x, std::int32_t y) const;
    const Entity* entityById(std::uint32_t id) const;
    void requireUnlocked(const std::string& method) const;

    Arena arena_;
    const std::vector<Entity>* entities_;
    PackedEntitySet resultSet_;
    std::uint16_t lastQueryId_ = 0;
    std::array<std::uint16_t, PackedEntitySet::MaxEntityCount> queryIdMap_{};
    bool isLocked_ = true;
    std::int32_t hashMul_ = 1;
    std::vector<std::vector<std::uint32_t>> hashMap_;
    std::vector<std::uint32_t> collisionPairsSeen_;
};

std::string physicsReportJson();

} // namespace diepcustom::physics
