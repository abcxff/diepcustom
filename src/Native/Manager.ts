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

import * as config from "../config";
import GameServer from "../Game";
import ObjectEntity from "../Entity/Object";

import CollisionManager from "../Physics/CollisionManager";
import SpatialHashing from "../Physics/SpatialHashing";
import DiepQuadTree from "../Physics/QuadTree";

import { CameraEntity } from "./Camera";
import { Entity } from "./Entity";
import { AI } from "../Entity/AI";
import { removeFast } from "../util";

/**
 * Manages all entities in the game.
 */
export default class EntityManager {
    /** The current game. */
    public game: GameServer;
    /** Quad tree or Spatial Hashing system. Used to organize ObjectEntitys. */
    public collisionManager: CollisionManager;

    /** Keeps a count of how many objects existed. */
    public zIndex = 0;

    /** Array of all camera entities. */
    public cameras: number[] = [];
    /** List of all not ObjectEntitys */
    public otherEntities: number[] = [];
    /** List of all global entities ids, such as maze walls and team bases. */
    public globalEntities: number[] = [];
    /** List of all Entitys. */
    public inner: (Entity | null)[] = Array(16384);
    /** List of all AIs. */
    public AIs: AI[] = [];

    /** The current hash for each id.  */
    public hashTable = new Uint8Array(16384);
    /** The last used ID */
    public lastId = -1;

    public constructor(game: GameServer) {
        this.game = game;
        this.collisionManager = config.spatialHashingCellSize ? new SpatialHashing(config.spatialHashingCellSize) : new DiepQuadTree(0, 0);
    }

    /** Adds an entity to the system. */
    public add(entity: Entity) {
        const lastId = this.lastId + 1;
        // Until it can find a free id, it goes up.
        for (let id = 0; id <= lastId; ++id) {
            if (this.inner[id]) continue;

            entity.id = id;
            entity.hash = entity.preservedHash = this.hashTable[id] += 1;
            this.inner[id] = entity;
            

            if (this.collisionManager && entity instanceof ObjectEntity) {
            } else if (entity instanceof CameraEntity) this.cameras.push(id);
            else this.otherEntities.push(id);

            if (this.lastId < id) this.lastId = entity.id;

            return entity;
        }

        throw new Error("OOEI: Out Of Entity IDs"); // joy
    }

    /** Removes an entity from the system. */
    public delete(id: number) {
        const entity = this.inner[id];

        if (!entity) throw new RangeError("Deleting entity that isn't in the game?");
        entity.hash = 0;

        if (this.collisionManager && entity instanceof ObjectEntity) {
            // Nothing I guess
        } else if (entity instanceof CameraEntity) removeFast(this.cameras, this.cameras.indexOf(id));
        else removeFast(this.otherEntities, this.otherEntities.indexOf(id));

        // TODO(speed)[not super important]:
        // possibly use removeFast instead of leaving these wholes in the entity array
        this.inner[id] = null;
    }

    /** Wipes all entities from the game. */
    public clear() {
        this.lastId = -1;
        this.collisionManager.reset(0, 0);
        this.hashTable.fill(0);
        this.AIs.length = 0;
        this.otherEntities.length = 0;
        this.cameras.length = 0;

        for (let i = 0; i < this.inner.length; ++i) {
            const entity = this.inner[i];
            if (entity) {
                entity.hash = 0
                this.inner[i] = null;
            }
        }
    }

    /** Ticks all entities in the game. */
    public tick(tick: number) {
        this.collisionManager.reset(this.game.arena.arenaData.values.rightX, this.game.arena.arenaData.values.bottomY);

        while (!this.inner[this.lastId] && this.lastId >= 0) {
            this.lastId -= 1;
        }

        scanner: for (let id = 0; id <= this.lastId; ++id) {
            const entity = this.inner[id];

            if (!Entity.exists(entity)) continue;

            if (entity instanceof ObjectEntity && !entity.isChild) {
                // This loop keeps entities far away from cameras to not be calculated collision for.
                // if (config.usingSpatialHashGrid) {
                //     entity.isViewed = true;
                //     this.collisionManager.insertEntity(entity);
                //     continue;
                // }
                // For quadtree only because its not c++ :(
                // for (let i = 0; i < this.cameras.length; ++i) {
                //     const camera = this.inner[this.cameras[i]] as CameraEntity;// small trick
                //     if ((camera.camera.values.cameraX - entity.position.values.x) ** 2 + (camera.camera.values.cameraY - entity.position.values.y) ** 2 < (4500 + entity.physics.values.size + entity.physics.values.width) ** 2) {
                //         this.collisionManager.insertEntity(entity);
                //         entity.isViewed = true;
                //         continue scanner;
                //     }
                // }
                this.collisionManager.insertEntity(entity);
                entity.isViewed = true;
            }
        }

        for (let id = 0; id <= this.lastId; ++id) {
            const entity = this.inner[id];

            if (entity && entity instanceof ObjectEntity && entity.isPhysical) {
                entity.applyPhysics();
            }
        }

        for (let id = 0; id <= this.lastId; ++id) {
            const entity = this.inner[id];

            if (!Entity.exists(entity)) continue;

            if (!(entity instanceof CameraEntity)) {
                if (!(entity instanceof ObjectEntity) || !entity.isChild) entity.tick(tick);
            }
        }

        for (let i = this.AIs.length; --i >= 0;) {
            if (!Entity.exists(this.AIs[i].owner)) {
                removeFast(this.game.entities.AIs, i);
                continue;
            }
            this.AIs[i].tick(tick);
        }

        for (let i = 0; i < this.cameras.length; ++i) {
            (this.inner[this.cameras[i]] as CameraEntity).tick(tick);
        }

        for (let id = 0; id <= this.lastId; ++id) {
            const entity = this.inner[id];

            if (entity) {
                entity.wipeState();
            }
        }
    }
}
