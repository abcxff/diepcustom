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

import LivingEntity from "../../Live";
import Barrel from "../Barrel";

import { HealthFlags, PositionFlags, PhysicsFlags, Stat, StyleFlags } from "../../../Const/Enums";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { BarrelBase } from "../TankBody";
import { EntityStateFlags } from "../../../Native/Entity";

/**
 * The bullet class represents the bullet entity in diep.
 */
export default class Bullet extends LivingEntity {
    /** The barrel that the bullet is being shot from. */
    protected barrelEntity: Barrel;
    /** The tick this entity was created in. */
    protected spawnTick = 0;
    /** Speed the bullet will accelerate at. */
    protected baseAccel = 0;
    /** Starting velocity of the bullet. */
    protected baseSpeed = 0;
    /** Percent of accel applied when dying. */
    protected deathAccelFactor = 0.5;
    /** Life length in ticks before the bullet dies. */
    protected lifeLength = 0;
    /** Angle the projectile is shot at. */
    protected movementAngle = 0;
    /** Definition of the tank (if existant) shooting the bullet. */
    protected tankDefinition: TankDefinition | null = null;
    /** Whether or not to use .shootAngle or .position.angle. */
    protected usePosAngle = false;
    /** The tank who shot the bullet. */
    protected tank: BarrelBase;

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel.game);

        this.tank = tank;
        
        this.tankDefinition = tankDefinition;

        this.movementAngle = shootAngle;
        this.barrelEntity = barrel;
        this.spawnTick = barrel.game.tick;

        this.relationsData.values.owner = tank;

        tank.rootParent.styleData.zIndex = barrel.game.entities.zIndex++;

        const bulletDefinition = barrel.definition.bullet;
        const sizeFactor = tank.sizeFactor;
        const statLevels = tank.cameraEntity.cameraData?.values.statLevels.values;

        this.relationsData.values.team = barrel.relationsData.values.team;
        this.relationsData.values.owner = tank;

        this.physicsData.values.sides = 1;
        this.physicsData.values.flags |= PhysicsFlags.noOwnTeamCollision | PhysicsFlags.canEscapeArena;
        if (tank.positionData.values.flags & PositionFlags.canMoveThroughWalls || this.relationsData.values.team === this.game.arena) this.positionData.values.flags |= PositionFlags.canMoveThroughWalls
        this.physicsData.values.size = (barrel.physicsData.values.width / 2) * bulletDefinition.sizeRatio;
        this.styleData.values.color = tank.rootParent.styleData.values.color;
        this.styleData.values.flags |= StyleFlags.hasNoDmgIndicator;
        this.healthData.values.flags = HealthFlags.hiddenHealthbar;

        const bulletDamage = statLevels ? statLevels[Stat.BulletDamage] : 0;
        const bulletPenetration = statLevels ? statLevels[Stat.BulletPenetration] : 0;

        this.physicsData.values.absorbtionFactor = bulletDefinition.absorbtionFactor;
        this.physicsData.values.pushFactor = ((7 / 3) + bulletDamage) * bulletDefinition.damage * bulletDefinition.absorbtionFactor;

        this.baseAccel = barrel.bulletAccel;
        this.baseSpeed = barrel.bulletAccel + 30 - Math.random() * bulletDefinition.scatterRate;

        this.healthData.values.health = this.healthData.values.maxHealth = (1.5 * bulletPenetration + 2) * bulletDefinition.health;
        this.damagePerTick = (7 + bulletDamage * 3) * bulletDefinition.damage;
        this.minDamageMultiplier = 0.25;
        this.maxDamageMultiplier = 1;
		
        this.lifeLength = bulletDefinition.lifeLength * 75;

        const {x, y} = tank.getWorldPosition();
        
        this.positionData.values.x = x + (Math.cos(shootAngle) * barrel.physicsData.values.size) - Math.sin(shootAngle) * barrel.definition.offset * sizeFactor + Math.cos(shootAngle) * (barrel.definition.distance || 0);
        this.positionData.values.y = y + (Math.sin(shootAngle) * barrel.physicsData.values.size) + Math.cos(shootAngle) * barrel.definition.offset * sizeFactor + Math.sin(shootAngle) * (barrel.definition.distance || 0);
        this.positionData.values.angle = shootAngle;
    }

    /** Extends LivingEntity.onKill - passes kill to the owner. */
    public onKill(killedEntity: LivingEntity) {
        (this.tank as unknown as LivingEntity)?.onKill?.(killedEntity);
    }

    public tick(tick: number) {
        super.tick(tick);

        if (tick === this.spawnTick + 1) this.addAcceleration(this.movementAngle, this.baseSpeed);
        else this.maintainVelocity(this.usePosAngle ? this.positionData.values.angle : this.movementAngle, this.baseAccel);

        if (tick - this.spawnTick >= this.lifeLength) this.destroy(true);
        // TODO(ABC):
        // This code will be reimplemented in the update that allows for easy camera entity switches
        if ((this.relationsData.values.team?.entityState || 0) & EntityStateFlags.needsDelete) this.relationsData.values.team = null
    }
}
