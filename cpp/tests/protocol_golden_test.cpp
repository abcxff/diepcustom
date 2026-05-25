#include "diepcustom/protocol.hpp"

#include <cassert>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

using diepcustom::protocol::Reader;
using diepcustom::protocol::Writer;
using diepcustom::protocol::bytesToHex;
using diepcustom::protocol::hexToBytes;

namespace {
void expectHex(const std::string& name, const Writer& writer, const std::string& expected) {
    const auto actual = bytesToHex(writer.bytes());
    if (actual != expected) {
        std::cerr << name << " expected " << expected << " got " << actual << '\n';
        std::exit(1);
    }
}
}

int main() {
    expectHex("unsigned-varint-boundaries",
        [] { Writer w; for (const auto v : {0, 1, 2, 3, 10, 127, 128, 129, 255, 16384, 65535, 2147483647}) w.vu(v); return w; }(),
        "000102030a7f80018101ff01808001ffff03ffffffff07");

    expectHex("signed-varint-boundaries",
        [] { Writer w; for (const auto v : {-2000000, -129, -128, -1, 0, 1, 127, 128, 2000000}) w.vi(v); return w; }(),
        "ff91f4018102ff01010002fe0180028092f401");

    expectHex("fixed-width-little-endian", Writer().u8(0xab).u16(0xcdef).u32(0x12345678).float32(1.5f), "abefcd785634120000c03f");
    expectHex("varint-floats", [] { Writer w; for (const auto v : {-3.14159265358979323846f, -1.5f, 0.0f, 1.5f, 3.14159265358979323846f}) w.vf(v); return w; }(), "ffd885cf04fe820600fe8006ffda85cf04");
    expectHex("null-terminated-unicode", Writer().stringNT("Tank 🚀 Δ 漢字"), "54616e6b20f09f9a8020ce9420e6bca2e5ad9700");
    expectHex("raw-bytes", Writer().raw({1, 2, 3, 255}), "010203ff");

    Reader unsignedReader(hexToBytes("000102030a7f80018101ff01808001ffff03ffffffff07"));
    for (const auto expected : {0u, 1u, 2u, 3u, 10u, 127u, 128u, 129u, 255u, 16384u, 65535u, 2147483647u}) assert(unsignedReader.vu() == expected);

    Reader signedReader(hexToBytes("ff91f4018102ff01010002fe0180028092f401"));
    for (const auto expected : {-2000000, -129, -128, -1, 0, 1, 127, 128, 2000000}) assert(signedReader.vi() == expected);

    Reader fixedReader(hexToBytes("abefcd785634120000c03f"));
    assert(fixedReader.u8() == 0xab);
    assert(fixedReader.u16() == 0xcdef);
    assert(fixedReader.u32() == 0x12345678);
    assert(std::fabs(fixedReader.float32() - 1.5f) < 0.00001f);

    Reader stringReader(hexToBytes("54616e6b20f09f9a8020ce9420e6bca2e5ad9700"));
    assert(stringReader.stringNT() == "Tank 🚀 Δ 漢字");

    std::cout << "protocol golden tests passed\n";
    return 0;
}
