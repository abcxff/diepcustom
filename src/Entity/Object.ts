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

import * as util from "../util";
import GameServer from "../Game";
import Vector from "../Physics/Vector";

import { PhysicsGroup, PositionGroup, RelationsGroup, StyleGroup } from "../Native/FieldGroups";
import { Entity } from "../Native/Entity";
import { PositionFlags, PhysicsFlags } from "../Const/Enums";

/**
 * The animator for how entities delete (the opacity and size fade out).
 */
class DeletionAnimation {
    /** The entity being animated. */
    private entity: ObjectEntity;
    /** The current frame of the deletion animation. */
    public frame = 5;

    public constructor(entity: ObjectEntity) {
        this.entity = entity;
    }

    /** Animates the death animation. Called by the owner's internal tick. */
    public tick() {
        if (this.frame === -1) throw new Error("Animation failed. Entity should be gone by now");

        switch (this.frame) {
            case 0: {
                this.entity.destroy(false);
                this.frame = -1;
                return;
            }
            case 5:
                this.entity.styleData.opacity = 1 - (1 / 6);
            default:
                this.entity.physicsData.size *= 1.1;
                this.entity.physicsData.width *= 1.1;
                this.entity.styleData.opacity -= 1 / 6;
                if (this.entity.styleData.values.opacity < 0) this.entity.styleData.opacity = 0;
                break;
        }

        this.frame -= 1;
    }
}

/**
 * Object Entity is used for all entities with relations,
 * physics, position, and style field groups. All physics
 * are applied through this class. **This class represents
 * everything you can see in game.**
 */
export default class ObjectEntity extends Entity {
    /** Always existant relations field group. Present in all objects. */
    public relationsData: RelationsGroup = new RelationsGroup(this);
    /** Always existant physics field group. Present in all objects. */
    public physicsData: PhysicsGroup = new PhysicsGroup(this);
    /** Always existant position field group. Present in all objects. */
    public positionData: PositionGroup = new PositionGroup(this);
    /** Always existant style field group. Present in all objects. */
    public styleData: StyleGroup = new StyleGroup(this);

    /** Animator used for deletion animation */
    public deletionAnimation: DeletionAnimation | null = null;

    /** When set to true (the default), physics are applied to the entity. */
    public isPhysical: boolean = true;

    /** Set to true of the entity has a parent. */
    public isChild: boolean = false;

    /** All children of the object entity. */
    public children: ObjectEntity[] = [];

    /** Used to determine the parent of all parents. */
    public rootParent: ObjectEntity = this;

    /** Velocity used for physics. */
    public velocity = new Vector();

    /** For internal spatial hash grid */
    private _queryId: number = -1;

    /** Cache of all ObjectEntitys who are colliding with `this` one at the current tick */
    private cachedCollisions: ObjectEntity[] = [];
    /** Tick that the cache was taken. */
    private cachedTick = 0;

    public constructor(game: GameServer) {
        super(game);

        this.styleData.zIndex = game.entities.zIndex++;
    }

    /** Receives collision pairs from CollisionManager and applies kb */
    public static handleCollision(objA: ObjectEntity, objB: ObjectEntity) {
        objA.receiveKnockback(objB);
        objB.receiveKnockback(objA);
    }

