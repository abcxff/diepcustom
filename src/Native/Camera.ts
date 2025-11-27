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
import type GameServer from "../Game";
import type Client from "../Client";
import TankBody from "../Entity/Tank/TankBody";
import ObjectEntity from "../Entity/Object";
import ClientHandle from "./ClientHandle";

import { Entity } from "./Entity";
import { CameraGroup, RelationsGroup } from "./FieldGroups";
import { CameraFlags, levelToScore, levelToScoreTable, Stat } from "../Const/Enums";
import { getTankById } from "../Const/TankDefinitions";

import { maxPlayerLevel } from "../config";

/**
 * Represents any entity with a camera field group.
 */
export class CameraEntity extends Entity {
    /** Always existant camera field group. Present in all GUI/camera entities. */
    public cameraData: CameraGroup = new CameraGroup(this);

    /** The current size of the tank the camera is in charge of. Calculated with level stuff */
    public sizeFactor: number = 1;

    /** Entity being spectated if any (deathscreen). */
    public spectatee: ObjectEntity | null = null;

    /** Client handle for view and compilation. Only exists for client cameras. */
    public clientHandle: ClientHandle | null = null;

    /** Ticks waiting for reconnection. Only used when clientHandle is null but camera is waiting for reconnect. */
    protected ticksWaitingForReconnect: number = 0;

    /** Reconnect key */
    public reconnectionKey: string | null = null;

    /** Always existant relations field group. Present in all GUI/camera entities. */
    public relationsData: RelationsGroup = new RelationsGroup(this);

    public constructor(game: GameServer) {
        super(game);
        this.relationsData.values.team = this;
    }

    /** Deals with deleting the tank body */
    public override delete() {
        const player = this.cameraData.values.player;
        if (Entity.exists(player) && player instanceof TankBody) {
            if (this.cameraData.values.level <= 5) {
                return player.destroy();
            }
        }

        return super.delete();
    }

    /** Calculates the amount of stats available at a specific level. */
    public static calculateStatCount(level: number) {
        if (level <= 0) return 0;
        if (level <= 28) return level - 1;

        return Math.floor(level / 3) + 18;
    }

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
        const statIncrease = CameraEntity.calculateStatCount(level) - CameraEntity.calculateStatCount(previousLevel);
        this.cameraData.statsAvailable += statIncrease;

        this.setFieldFactor(getTankById(this.cameraData.values.tank)?.fieldFactor || 1);
    }

    /** Returns the camera's client if it exists */
    public getClient(): Client | null {
        return this.clientHandle?.client ?? null;
    }

    public setClient(client: Client) {
        if (this.clientHandle) {
            console.trace("ClientHandle already exists for this camera, cancelling");
            return;
        }
        this.clientHandle = new ClientHandle(client);
        this.reconnectionKey = client.reconnectionKey;
        this.ticksWaitingForReconnect = 0;
        if (this.cameraData.values.player instanceof TankBody) {
            this.cameraData.values.player.inputs = client.inputs;
        }
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

        // Update view if this is a client camera
        const client = this.getClient();
        if (client && client.terminated) {
            this.clientHandle = null;
        }
        
        if (this.clientHandle) {
            const fov = this.cameraData.values.FOV;
            const width = (1920 / fov) / 1.5;
            const height = (1080 / fov) / 1.5;
            
            this.clientHandle.updateView(
                tick,
                this.cameraData.values.player as ObjectEntity | null,
                this.cameraData.values.cameraX,
                this.cameraData.values.cameraY,
                width,
                height,
                fov
            );
        } else if (this.reconnectionKey) {
            // Give 30s for reconnection, if none, delete camera
            this.ticksWaitingForReconnect += 1;
            if (this.ticksWaitingForReconnect > 30 * config.tps) {
                this.reconnectionKey = null;
                return this.delete();
            }
        }
    }

    public markForReconnection() {
        this.ticksWaitingForReconnect = 0;
        this.clientHandle = null;
    }

    public expectingReconnection(): boolean {
        return this.reconnectionKey !== null && this.clientHandle === null;
    }
}

export default CameraEntity;

