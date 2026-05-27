#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace diepcustom::protocol {

class Writer {
public:
    Writer& u8(std::uint32_t value);
    Writer& u16(std::uint32_t value);
    Writer& u32(std::uint32_t value);
    Writer& vu(std::uint32_t value);
    Writer& vi(std::int32_t value);
    Writer& vf(float value);
    Writer& float32(float value);
    Writer& raw(std::initializer_list<std::uint8_t> bytes);
    Writer& stringNT(const std::string& value);

    const std::vector<std::uint8_t>& bytes() const;

private:
    std::vector<std::uint8_t> buffer_;
};

class Reader {
public:
    explicit Reader(std::vector<std::uint8_t> bytes);

    std::uint8_t u8();
    std::uint16_t u16();
    std::uint32_t u32();
    std::uint32_t vu();
    std::int32_t vi();
    float vf();
    float float32();
    std::string stringNT();
    std::size_t position() const;

private:
    std::vector<std::uint8_t> buffer_;
    std::size_t at_ = 0;
};

std::vector<std::uint8_t> hexToBytes(const std::string& hex);
std::string bytesToHex(const std::vector<std::uint8_t>& bytes);

} // namespace diepcustom::protocol
