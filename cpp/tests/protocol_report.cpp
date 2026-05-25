#include "diepcustom/protocol.hpp"

#include <cmath>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using diepcustom::protocol::Reader;
using diepcustom::protocol::Writer;
using diepcustom::protocol::bytesToHex;
using diepcustom::protocol::hexToBytes;

namespace {
std::string jsonEscape(const std::string& input) {
    std::ostringstream out;
    for (const unsigned char c : input) {
        switch (c) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (c < 0x20) out << "\\u00" << std::hex << static_cast<int>(c) << std::dec;
                else out << c;
        }
    }
    return out.str();
}

void printStringResult(const std::string& name, const std::string& hex) {
    Reader reader(hexToBytes(hex));
    try {
        const auto value = reader.stringNT();
        std::cout << "    {\"name\":\"" << name << "\",\"ok\":true,\"value\":\"" << jsonEscape(value) << "\",\"at\":" << reader.position() << "}";
    } catch (const std::exception& error) {
        std::cout << "    {\"name\":\"" << name << "\",\"ok\":false,\"error\":\"Error\",\"message\":\"" << jsonEscape(error.what()) << "\"}";
    }
}

template <typename Read>
void printNumberResult(const std::string& name, const std::string& hex, Read read) {
    Reader reader(hexToBytes(hex));
    try {
        const auto value = read(reader);
        std::cout << "    {\"name\":\"" << name << "\",\"ok\":true,\"value\":" << value << ",\"at\":" << reader.position() << "}";
    } catch (const std::exception& error) {
        std::cout << "    {\"name\":\"" << name << "\",\"ok\":false,\"error\":\"Error\",\"message\":\"" << jsonEscape(error.what()) << "\"}";
    }
}
}

int main() {
    std::cout << "{\n  \"encoder\": {\n";
    std::cout << "    \"unsigned-varint-boundaries\": \"" << bytesToHex([] { Writer w; for (const auto v : {0, 1, 2, 3, 10, 127, 128, 129, 255, 16384, 65535, 2147483647}) w.vu(v); return w; }().bytes()) << "\",\n";
    std::cout << "    \"signed-varint-boundaries\": \"" << bytesToHex([] { Writer w; for (const auto v : {-2000000, -129, -128, -1, 0, 1, 127, 128, 2000000}) w.vi(v); return w; }().bytes()) << "\",\n";
    std::cout << "    \"fixed-width-little-endian\": \"" << bytesToHex(Writer().u8(0xab).u16(0xcdef).u32(0x12345678).float32(1.5f).bytes()) << "\",\n";
    std::cout << "    \"varint-floats\": \"" << bytesToHex([] { Writer w; for (const auto v : {-3.14159265358979323846f, -1.5f, 0.0f, 1.5f, 3.14159265358979323846f}) w.vf(v); return w; }().bytes()) << "\",\n";
    std::cout << "    \"null-terminated-unicode\": \"" << bytesToHex(Writer().stringNT("Tank 🚀 Δ 漢字").bytes()) << "\",\n";
    std::cout << "    \"raw-bytes\": \"" << bytesToHex(Writer().raw({1, 2, 3, 255}).bytes()) << "\"\n";
    std::cout << "  },\n  \"boundaryDecode\": [\n";
    printNumberResult("empty-vu", "", [](Reader& r) { return r.vu(); }); std::cout << ",\n";
    printNumberResult("truncated-vu-continuation", "80", [](Reader& r) { return r.vu(); }); std::cout << ",\n";
    printStringResult("empty-stringNT", "00"); std::cout << ",\n";
    printStringResult("unterminated-stringNT", "6162"); std::cout << ",\n";
    { Reader reader(hexToBytes("")); reader.u8(); std::cout << "    {\"name\":\"fixed-empty-buffer-u8\",\"ok\":true,\"at\":" << reader.position() << "}"; } std::cout << "\n";
    std::cout << "  ]\n}\n";
    return 0;
}
