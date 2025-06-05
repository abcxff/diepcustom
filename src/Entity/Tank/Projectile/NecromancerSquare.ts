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
import Drone from "./Drone";

import { Color, PhysicsFlags, Tank } from "../../../Const/Enums";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { AI } from "../../AI";
import { BarrelBase } from "../TankBody";
import AbstractShape from "../../Shape/AbstractShape";
import LivingEntity from "../../Live";

/**
 * The drone class represents the drone (projectile) entity in diep.
 */
export default class NecromancerSquare extends Drone {
    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);

        const bulletDefinition = barrel.definition.bullet;
        
        this.ai = new AI(this);
        this.ai.viewRange = 900;

        this.physicsData.values.sides = 4;
        // this.physics.values.size = 55 * Math.SQRT1_2 * bulletDefinition.sizeRatio;

        // if (shape.isShiny) this.health.values.maxHealth = this.health.values.health *= 10
        this.styleData.values.color = tank.relationsData.values.team?.teamData?.values.teamColor || Color.NecromancerSquare;
        if (this.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision) this.physicsData.values.flags ^= PhysicsFlags.noOwnTeamCollision;
        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;

        // TODO(ABC):
        // No hardcoded - unless it is hardcoded in diep (all signs show that it might be so far)
        if (tankDefinition && tankDefinition.id === Tank.Battleship) {
            this.lifeLength = 88;
        } else {
            this.lifeLength = Infinity;
            if (this.physicsData.values.flags & PhysicsFlags.canEscapeArena) this.physicsData.values.flags ^= PhysicsFlags.canEscapeArena;
        }
        this.deathAccelFactor = 1;

        this.physicsData.values.pushFactor = 4;
        this.physicsData.values.absorbtionFactor = bulletDefinition.absorbtionFactor;

        this.baseSpeed = 0;
    }

    /** Given a shape, it will create a necromancer square using stats from the shape */
    public static fromShape(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shape: LivingEntity): NecromancerSquare {
        const sunchip = new NecromancerSquare(barrel, tank, tankDefinition, shape.positionData.values.angle);
        sunchip.physicsData.values.sides = shape.physicsData.values.sides;
        sunchip.physicsData.values.size = shape.physicsData.values.size;
        sunchip.positionData.values.x = shape.positionData.values.x;
        sunchip.positionData.values.y = shape.positionData.values.y;
        sunchip.positionData.values.angle = shape.positionData.values.angle;
        
        const shapeDamagePerTick: number = shape['damagePerTick'];

        sunchip.damagePerTick *= shapeDamagePerTick / 8;
        sunchip.healthData.values.maxHealth = (sunchip.healthData.values.health *= (shapeDamagePerTick / 8));
        return sunchip;
    }
}