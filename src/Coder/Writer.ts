/*
    DiepCustom - custom tank game server that shares diep.io's WebSocket protocol
    Copyright (C) 2022 ABCxFF (github.com/ABCxFF)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program. If not, see <https://www.gnu.org/licenses/>
*/

import { writtenBufferChunkSize } from "../config";

/**
 * UNDOCUMENTED FILE
 **/

const convo = new ArrayBuffer(4);
const i32 = new Int32Array(convo);
const f32 = new Float32Array(convo);

const Encoder: TextEncoder = new TextEncoder();

const endianSwap = (num: number) =>
    ((num & 0xff) << 24) |
    ((num & 0xff00) << 8) |
    ((num >> 8) & 0xff00) |
    ((num >> 24) & 0xff);

export default class Writer {
    // TODO(ABC):
    // Code a compressor (The previous was not OOP and used lz4js code)
    // If this code gets out of bounds (only happens if you play around with dev too much), the server crashes [better than out of bounds r/w].
    // 
    // TEMP FIX - 2022/11/11:
    //   OUTPUT_BUFFER now gets resized if running out of space for the packet
    //
    // TEMP FIX 2 - 2022/11/13:
    //   OUTPUT_BUFFER gets sent out in chunks (see Client.ts for more info)
    protected static OUTPUT_BUFFER = Buffer.alloc(writtenBufferChunkSize);
    protected _at: number = 0;

    protected get at() {
        return this._at;
    }

    protected set at(v) {
        this._at = v;

        if (Writer.OUTPUT_BUFFER.length <= this._at + 5) {
            const newBuffer = Buffer.alloc(Writer.OUTPUT_BUFFER.length + writtenBufferChunkSize);
            newBuffer.set(Writer.OUTPUT_BUFFER, 0);

            Writer.OUTPUT_BUFFER = newBuffer;
        }
    }

    public u8(val: number) {
        Writer.OUTPUT_BUFFER.writeUInt8(val >>> 0 & 0xFF, this.at);
        this.at += 1;
        return this;
    }
    public u16(val: number) {
        Writer.OUTPUT_BUFFER.writeUint16LE(val >>> 0 & 0xFFFF, this.at);
        this.at += 2;
        return this;
    }
    public u32(val: number) {
        Writer.OUTPUT_BUFFER.writeUint32LE(val >>> 0, this.at);
        this.at += 4;
        return this;
    }
    public float(val: number) {
        Writer.OUTPUT_BUFFER.writeFloatLE(val, this.at);
        this.at += 4;
        return this;
    }
    public vf(val: number) {
        f32[0] = val;

        return this.vi(endianSwap(i32[0]));
    }
    public vu(val: number) {
        val |= 0;

        do {
            let part = val;
            val >>>= 7;
            if (val) part |= 0x80;
            Writer.OUTPUT_BUFFER.writeUint8(part >>> 0 & 0xFF, this.at);
            this.at += 1;
        } while (val);

        // OUTPUT_BUFFER.set(buf.subarray(0, at), (this.at += at) - at);
        return this;
    }
    public vi(val: number) {
        val |= 0;
        return this.vu((0 - (val < 0 ? 1 : 0)) ^ (val << 1)); // varsint trick
    }
    public bytes(buffer: Uint8Array) {
        Writer.OUTPUT_BUFFER.set(buffer, this.at);
        this.at += buffer.byteLength;
        return this;
    }
    public raw(...data: number[]) {
        Writer.OUTPUT_BUFFER.set(data, this.at)
        this.at += data.length;
        return this;
    }
    public float64Precision(float: number) {
        return this.vi(float * 64)
    }
    public degrees(degrees: number) {
        degrees *= Math.PI / 180
        return this.vi(degrees * 64)
    }
    public stringNT(str: string) {
        const bytes = Encoder.encode(str + "\x00");
        // TODO(ABC): See line 69 Client.ts
        // rn it sends string out in bytes, send it all at once without messing up the chunking
        for (let i = 0; i < bytes.byteLength; ++i) {
            Writer.OUTPUT_BUFFER[this.at] = bytes[i];
            this.at += 1;
        }

        return this;
    }
    public entid(entity: null | {hash: number, id: number}) {
        if (!entity || entity.hash === 0) return this.u8(0);
        return this.vu(entity.hash).vu(entity.id);
    }
    public write(slice: boolean=false): Buffer {
        if (slice) return Writer.OUTPUT_BUFFER.slice(0, this.at);
        
        return Writer.OUTPUT_BUFFER.subarray(0, this.at);
    }
}
