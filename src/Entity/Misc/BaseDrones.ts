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

import GameServer from "../../Game";
import TankBody from "../Tank/TankBody";
import Barrel from "../Tank/Barrel";
import { CameraEntity } from "../../Native/Camera";
import { Inputs } from "../../Entity/AI";

import { BarrelDefinition } from "../../Const/TankDefinitions";
import { PhysicsFlags, StyleFlags } from "../../Const/Enums";
import { TeamGroupEntity } from "./TeamEntity";

// Base drone barrel definition - creates defensive drones
const createBaseGuardBarrelDefinition = (droneCount: number): BarrelDefinition => ({
    angle: 0,
    offset: 0,
    size: 70,
    width: 42,
    delay: 0,
    reload: 3,
    recoil: 0,
    isTrapezoid: true,
    trapezoidDirection: 0,
    addon: null,
    droneCount: droneCount,
    canControlDrones: false, // AI controlled
    bullet: {
        type: "drone",
        sizeRatio: 1,
        health: 3,
        damage: 1.2,
        speed: 0.9,
        scatterRate: 1,
        lifeLength: -1,
        absorbtionFactor: 1
    }
});

/**
 * Invisible base guard that spawns defensive drones
 */
export default class BaseGuard extends TankBody {
    /** The barrel that spawns the guard drones */
    private guardBarrel: Barrel;
    /** Number of drones this guard should maintain */
    private targetDroneCount: number;

    public constructor(game: GameServer, team: TeamGroupEntity, x: number, y: number, droneCount: number = 8) {
        super(game, new CameraEntity(game), new Inputs());

        // Store the target drone count
        this.targetDroneCount = droneCount;

        // Position the guard at the base
        this.positionData.values.x = x;
        this.positionData.values.y = y;

        // Set team
        this.relationsData.values.team = team;
        this.styleData.values.color = team.teamData.teamColor;

        // Make invisible and invulnerable
        this.styleData.values.opacity = 0;
        this.physicsData.values.flags |= PhysicsFlags.isBase | PhysicsFlags.noOwnTeamCollision;
        this.styleData.values.flags |= StyleFlags.isFlashing; // invulnerability
        this.physicsData.values.size = 1; // Tiny size
        this.physicsData.values.absorbtionFactor = 0;
        
        // No collision with anything
        this.physicsData.values.pushFactor = 0;
        this.damagePerTick = 0;
        this.damageReduction = 1; // Immune to damage

        // Create the barrel that spawns drones
        this.guardBarrel = new Barrel(this, createBaseGuardBarrelDefinition(droneCount));

        // Set high level for strong drones
        this.cameraEntity.setLevel(75);
    }

    public tick(tick: number): void {
        // Keep the guard stationary and always attempt to maintain drones
        this.inputs.flags = 0;
        
        // Always try to spawn drones if we don't have enough
        if (this.guardBarrel.droneCount < this.targetDroneCount) {
            this.inputs.mouse.x = this.positionData.values.x;
            this.inputs.mouse.y = this.positionData.values.y;
        }

        super.tick(tick);
    }

    public destroy(animate: boolean = true): void {
        // Base guards should not be destroyed
        return;
    }
}