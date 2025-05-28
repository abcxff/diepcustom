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

import GameServer from "../Game";
import Client from "../Client";
import Writer from "../Coder/Writer";
import TankBody from "../Entity/Tank/TankBody";
import ObjectEntity from "../Entity/Object";

import { Entity, EntityStateFlags } from "./Entity";
import { CameraGroup, RelationsGroup } from "./FieldGroups";
import { CameraFlags, ClientBound, levelToScore, levelToScoreTable, PhysicsFlags, Stat } from "../Const/Enums";
import { getTankById } from "../Const/TankDefinitions";
import { removeFast } from "../util";

import { compileCreation, compileUpdate } from "./UpcreateCompiler";
import { maxPlayerLevel } from "../config";

/**
 * Represents any entity with a camera field group.
 */
export class CameraEntity extends Entity {
    /** Always existant camera field group. Present in all GUI/camera entities. */
    public cameraData: CameraGroup = new CameraGroup(this);

    /** The current size of the tank the camera is in charge of. Calculated with level stuff */
    public sizeFactor: number = 1;

    /** Used to set the current camera's level. Should be the only way used to set level. */
    public setLevel(level: number) {
        const previousLevel = this.cameraData.values.level;
        this.cameraData.level = level;
        this.sizeFactor = Math.pow(1.01, level - 1);
        this.cameraData.levelbarMax = level < maxPlayerLevel ? 1 : 0; // quick hack, not correct values
        if (level <= maxPlayerLevel) {
            this.cameraData.score = levelToScore(level);

            const player = this.cameraData.values.player;
            if (Entity.exists(player) && player instanceof TankBody) {
                player.scoreData.score = this.cameraData.values.score;
                player.scoreReward = this.cameraData.values.score;
            }
        }

        // Update stats available
        const statIncrease = ClientCamera.calculateStatCount(level) - ClientCamera.calculateStatCount(previousLevel);
        this.cameraData.statsAvailable += statIncrease;

        this.setFieldFactor(getTankById(this.cameraData.values.tank)?.fieldFactor || 1);
    }

    /** Sets the current FOV by field factor. */
    public setFieldFactor(fieldFactor: number) {
        this.cameraData.FOV = (.55 * fieldFactor) / Math.pow(1.01, (this.cameraData.values.level - 1) / 2);
    }

    public tick(tick: number) {
        if (Entity.exists(this.cameraData.values.player)) {
            const focus = this.cameraData.values.player;
            if (!(this.cameraData.values.flags & CameraFlags.usesCameraCoords) && focus instanceof ObjectEntity) {
                this.cameraData.cameraX = focus.rootParent.positionData.values.x;
                this.cameraData.cameraY = focus.rootParent.positionData.values.y;
            }

            if (this.cameraData.values.player instanceof TankBody) {
                // Update player related data
                const player = this.cameraData.values.player as TankBody;

                const score = this.cameraData.values.score;
                let newLevel = this.cameraData.values.level;
                while (newLevel < levelToScoreTable.length && score - levelToScore(newLevel + 1) >= 0) newLevel += 1

                if (newLevel !== this.cameraData.values.level) {
                    this.setLevel(newLevel);
                    this.cameraData.score = score;
                }

                if (newLevel < levelToScoreTable.length) {
                    const levelScore = levelToScore(this.cameraData.values.level)
                    this.cameraData.levelbarMax = levelToScore(this.cameraData.values.level + 1) - levelScore;
                    this.cameraData.levelbarProgress = score - levelScore;
                }

                this.cameraData.movementSpeed = player.definition.speed * 2.55 * Math.pow(1.07, this.cameraData.values.statLevels.values[Stat.MovementSpeed]) / Math.pow(1.015, this.cameraData.values.level - 1)
            }
        } else {
            this.cameraData.flags |= CameraFlags.usesCameraCoords;
        }
    }
}

/**
 * This is the entity that controls stats and other gui data.
 * It is also the class that compiles entity data and sends it to the client.
 */
export default class ClientCamera extends CameraEntity {
    /** Client interface. */
    public client: Client;
    /** All entities in the view of the camera. Represented by id. */
    private view: Set<Entity> = new Set();
    /** Always existant relations field group. Present in all GUI/camera entities. */
    public relationsData: RelationsGroup = new RelationsGroup(this);
    /** Entity being spectated if any (deathscreen). */
    public spectatee: ObjectEntity | null = null;

    /** Calculates the amount of stats available at a specific level. */
    public static calculateStatCount(level: number) {
        if (level <= 0) return 0;
        if (level <= 28) return level - 1;

        return Math.floor(level / 3) + 18;
    }

    public constructor(game: GameServer, client: Client) {
        super(game);

        this.client = client;

        this.cameraData.values.respawnLevel = this.cameraData.values.level = this.cameraData.values.score = 1;

        this.cameraData.values.FOV = .35;
        this.relationsData.values.team = this;
    }

    /** Used to set the current camera's level. Should be the only way used to set level. */
    public setLevel(level: number) {
        const previousLevel = this.cameraData.values.level;
        this.cameraData.level = level;
        this.sizeFactor = Math.pow(1.01, level - 1);
        this.cameraData.levelbarMax = level < maxPlayerLevel ? 1 : 0; // quick hack, not correct values
        if (level <= maxPlayerLevel) {
            this.cameraData.score = this.client.kills;
        }

        // Update stats available
        const statIncrease = ClientCamera.calculateStatCount(level) - ClientCamera.calculateStatCount(previousLevel);
        this.cameraData.statsAvailable += statIncrease;

        this.setFieldFactor(getTankById(this.cameraData.values.tank)?.fieldFactor || 1);
    }

