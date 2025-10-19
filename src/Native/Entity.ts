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

import type GameServer from "../Game";
import {  /* <template> auto-generated */ RelationsGroup, BarrelGroup, PhysicsGroup, HealthGroup, ArenaGroup, NameGroup, CameraGroup, PositionGroup, StyleGroup, ScoreGroup, TeamGroup } from "./FieldGroups";


/**
 * The flags used for Entity.state property. Signals to the
 * manager and the camera what needs to be sent to the client.
 */
export const enum EntityStateFlags {
    needsUpdate = 1 << 0,
    needsCreate = 1 << 1,
    needsDelete = 1 << 2
}

/**
 * The abstract Entity class which is used for all data in the game.
 * All entities can be compiled by a Camera class.
 * For more details read [entities.md](https://github.com/ABCxFF/diepindepth/blob/main/entities.md).
 */
export class Entity {
    /**
     * Determines if the first parameter is an entity and not a deleted one.
     */
    public static exists(entity: Entity | null | undefined): entity is Entity {
        return entity instanceof Entity && entity.hash !== 0
    }

    /**
     * - `0b01`: Has updated
     * - `0b10`: Needs creation (unused)
     */
    public entityState = 0;
 /* <template> auto-generated */ 
    /**
     * Relations field group - contains fields relating to relations
     */
    public relationsData: RelationsGroup | null = null;
    /**
     * Barrel field group - contains fields relating to barrel
     */
    public barrelData: BarrelGroup | null = null;
    /**
     * Physics field group - contains fields relating to physics
     */
    public physicsData: PhysicsGroup | null = null;
    /**
     * Health field group - contains fields relating to health
     */
    public healthData: HealthGroup | null = null;
    /**
     * Arena field group - contains fields relating to arena
     */
    public arenaData: ArenaGroup | null = null;
    /**
     * Name field group - contains fields relating to name
     */
    public nameData: NameGroup | null = null;
    /**
     * Camera field group - contains fields relating to camera
     */
    public cameraData: CameraGroup | null = null;
    /**
     * Position field group - contains fields relating to position
     */
    public positionData: PositionGroup | null = null;
    /**
     * Style field group - contains fields relating to style
     */
    public styleData: StyleGroup | null = null;
    /**
     * Score field group - contains fields relating to score
     */
    public scoreData: ScoreGroup | null = null;
    /**
     * Team field group - contains fields relating to team
     */
    public teamData: TeamGroup | null = null;

    /** The current game server. */
    public game: GameServer;

    /** Entity id */
    public id: number = -1;
    /** Entity hash (will be 0 once the entity is deleted) */
    public hash: number = 0;
    /** Preserved entity hash (is never set to 0) */
    public preservedHash: number = 0;

    public constructor(game: GameServer) {
        this.game = game;

        game.entities.add(this);
    }

    /** Makes the  entity no longer in need of update. */
    public wipeState() {
 /* <template> auto-generated */        if (this.relationsData) this.relationsData.wipe();
       if (this.barrelData) this.barrelData.wipe();
       if (this.physicsData) this.physicsData.wipe();
       if (this.healthData) this.healthData.wipe();
       if (this.arenaData) this.arenaData.wipe();
       if (this.nameData) this.nameData.wipe();
       if (this.cameraData) this.cameraData.wipe();
       if (this.positionData) this.positionData.wipe();
       if (this.styleData) this.styleData.wipe();
       if (this.scoreData) this.scoreData.wipe();
       if (this.teamData) this.teamData.wipe();

        this.entityState = 0;
    }

    /** Deletes the entity from the entity manager system. */
    public delete() {
        this.wipeState();
        this.game.entities.delete(this.id);
    }

    /** Ticks the entity */
    public tick(tick: number) {}

    public toString() {
        return `${this.constructor.name} <${this.id}, ${this.preservedHash}>${this.hash === 0 ? "(deleted)" : ""}`
    }

    public [Symbol.toPrimitive](type: string) {
        if (type === "string") return this.toString()
        return this.preservedHash * 0x10000 + this.id;
    }
}