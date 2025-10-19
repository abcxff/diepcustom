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

import ObjectEntity from "../Entity/Object";
import GameServer from "../Game";
import CollisionManager from "./CollisionManager";
import PackedEntitySet from "./PackedEntitySet";

const CELL_SHIFT = 8;
const CELL_SIZE = 1 << CELL_SHIFT;
const MAX_ENTITY_COUNT = 16384;
const MAX_ENTITY_ID_BITS = 14;

export default class HashGrid implements CollisionManager {
    private game: GameServer;

    // Used to localize result value of HashGrid methods
    private resultSet: PackedEntitySet = new PackedEntitySet();
    // TODO: Might not need this alongside resultSet
    private lastQueryId = 0;
    private queryIdMap = new Uint16Array(16384);

    // The following gets initialized by first .preTick() call
    private isLocked = true;
    private hashMul: number = 1;
    private hashMap: number[][] = [];
    private gameLeftX: number = 0;
    private gameTopY: number = 0
    private collisionPairsSeen = new Uint32Array(MAX_ENTITY_COUNT * MAX_ENTITY_COUNT / 32)

    public constructor(game: GameServer) {
        this.game = game;
    }

    public preTick(tick: number): void {
        const widthInCells = (this.game.arena.width + (CELL_SIZE - 1)) >> CELL_SHIFT;
        const heightInCells = (this.game.arena.height + (CELL_SIZE - 1)) >> CELL_SHIFT;
        this.hashMul = widthInCells >> CELL_SHIFT;
        this.hashMap = Array(widthInCells * heightInCells);
        this.queryIdMap.fill(0);
        this.lastQueryId = 0;
        this.gameLeftX = this.game.arena.arenaData.values.leftX;
        this.gameTopY = this.game.arena.arenaData.values.topY;
        this.isLocked = false;
    }

    public postTick(tick: number): void {
        this.isLocked = true;
        this.hashMap.length = 0;
    }

    public insert(entity: ObjectEntity) {
        if (this.isLocked) throw new Error("HashGrid is locked! Cannot insert entity outside of tick");
        const { sides, size, width } = entity.physicsData.values;
        const { x, y } = entity.positionData.values;
        const isLine = sides === 2;
        const halfWidth = isLine ? size / 2 : size;
        const halfHeight = isLine ? width / 2 : size;
        
        const topX = (x - halfWidth - this.gameLeftX) >> CELL_SHIFT;
        const topY = (y - halfHeight - this.gameTopY) >> CELL_SHIFT;
        const bottomX = (x + halfWidth - this.gameLeftX) >> CELL_SHIFT;
        const bottomY = (y + halfHeight - this.gameTopY) >> CELL_SHIFT;

        // Iterating over the y axis first is more cache friendly.
        for(let y = topY; y <= bottomY; ++y) {
            for(let x = topX; x <= bottomX; ++x) {
                // TODO: Ensure non-negative keys
                const key = Math.abs(x + (y * this.hashMul));
                const cell = this.hashMap[key];
                if (!cell) {
                    this.hashMap[key] = [entity.id];
                } else {
                    cell.push(entity.id);
                }
            }
        }
    }

    public retrieve(
        centerX: number,
        centerY: number,
        halfWidth: number,
        halfHeight: number
    ): PackedEntitySet {
        if (this.isLocked) throw new Error("HashGrid is locked! Cannot insert entity outside of tick");
        const result = this.resultSet;
        result.clear();

        const startX = (centerX - halfWidth - this.gameLeftX) >> CELL_SHIFT;
        const startY = (centerY - halfHeight - this.gameTopY) >> CELL_SHIFT;
        const endX = (centerX + halfWidth - this.gameLeftX) >> CELL_SHIFT;
        const endY = (centerY + halfHeight - this.gameTopY) >> CELL_SHIFT;

        // Maintain within [1, 65536] range
        const queryId = this.lastQueryId === 0xFFFF ? 1 : this.lastQueryId + 1;
        this.lastQueryId = queryId;

        for (let y = startY; y <= endY; ++y) {
            for (let x = startX; x <= endX; ++x) {
                // TODO: Ensure non-negative keys
                const key = Math.abs(x + (y * this.hashMul));
                const cell = this.hashMap[key];
                if (!cell) continue;
                for (let i = 0; i < cell.length; ++i) {
                    const entityId = cell[i];
                    // Skip already added entities
                    if (this.queryIdMap[entityId] === queryId) continue;
                    this.queryIdMap[entityId] = queryId
                    const entity = this.game.entities.inner[entityId] as ObjectEntity;
                    // Skip deleted entities
                    if (!entity || entity.hash === 0) continue;
                    result.add(entityId);
                }
            }
        }

        return result;
    }