    /** Updates the camera's current view. */
    private updateView(tick: number) {
        const w = this.client.write().u8(ClientBound.Update).vu(tick);

        const deletes: { id: number, hash: number, noDelete?: boolean }[] = [];
        const updates: Entity[] = [];
        const creations: Entity[] = [];

        const fov = this.cameraData.values.FOV;
        const width = (1920 / fov) / 1.5;
        const height = (1080 / fov) / 1.5;

        // TODO(speed)
        const entitiesNearRange = this.game.entities.collisionManager.retrieve(this.cameraData.values.cameraX, this.cameraData.values.cameraY, width, height);
        const entitiesInRange: ObjectEntity[] = [];

        const l = this.cameraData.values.cameraX - width;
        const r = this.cameraData.values.cameraX + width;
        const t = this.cameraData.values.cameraY - height;
        const b = this.cameraData.values.cameraY + height;
        for (let i = 0; i < entitiesNearRange.length; ++i) {
            const entity = entitiesNearRange[i];
            const width = entity.physicsData.values.sides === 2 ? entity.physicsData.values.size / 2 : entity.physicsData.values.size;
            const size = entity.physicsData.values.sides === 2 ? entity.physicsData.values.width / 2 : entity.physicsData.values.size;
                     
            if (entity.positionData.values.x - width < r &&
                entity.positionData.values.y + size > t &&
                entity.positionData.values.x + width > l &&
                entity.positionData.values.y - size < b) {
                if (entity !== this.cameraData.values.player &&!(entity.styleData.values.opacity === 0 && !entity.deletionAnimation)) {
                    entitiesInRange.push(entity);
                }
            }
        }

        for (let id = 0; id <= this.game.entities.lastId; ++id) {
            const entity = this.game.entities.inner[id];
            
            if (entity instanceof ObjectEntity && !entitiesInRange.includes(entity) && (entity.physicsData.values.flags & PhysicsFlags.showsOnMap)) {
                entitiesInRange.push(entity);
            }
        }

        if (Entity.exists(this.cameraData.values.player) && this.cameraData.values.player instanceof ObjectEntity) {
            entitiesInRange.push(this.cameraData.values.player);
        }

        for (const entity of this.view) {
            if (entity instanceof ObjectEntity) {
                // TODO(speed)
                // Orphan children must be destroyed
                if (!entitiesInRange.includes(entity.rootParent)) {
                    deletes.push({id: entity.id, hash: entity.preservedHash});
                    continue;
                }
            }

            // If the entity is gone, notify the client, if its updated, notify the client
            if (entity.hash === 0) {
                deletes.push({ id: entity.id, hash: entity.preservedHash });
                this.view.delete(entity);
            } else if (entity.entityState & EntityStateFlags.needsCreate) {
                if (entity.entityState & EntityStateFlags.needsDelete) deletes.push({ hash: entity.hash, id: entity.id, noDelete: true });
                creations.push(entity);
            } else if (entity.entityState & EntityStateFlags.needsUpdate) {
                updates.push(entity);
            }
        }

        // Now compile
        w.vu(deletes.length);
        for (let i = 0; i < deletes.length; ++i) {
            w.entid(deletes[i]);
        }

        // Yeah.
        if (this.view.size === 0) {
            creations.push(this.game.arena, this);
            this.view.add(this.game.arena);
            this.view.add(this);
        }

        for (const entityId of this.game.entities.otherEntities) {
            const entity = this.game.entities.inner[entityId];
            if(!entity || !this.view.has(entity) || entity instanceof CameraEntity) continue;
            creations.push(entity);
            this.view.add(entity);
        }

        for (const entity of entitiesInRange) {
            if (!this.view.has(entity)) {
                // creation
                creations.push(entity);
                this.view.add(entity);

                if (entity.children.length && !entity.isChild) {
                    // add any of its children
                    for (const child of entity.children) this.view.add(child);
                    creations.push.apply(creations, entity.children);
                }
            } else if (entity.children.length && !entity.isChild) {
                // update (children)
                for (const child of entity.children) {
                    if (this.view.has(child)) continue;
                    this.view.add(child);
                    creations.push.apply(creations, entity.children);
                }
            }
        }

        // Arrays of entities
        w.vu(creations.length + updates.length);
        for (let i = 0; i < updates.length; ++i) {
            this.compileUpdate(w, updates[i]);
        }
        for (let i = 0; i < creations.length; ++i) {
            this.compileCreation(w, creations[i]);
        }

        w.send();
    }

    /** Entity creation compiler function... Run! */
    private compileCreation(w: Writer, entity: Entity) {
        compileCreation(this, w, entity);
    }

    /** Entity update compiler function... Run! */
    private compileUpdate(w: Writer, entity: Entity) {
        compileUpdate(this, w, entity);
    }

    public tick(tick: number) {
        super.tick(tick);

        if (!Entity.exists(this.cameraData.values.player) || !(this.cameraData.values.player instanceof TankBody)) {
            if (Entity.exists(this.spectatee)) {
                const pos = this.spectatee.rootParent.positionData.values;
                this.cameraData.cameraX = pos.x;
                this.cameraData.cameraY = pos.y;
                this.cameraData.flags |= CameraFlags.usesCameraCoords;
            }
        }

        // always last
        this.updateView(tick);
    }
}
