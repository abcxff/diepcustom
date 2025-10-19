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

const MAX_ENTITY_COUNT = 16384;
const BITS_PER_WORD = 32;
const WORD_SHIFT = 5; // 2^5 = 32
const SET_WORD_COUNT = Math.ceil(MAX_ENTITY_COUNT / BITS_PER_WORD);

export default class PackedEntitySet {
    public static readonly FULL_SET: PackedEntitySet = (() => {
        const set = new PackedEntitySet();
        set.data.fill(0xFFFFFFFF);
        return set;
    })();

    public readonly data: Uint32Array;
    public constructor() {
        this.data = new Uint32Array(SET_WORD_COUNT);
    }

    public add(entityId: number): void {
        const wordIndex = entityId >>> WORD_SHIFT;
        const bitIndex = entityId & 31;
        this.data[wordIndex] |= (1 << bitIndex);
    }

    public remove(entityId: number): void {
        const wordIndex = entityId >>> WORD_SHIFT;
        const bitIndex = entityId & 31;
        this.data[wordIndex] &= ~(1 << bitIndex);
    }

    public has(entityId: number): boolean {
        const wordIndex = entityId >>> WORD_SHIFT;
        const bitIndex = entityId & 31;
        return (this.data[wordIndex] & (1 << bitIndex)) !== 0;
    }

    public clear(): void {
        this.data.fill(0);
    }
}