    public getFirstMatch(
        centerX: number,
        centerY: number,
        halfWidth: number,
        halfHeight: number,
        predicate: (entity: ObjectEntity) => boolean
    ): ObjectEntity | null {
        if (this.isLocked) throw new Error("HashGrid is locked! Cannot insert entity outside of tick");

        const startX = (centerX - halfWidth - this.gameLeftX) >> CELL_SHIFT;
        const startY = (centerY - halfHeight - this.gameTopY) >> CELL_SHIFT;
        const endX = (centerX + halfWidth - this.gameLeftX) >> CELL_SHIFT;
        const endY = (centerY + halfHeight - this.gameTopY) >> CELL_SHIFT;


        // Maintain within [1, 65536] range
        const queryId = this.lastQueryId === 0xFFFF ? 1 : this.lastQueryId + 1;
        this.lastQueryId = queryId;

        for (let y = startY; y <= endY; ++y) {
            for (let x = startX; x <= endX; ++x) {
                // TODO: Ensure non-negative keys
                const key = Math.abs(x + (y * this.hashMul));
                const cell = this.hashMap[key];
                if (!cell) continue;
                for (let i = 0; i < cell.length; ++i) {
                    const entityId = cell[i];
                    // Skip already added entities
                    if (this.queryIdMap[entityId] === queryId) continue;
                    this.queryIdMap[entityId] = queryId;

                    const entity = this.game.entities.inner[entityId] as ObjectEntity;
                    // Skip deleted entities
                    if (!entity || entity.hash === 0) continue;
                    
                    if (predicate(entity)) {
                        return entity;
                    }
                }
            }
        }

        return null;
    }

    // No longer used
    public retrieveEntitiesByEntity(entity: ObjectEntity): PackedEntitySet {
        if (this.isLocked) throw new Error("HashGrid is locked! Cannot insert entity outside of tick");
        const { sides, size, width } = entity.physicsData.values;
        const { x, y } = entity.positionData;
        const isLine = sides === 2;
        const halfWidth = isLine ? size / 2 : size;
        const halfHeight = isLine ? width / 2 : size;
        return this.retrieve(x, y, halfWidth, halfHeight);
    }

    public forEachCollisionPair(
        callback: (entityA: ObjectEntity, entityB: ObjectEntity) => void
    ): void {
        if (this.isLocked) throw new Error("HashGrid is locked! Cannot insert entity outside of tick");

        const collisionsSeen = this.collisionPairsSeen;
        collisionsSeen.fill(0);

        for (let i = 0; i < this.hashMap.length; ++i) {
            const cell = this.hashMap[i];
            if (!cell || cell.length < 2) continue;

            for (let a = 0; a < cell.length - 1; ++a) {
                const eidA = cell[a];
                const entityA = this.game.entities.inner[eidA] as ObjectEntity;
                if (!entityA || entityA.hash === 0) continue;

                for (let b = a + 1; b < cell.length; ++b) {
                    const eidB = cell[b];
                    // Prevent inter-cell duplicates
                    if (eidA === eidB) continue;
                    const entityB = this.game.entities.inner[eidB] as ObjectEntity;
                    if (!entityB || entityB.hash === 0) continue;

                    if (eidA < eidB) {
                        // Prevent extra-cell duplicates
                        const pairHash = (eidA << MAX_ENTITY_ID_BITS) | eidB;
                        const pairHashIndex = pairHash >>> 5;
                        const pairHashBit = 1 << (pairHash & 31);
                        if ((collisionsSeen[pairHashIndex] & pairHashBit) !== 0) continue;
                        collisionsSeen[pairHashIndex] |= pairHashBit;

                        // Ensure (x, y) -> x.id < y.id
                        callback(entityA, entityB);
                    } else {
                        // Prevent extra-cell duplicates
                        const pairHash = (eidB << MAX_ENTITY_ID_BITS) | eidA;
                        const pairHashIndex = pairHash >>> 5;
                        const pairHashBit = 1 << (pairHash & 31);
                        if ((collisionsSeen[pairHashIndex] & pairHashBit) !== 0) continue;
                        collisionsSeen[pairHashIndex] |= pairHashBit;

                        // Ensure (x, y) -> x.id < y.id
                        callback(entityB, entityA);
                    }
                
                }
            }
        }
    }
}
