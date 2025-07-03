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
import BaseGuard from "./BaseDrones";
/**
 * Represents Team Bases in game.
 */
export default class TeamBase extends LivingEntity {

    public constructor(game: GameServer, team: TeamGroupEntity, x: number, y: number, width: number, height: number, painful: boolean=true, spawnGuards: boolean=false) {
        super(game);

        this.relationsData.values.team = team;

        this.positionData.values.x = x;
        this.positionData.values.y = y;

        this.physicsData.values.width = width;
        this.physicsData.values.size = height;
        this.physicsData.values.sides = 2;
        this.physicsData.values.flags |= PhysicsFlags.showsOnMap | PhysicsFlags.noOwnTeamCollision | PhysicsFlags.isBase;
        this.physicsData.values.pushFactor = 2;
        this.damagePerTick = 5;

        if (!painful) {
            this.physicsData.values.pushFactor = 0;
            this.damagePerTick = 0;
        }

        this.damageReduction = 0;
        this.physicsData.values.absorbtionFactor = 0;

        this.styleData.values.opacity = 0.1;
        this.styleData.values.borderWidth = 0;
        this.styleData.values.color = team.teamData.teamColor;
        this.styleData.values.flags |= StyleFlags.renderFirst | StyleFlags.hasNoDmgIndicator;

        this.healthData.flags |= HealthFlags.hiddenHealthbar
        this.healthData.health = this.healthData.values.maxHealth = 0xABCFF; // ;)

        // Spawn base guard with defensive drones if requested
        if (spawnGuards) {
            new BaseGuard(game, team, x, y);
        }
    }

    public tick(tick: number) {
        // No animation. No regen
        this.lastDamageTick = tick;
    }
}
