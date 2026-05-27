#include "diepcustom/protocol.hpp"

#include <cstring>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace diepcustom::protocol {
namespace {
std::int32_t endianSwap(std::int32_t num) {
    const auto value = static_cast<std::uint32_t>(num);
    return static_cast<std::int32_t>(((value & 0xffu) << 24u) |
        ((value & 0xff00u) << 8u) |
        ((value >> 8u) & 0xff00u) |
        ((value >> 24u) & 0xffu));
}

std::uint8_t hexNibble(char c) {
    if (c >= '0' && c <= '9') return static_cast<std::uint8_t>(c - '0');
    if (c >= 'a' && c <= 'f') return static_cast<std::uint8_t>(10 + c - 'a');
    if (c >= 'A' && c <= 'F') return static_cast<std::uint8_t>(10 + c - 'A');
    throw std::invalid_argument("invalid hex character");
}
} // namespace

Writer& Writer::u8(std::uint32_t value) {
    buffer_.push_back(static_cast<std::uint8_t>(value & 0xffu));
    return *this;
}

Writer& Writer::u16(std::uint32_t value) {
    buffer_.push_back(static_cast<std::uint8_t>(value & 0xffu));
    buffer_.push_back(static_cast<std::uint8_t>((value >> 8u) & 0xffu));
    return *this;
}

Writer& Writer::u32(std::uint32_t value) {
    for (int shift = 0; shift < 32; shift += 8) {
        buffer_.push_back(static_cast<std::uint8_t>((value >> shift) & 0xffu));
    }
    return *this;
}

Writer& Writer::vu(std::uint32_t value) {
    do {
        auto part = value;
        value >>= 7u;
        if (value != 0u) part |= 0x80u;
        buffer_.push_back(static_cast<std::uint8_t>(part & 0xffu));
    } while (value != 0u);
    return *this;
}

Writer& Writer::vi(std::int32_t value) {
    std::uint32_t bits = 0;
    std::memcpy(&bits, &value, sizeof(bits));
    return vu((bits << 1u) ^ (0u - (bits >> 31u)));
}

Writer& Writer::vf(float value) {
    std::int32_t bits = 0;
    std::memcpy(&bits, &value, sizeof(bits));
    return vi(endianSwap(bits));
}

Writer& Writer::float32(float value) {
    std::uint32_t bits = 0;
    std::memcpy(&bits, &value, sizeof(bits));
    return u32(bits);
}

Writer& Writer::raw(std::initializer_list<std::uint8_t> bytes) {
    buffer_.insert(buffer_.end(), bytes.begin(), bytes.end());
    return *this;
}

Writer& Writer::stringNT(const std::string& value) {
    buffer_.insert(buffer_.end(), value.begin(), value.end());
    buffer_.push_back(0);
    return *this;
}

const std::vector<std::uint8_t>& Writer::bytes() const { return buffer_; }

Reader::Reader(std::vector<std::uint8_t> bytes) : buffer_(std::move(bytes)) {}

std::uint8_t Reader::u8() {
    if (at_ >= buffer_.size()) {
        ++at_;
        return 0;
    }
    return buffer_[at_++];
}

std::uint16_t Reader::u16() {
    const auto lo = u8();
    const auto hi = u8();
    return static_cast<std::uint16_t>(lo | (hi << 8u));
}

std::uint32_t Reader::u32() {
    std::uint32_t value = 0;
    for (int shift = 0; shift < 32; shift += 8) {
        value |= static_cast<std::uint32_t>(u8()) << shift;
    }
    return value;
}

std::uint32_t Reader::vu() {
    std::uint32_t out = 0;
    int shift = 0;
    while (at_ < buffer_.size() && (buffer_[at_] & 0x80u) != 0u) {
        out |= static_cast<std::uint32_t>(buffer_[at_++] & 0x7fu) << shift;
        shift += 7;
    }
    const auto byte = at_ < buffer_.size() ? buffer_[at_] : 0;
    ++at_;
    out |= static_cast<std::uint32_t>(byte & 0x7fu) << shift;
    return out;
}

std::int32_t Reader::vi() {
    const auto out = vu();
    const auto decoded = (out >> 1u) ^ (0u - (out & 1u));
    std::int32_t value = 0;
    std::memcpy(&value, &decoded, sizeof(value));
    return value;
}

float Reader::vf() {
    const auto swapped = endianSwap(vi());
    float value = 0;
    std::memcpy(&value, &swapped, sizeof(value));
    return value;
}

float Reader::float32() {
    const auto bits = u32();
    float value = 0;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
}

std::string Reader::stringNT() {
    const auto start = at_;
    while (at_ < buffer_.size() && buffer_[at_] != 0) ++at_;
    if (at_ >= buffer_.size()) {
        const auto end = buffer_.empty() || buffer_.size() <= start ? start : buffer_.size() - 1;
        at_ = start;
        return std::string(buffer_.begin() + static_cast<std::ptrdiff_t>(start), buffer_.begin() + static_cast<std::ptrdiff_t>(end));
    }
    std::string value(buffer_.begin() + static_cast<std::ptrdiff_t>(start), buffer_.begin() + static_cast<std::ptrdiff_t>(at_));
    ++at_;
    return value;
}

std::size_t Reader::position() const { return at_; }

std::vector<std::uint8_t> hexToBytes(const std::string& hex) {
    if (hex.size() % 2 != 0) throw std::invalid_argument("hex length must be even");
    std::vector<std::uint8_t> bytes;
    bytes.reserve(hex.size() / 2);
    for (std::size_t i = 0; i < hex.size(); i += 2) {
        bytes.push_back(static_cast<std::uint8_t>((hexNibble(hex[i]) << 4u) | hexNibble(hex[i + 1])));
    }
    return bytes;
}

std::string bytesToHex(const std::vector<std::uint8_t>& bytes) {
    std::ostringstream out;
    out << std::hex << std::setfill('0');
    for (const auto byte : bytes) out << std::setw(2) << static_cast<int>(byte);
    return out.str();
}

} // namespace diepcustom::protocol
