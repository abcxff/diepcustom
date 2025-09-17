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

import { HealthFlags, PhysicsFlags, StyleFlags } from "../../Const/Enums";
import { TeamGroupEntity } from "./TeamEntity";
import LivingEntity from "../Live";
import BaseDrones from "./BaseDrones";
/**
 * Represents Team Bases in game.
 */
export default class TeamBase extends LivingEntity {

    public constructor(game: GameServer, team: TeamGroupEntity, x: number, y: number, width: number, height: number, shielded: boolean=true, droneSpawnerCount: number=1, droneCount: number=12) {
        super(game);

        this.setGlobalEntity();

        this.relationsData.values.team = team;

        this.positionData.values.x = x;
        this.positionData.values.y = y;

        this.physicsData.values.width = width;
        this.physicsData.values.size = height;
        this.physicsData.values.sides = 2;
        this.physicsData.values.flags |= PhysicsFlags.noOwnTeamCollision | PhysicsFlags.isBase;
        this.physicsData.values.pushFactor = 2;
        this.physicsData.values.absorbtionFactor = 0;

        this.styleData.values.opacity = 0.1;
        this.styleData.values.borderWidth = 0;
        this.styleData.values.color = team.teamData.teamColor;
        this.styleData.values.flags |= StyleFlags.renderFirst | StyleFlags.hasNoDmgIndicator;

        this.damagePerTick = 5;
        this.minDamageMultiplier = 1;
        this.maxDamageMultiplier = 1;

        this.damageReduction = 0;
        if (!shielded) {
            this.physicsData.values.pushFactor = 0;
            this.damagePerTick = 0;
        } else {
            this.createDrones(droneSpawnerCount, droneCount);
        }

        this.healthData.flags |= HealthFlags.hiddenHealthbar
        this.healthData.health = this.healthData.values.maxHealth = 0xABCFF; // ;)
    }

    public createDrones(droneSpawnerCount: number, droneCount: number) {
        for (let i = 0; i < droneSpawnerCount; ++i) {
            const droneSpawner = new BaseDrones(this, droneCount);
            droneSpawner.positionData.values.x = this.positionData.values.x;
            // Don't spread drones around the base if it is a rectangle
            droneSpawner.positionData.values.y = this.physicsData.values.width === this.physicsData.values.size ? this.positionData.values.y :
                                                 this.physicsData.values.width * (i + 1) / (droneSpawnerCount + 1) - this.physicsData.values.width / 2;
        }
    }

    public tick(tick: number) {
        // No animation. No regen
        this.healthData.health = this.healthData.values.maxHealth;
        this.lastDamageTick = tick;
    }
}