    /** Whether or not two objects are touching */
    public static isColliding(objA: ObjectEntity, objB: ObjectEntity): boolean {
        if (objA === objB) return false;
        if (!objA.isPhysical || !objB.isPhysical) return false;
        const physicsA = objA.physicsData.values;
        const physicsB = objB.physicsData.values;
        const relationsA = objA.relationsData.values;
        const relationsB = objB.relationsData.values;
        const positionA = objA.positionData.values;
        const positionB = objB.positionData.values;

        // Entities with 0 sides do not collide
        if (physicsA.sides === 0) return false;
        if (physicsB.sides === 0) return false;

        // Entities that are actively deleting do not collide
        if (objA.deletionAnimation) return false;
        if (objB.deletionAnimation) return false;

        // Team and owner based collision rules
        if (relationsA.team === relationsB.team) {
            if (
                (physicsA.flags & PhysicsFlags.noOwnTeamCollision) ||
                (physicsB.flags & PhysicsFlags.noOwnTeamCollision)
            ) {
                return false;
            }

            if (relationsA.owner !== relationsB.owner) {
                if (
                    (physicsA.flags & PhysicsFlags.onlySameOwnerCollision) ||
                    (physicsB.flags & PhysicsFlags.onlySameOwnerCollision)
                )  {
                    return false;
                }
            }
        }
        
        // Bases do not collide with shapes and etc
        if (
            relationsB.team === objB.game.arena &&
            (physicsA.flags & PhysicsFlags.isBase)
        ) {
            return false;
        }

        const isARect = physicsA.sides === 2;
        const isBRect = physicsB.sides === 2;

        if (isARect && isBRect) {
            // in Diep.io source code, rectangles do not support collisions with other rectangles
            // uncomment the following code to enable rect on rect collisions
            // TODO: Implement this properly for all rectangles
            return false;
        } else if (isARect && !isBRect) {
            // TODO: Check if this supports rotated rectangles properly
            const dX = util.constrain(positionB.x, positionA.x - physicsA.size / 2, positionA.x + physicsA.size / 2) - positionB.x;
            const dY = util.constrain(positionB.y, positionA.y - physicsA.width / 2, positionA.y + physicsA.width / 2) - positionB.y;

            return dX*dX + dY*dY <= physicsB.size*physicsB.size
        } else if (physicsB.sides === 2 && physicsA.sides !== 2) {
            // TODO: Check if this supports rotated rectangles properly
            const dX = util.constrain(positionA.x, positionB.x - physicsB.size / 2, positionB.x + physicsB.size / 2) - positionA.x;
            const dY = util.constrain(positionA.y, positionB.y - physicsB.width / 2, positionB.y + physicsB.width / 2) - positionA.y;

            return dX*dX + dY*dY <= physicsA.size*physicsA.size;
        } else {
            const dX = positionA.x - positionB.x;
            const dY = positionA.y - positionB.y;
            const rSum = physicsA.size + physicsB.size;

            return dX*dX + dY*dY <= rSum*rSum;
        }
    }

    /** Calls the deletion animation, unless animate is set to false, in that case it instantly deletes. */
    public destroy(animate = true) {
        if (!animate) {
            if (this.deletionAnimation) this.deletionAnimation = null;

            this.delete();
        } else if (!this.deletionAnimation) { // if we aren't already deleting
            this.deletionAnimation = new DeletionAnimation(this);
        }
    }

    /** Extends Entity.delete, but removes child from parent. */
    public delete() {
        if (this.isChild) {
            util.removeFast(this.rootParent.children, this.rootParent.children.indexOf(this))
        } else {
            for (const child of this.children) {
                child.isChild = false;
                child.delete();
            }

            this.children.length = 0;
        }
        
        if (this.physicsData.values.flags & PhysicsFlags.showsOnMap) {
            const globalEntities = this.game.entities.globalEntities;
            util.removeFast(globalEntities, globalEntities.indexOf(this.id));
        }

        super.delete();
    }

    /** @deprecated Applies acceleration to the object. */
    public addAcceleration(angle: number, acceleration: number) {
        this.addVelocity(angle, acceleration);
    }

    public addVelocity(angle: number, magnitude: number) {
        this.velocity.add(Vector.fromPolar(angle, magnitude));
    }

    /** Sets the velocity of the object. */
    public setVelocity(angle: number, magnitude: number) {
        this.velocity.set(Vector.fromPolar(angle, magnitude));
    }

    /** Updates the acceleration. */
    public maintainVelocity(angle: number, maxSpeed: number) {
        // acceleration * 10 = max speed. this relationship is caused by friction
        this.addVelocity(angle, maxSpeed * 0.1);
    }

    /** Internal physics method used for calculating the current position of the object. */
    public applyPhysics() {
        if (this.velocity.magnitude < 0.01) this.velocity.magnitude = 0;
        // when being deleted, entities slow down half speed
        else if (this.deletionAnimation) this.velocity.magnitude /= 2;
        this.positionData.x += this.velocity.x;
        this.positionData.y += this.velocity.y;

        // apply friction opposite of current velocity
        this.addVelocity(this.velocity.angle, this.velocity.magnitude * -0.1);
    }

