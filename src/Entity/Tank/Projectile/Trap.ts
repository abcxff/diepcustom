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

import Barrel from "../Barrel";
import Bullet from "./Bullet";

import { PhysicsFlags, StyleFlags } from "../../../Const/Enums";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { BarrelBase } from "../TankBody";
import { DevTank } from "../../../Const/DevTankDefinitions";
import { PI2 } from "../../../util";

/**
 * The trap class represents the trap (projectile) entity in diep.
 */
export default class Trap extends Bullet {
    /** Number of ticks before the trap cant collide with its own team. */
    protected collisionEnd = 0;

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);

        const bulletDefinition = barrel.definition.bullet;

        this.baseSpeed = (barrel.bulletAccel / 2) + 30 - Math.random() * barrel.definition.bullet.scatterRate;
        this.baseAccel = 0;
        this.physicsData.values.sides = bulletDefinition.sides ?? 3;
        if (this.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision) this.physicsData.values.flags ^= PhysicsFlags.noOwnTeamCollision;
        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;
        this.styleData.values.flags |= StyleFlags.isStar;
        this.styleData.values.flags &= ~StyleFlags.hasNoDmgIndicator;

        this.collisionEnd = this.lifeLength >> 3;
        this.lifeLength = (600 * barrel.definition.bullet.lifeLength) >> 3;
        if (tankDefinition && tankDefinition.id === DevTank.Bouncy) this.collisionEnd = this.lifeLength - 1;
        
        // Check this?
        this.positionData.values.angle = Math.random() * PI2;
    }

    public tick(tick: number) {
        super.tick(tick);

        if (tick - this.spawnTick === this.collisionEnd) {
            if (this.physicsData.values.flags & PhysicsFlags.onlySameOwnerCollision) this.physicsData.flags ^= PhysicsFlags.onlySameOwnerCollision;
            this.physicsData.values.flags |= PhysicsFlags.noOwnTeamCollision;
        }
    }
}
