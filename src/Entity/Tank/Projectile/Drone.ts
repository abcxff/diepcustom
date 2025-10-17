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
import { Entity } from "../../../Native/Entity";
import { AI, AIState } from "../../AI";
import { BarrelBase } from "../TankBody";

/**
 * The drone class represents the drone (projectile) entity in diep.
 */
export default class Drone extends Bullet {
    /** The AI of the drone (for AI mode) */
    public ai: AI;

    /** The drone's radius of resting state */
    public static MAX_RESTING_RADIUS = 400 ** 2;

    /** Used let the drone go back to the player in time. */
    private restCycle = true;

    /** Cached prop of the definition. */
    protected canControlDrones: boolean;

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);

        const bulletDefinition = barrel.definition.bullet;

        this.usePosAngle = true;
        
        this.ai = new AI(this);
        this.ai.viewRange = 850 * tank.sizeFactor;
        this.ai.targetFilter = (targetPos) => (targetPos.x - this.tank.positionData.values.x) ** 2 + (targetPos.y - this.tank.positionData.values.y) ** 2 <= this.ai.viewRange ** 2; // (1000 ** 2) 1000 radius
        this.canControlDrones = typeof this.barrelEntity.definition.canControlDrones === 'boolean' && this.barrelEntity.definition.canControlDrones;
        this.physicsData.values.sides = 3;
        if (this.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision) this.physicsData.values.flags ^= PhysicsFlags.noOwnTeamCollision;
        this.physicsData.values.flags |= PhysicsFlags.onlySameOwnerCollision;
        this.physicsData.values.flags ^= PhysicsFlags.canEscapeArena;
        this.styleData.values.flags &= ~StyleFlags.hasNoDmgIndicator;

        if (barrel.definition.bullet.lifeLength !== -1) {
            this.lifeLength = 88 * barrel.definition.bullet.lifeLength;
        } else {
            this.lifeLength = Infinity;
        }
        this.deathAccelFactor = 1;

        this.physicsData.values.pushFactor = 4;
        this.physicsData.values.absorbtionFactor = bulletDefinition.absorbtionFactor;

        this.baseSpeed /= 3;

        barrel.droneCount += 1;

        this.ai.movementSpeed = this.ai.aimSpeed = this.baseAccel;

        this.minDamageMultiplier = 1;
        this.maxDamageMultiplier = 1;
    }

    /** Extends LivingEntity.destroy - so that the drone count decreases for the barrel. */
    public destroy(animate=true) {
        if (!animate) this.barrelEntity.droneCount -= 1;

        super.destroy(animate);
    }
    
    /** This allows for factory to hook in before the entity moves. */
    protected tickMixin(tick: number) {
        super.tick(tick);
    }

    public tick(tick: number) {
        const usingAI = !this.canControlDrones || this.tank.inputs.deleted || (!this.tank.inputs.attemptingShot() && !this.tank.inputs.attemptingRepel());
        const inputs = !usingAI ? this.tank.inputs : this.ai.inputs;

        if (usingAI && this.ai.state === AIState.idle) {
            const delta = {
                x: this.positionData.values.x - this.tank.positionData.values.x,
                y: this.positionData.values.y - this.tank.positionData.values.y
            }
            const base = this.baseAccel;

            // still a bit inaccurate, works though
            let unitDist = (delta.x ** 2 + delta.y ** 2) / Drone.MAX_RESTING_RADIUS;
            if (unitDist <= 1 && this.restCycle) {
                this.baseAccel /= 6;
                this.positionData.angle += 0.01 + 0.012 * unitDist;
            } else {
                const offset = Math.atan2(delta.y, delta.x) + Math.PI / 2
                delta.x = this.tank.positionData.values.x + Math.cos(offset) * this.tank.physicsData.values.size * 1.2 - this.positionData.values.x;
                delta.y = this.tank.positionData.values.y + Math.sin(offset) * this.tank.physicsData.values.size * 1.2 - this.positionData.values.y;
                this.positionData.angle = Math.atan2(delta.y, delta.x);
                if (unitDist < 0.5) this.baseAccel /= 3;
                this.restCycle = (delta.x ** 2 + delta.y ** 2) <= 4 * (this.tank.physicsData.values.size ** 2);
            }

            if (!Entity.exists(this.barrelEntity)) this.destroy();

            this.tickMixin(tick);

            this.baseAccel = base;

            return;
        } else {
            this.positionData.angle = Math.atan2(inputs.mouse.y - this.positionData.values.y, inputs.mouse.x - this.positionData.values.x);
            this.restCycle = false
        }


        
        if (this.canControlDrones && inputs.attemptingRepel()) {
            this.positionData.angle += Math.PI; 
        }

        // So that switch tank works, as well as on death
        if (!Entity.exists(this.barrelEntity)) this.destroy();

        this.tickMixin(tick);
    }
}