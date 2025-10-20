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

import ObjectEntity from "./Object";

import { StyleFlags } from "../Const/Enums";
import { HealthGroup } from "../Native/FieldGroups";

/**
 * An Abstract class for all entities with health.
 */
export default class LivingEntity extends ObjectEntity {
    /** Always existant health field group, present on all entities with a healthbar. */
    public healthData: HealthGroup = new HealthGroup(this);

    /** The points a player is awarded when it kills this entity. */
    public scoreReward = 0;
    /** Amount of health gained per tick. */
    protected regenPerTick = 0;
    /** The damage this entity can emit onto another per tick. */
    protected damagePerTick = 8;
    /** Entities who have went through damage cycles with this entity in the past tick. No repeats. */
    protected damagedEntities: LivingEntity[] = [];
    /** Last tick that damage was received. */
    protected lastDamageTick = -1;
    /** Last tick that damage style flag was changed. */
    protected lastDamageAnimationTick = -1;
    /** Damage reduction (mathematical health increase). */
    public damageReduction = 1.0;
    /** Extra damage multipliers, needed for proper bullet penetration logic. */
    public minDamageMultiplier = 1.0;
    /** Extra damage multipliers, needed for proper bullet damage logic. */
    public maxDamageMultiplier = 4.0;
    /** Opacity gained on damage */
    public opacityGainOnDamage = 0.0;

    /** Extends ObjectEntity.destroy() - diminishes health as well. */
    public destroy(animate=true) {
        if (this.hash === 0) return; // already deleted;

        if (animate) this.healthData.health = 0;

        super.destroy(animate);
    }

    /** Applies damage to two entity after colliding with eachother. */
    public static handleCollision(entity1: LivingEntity, entity2: LivingEntity) {
        if (entity1.relationsData.values.team && entity1.relationsData.values.team === entity2.relationsData.values.team) return;

        if (entity1.healthData.values.health <= 0 || entity2.healthData.values.health <= 0) return;
        if (entity1.damagedEntities.includes(entity2) || entity2.damagedEntities.includes(entity1)) return;
        if (entity1.damageReduction === 0 && entity2.damageReduction === 0) return;
        if (entity1.damagePerTick === 0 && entity1.physicsData.values.pushFactor === 0 || entity2.damagePerTick === 0 && entity2.physicsData.values.pushFactor === 0) return;

        let common = Math.max(entity2.minDamageMultiplier, entity1.minDamageMultiplier);
        common *= Math.min(entity2.maxDamageMultiplier, entity1.maxDamageMultiplier);
        const dF1 = (entity1.damagePerTick * common) * entity2.damageReduction;
        const dF2 = (entity2.damagePerTick * common) * entity1.damageReduction;

        // Damage can't be more than enough to kill health
        const ratio = Math.max(1 - entity1.healthData.values.health / dF2, 1 - entity2.healthData.values.health / dF1)
        const damage1to2 = dF1 * Math.min(1, 1 - ratio);
        const damage2to1 = dF2 * Math.min(1, 1 - ratio);

        entity1.receiveDamage(entity2, damage2to1);
        entity2.receiveDamage(entity1, damage1to2);
    }

    /** Called when the entity receives damage from another . */
    public receiveDamage(source: LivingEntity, amount: number) {
        // If we are already dead, don't apply more damage
        if (this.healthData.values.health <= 0.0001) {
            this.healthData.health = 0;
            return;
        }
        
        this.damagedEntities.push(source);

        // Plays the animation damage for entity 2
        if (this.lastDamageAnimationTick !== this.game.tick && !(this.styleData.values.flags & StyleFlags.hasNoDmgIndicator)) {
            this.styleData.flags ^= StyleFlags.hasBeenDamaged;
            this.lastDamageAnimationTick = this.game.tick;
        }

        this.lastDamageTick = this.game.tick;
        this.healthData.health -= amount;

        if (this.healthData.health <= 0.0001) {
            this.healthData.health = 0;

            let killer: ObjectEntity = source;
            while (killer.relationsData.values.owner instanceof ObjectEntity && killer.relationsData.values.owner.hash !== 0) {
                killer = killer.relationsData.values.owner;
            }

            if (killer instanceof LivingEntity) {
                this.onDeath(killer);
            }

            source.onKill(this);
        }
    }

    /** Called when the entity kills another via collision. */
    public onKill(entity: LivingEntity) {}

    /** Called when the entity is killed via collision */
    public onDeath(killer: LivingEntity) {}

    /** Runs at the end of each tick. Will apply the damage then. */
    public applyPhysics() {
        super.applyPhysics();

        if (this.healthData.values.health <= 0) {
            this.destroy(true);

            this.damagedEntities = [];
            return;
        }

        // Regeneration
        if (this.healthData.values.health < this.healthData.values.maxHealth) {
            this.healthData.health += this.regenPerTick;

            // Regen boost after 30s
            if (this.game.tick - this.lastDamageTick >= 750) {
                this.healthData.health += this.healthData.values.maxHealth / 250;
            }
        }

        if (this.healthData.values.health > this.healthData.values.maxHealth) {
            this.healthData.health = this.healthData.values.maxHealth;
        }

        this.damagedEntities = [];
    }

    public tick(tick: number) {
        super.tick(tick);
    }
}