    /** Applies knockback after hitting `entity` */
    protected receiveKnockback(entity: ObjectEntity) {
        let kbMagnitude = this.physicsData.values.absorbtionFactor * entity.physicsData.values.pushFactor;
        let kbAngle: number;
        let diffY = this.positionData.values.y - entity.positionData.values.y;
        let diffX = this.positionData.values.x - entity.positionData.values.x;
        // Prevents drone stacking etc
        if (diffX === 0 && diffY === 0) kbAngle = Math.random() * util.PI2;
        else kbAngle = Math.atan2(diffY, diffX);

        if ((entity.physicsData.values.flags & PhysicsFlags.isSolidWall || entity.physicsData.values.flags & PhysicsFlags.isBase) && !(this.positionData.values.flags & PositionFlags.canMoveThroughWalls))  {
            if (entity.physicsData.values.flags & PhysicsFlags.isSolidWall) {
                if (this.relationsData.values.owner?.positionData && this.relationsData.values.team !== entity.relationsData.values.team) {
                    this.setVelocity(0, 0);
                    this.destroy(true) // Kills off bullets etc
                    return;
                }

                this.velocity.magnitude *= 0.3;
            }
            kbMagnitude /= 0.3;
        }
        if (entity.physicsData.values.sides === 2) {
            if (this.positionData.values.flags & PositionFlags.canMoveThroughWalls) {
                kbMagnitude = 0;
            } else {
                const relA = Math.cos(kbAngle + entity.positionData.values.angle) / entity.physicsData.values.size;
                const relB = Math.sin(kbAngle + entity.positionData.values.angle) / entity.physicsData.values.width;
                if (Math.abs(relA) <= Math.abs(relB)) {
                    if (relB < 0) {
                        this.addAcceleration(Math.PI * 3 / 2, kbMagnitude);
                    } else {
                        this.addAcceleration(Math.PI * 1 / 2, kbMagnitude);
                    }
                } else {
                    if (relA < 0) {
                        this.addAcceleration(Math.PI, kbMagnitude);
                    } else {
                        this.addAcceleration(0, kbMagnitude);
                    }
                }
            }
        } else {
            this.addAcceleration(kbAngle, kbMagnitude);
        }
    }

    /** Sets the parent in align with everything else. */
    public setParent(parent: ObjectEntity) {
        this.relationsData.parent = parent;
        this.rootParent = parent.rootParent;
        this.rootParent.children.push(this);

        this.isChild = true;
        this.isPhysical = false;
    }

    /** Returns the true world position (even for objects who have parents). */
    public getWorldPosition(): Vector {
        let pos = new Vector(this.positionData.values.x, this.positionData.values.y);

        const x = pos.x;
        const y = pos.y;
        
        let px = 0;
        let py = 0;
        let par = 0;
        
        let entity: ObjectEntity = this;
        while (entity.relationsData.values.parent instanceof ObjectEntity) {
            if (!(entity.relationsData.values.parent.positionData.values.flags & PositionFlags.absoluteRotation)) pos.angle += entity.positionData.values.angle;
            entity = entity.relationsData.values.parent;
            px += entity.positionData.values.x;
            py += entity.positionData.values.y;
            if (entity.positionData.values.flags & PositionFlags.absoluteRotation) par += entity.positionData.values.angle;
        }

        const cos = Math.cos(par);
        const sin = Math.sin(par);
        
        pos.x = px + x * cos - y * sin;
        pos.y = py + x * sin + y * cos;

        return pos;
    }
    
    public setGlobalEntity() {
        this.physicsData.flags |= PhysicsFlags.showsOnMap;
        
        this.game.entities.globalEntities.push(this.id);
    }

    public tick(tick: number) {
        this.deletionAnimation?.tick();

        for (let i = 0; i < this.children.length; ++i) this.children[i].tick(tick);
    
        // Keep things in the arena
        if (!(this.physicsData.values.flags & PhysicsFlags.canEscapeArena) && this.isPhysical) {
            const arena = this.game.arena;
            xPos: {
                if (this.positionData.values.x < arena.arenaData.values.leftX - arena.ARENA_PADDING) this.positionData.x = arena.arenaData.values.leftX - arena.ARENA_PADDING;
                else if (this.positionData.values.x > arena.arenaData.values.rightX + arena.ARENA_PADDING) this.positionData.x = arena.arenaData.values.rightX + arena.ARENA_PADDING;
                else break xPos;
            }
            yPos: {
                if (this.positionData.values.y < arena.arenaData.values.topY - arena.ARENA_PADDING) this.positionData.y = arena.arenaData.values.topY - arena.ARENA_PADDING;
                else if (this.positionData.values.y > arena.arenaData.values.bottomY + arena.ARENA_PADDING) this.positionData.y = arena.arenaData.values.bottomY + arena.ARENA_PADDING;
                else break yPos;
            }
        }
    }
}
