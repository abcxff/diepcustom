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
import Velocity from "../Physics/Velocity";
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

    /** Whether or not the entity is near a camera. */
    public isViewed: boolean = false;

    /** Velocity used for physics. */
    public velocity = new Velocity();
    /** Acceleration used for physics. */
    public accel = new Vector();

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

            this.children = [];
        }

        super.delete();
    }

    /** Applies acceleration to the object. */
    public addAcceleration(angle: number, acceleration: number, negateFriction = false) {
        if (negateFriction) {
            const frictionComponent = this.velocity.angleComponent(angle) * .1;

            acceleration += frictionComponent;
        }

        this.accel.add(Vector.fromPolar(angle, acceleration));
    }

    /** Sets the velocity of the object. */
    public setVelocity(angle: number, magnitude: number) {
        // this.a.set(Vector.fromPolar(angle, acceleration));
        this.velocity.setPosition(this.positionData.values);
        this.velocity.set(Vector.fromPolar(angle, magnitude));
    }

    /** Updates the acceleration. */
    public maintainVelocity(angle: number, maxSpeed: number) {
        // acceleration * 10 = max speed. this relationship is caused by friction
        this.accel.add(Vector.fromPolar(angle, maxSpeed * 0.1));
    }

    /** Internal physics method used for calculating the current position of the object. */
    public applyPhysics() {
        if (!this.isViewed) {
            this.accel.set(new Vector(0, 0));
            return;
        }

        // apply friction opposite of current velocity
        this.addAcceleration(this.velocity.angle, this.velocity.magnitude * -0.1);

        // delta velocity
        this.velocity.add(this.accel);

        if (this.velocity.magnitude < 0.01) this.velocity.magnitude = 0;
        // when being deleted, entities slow down half speed
        else if (this.deletionAnimation) this.velocity.magnitude /= 2;
        this.positionData.x += this.velocity.x;
        this.positionData.y += this.velocity.y;

        // don't accumulate acceleration across ticks
        this.accel.set(new Vector(0, 0));
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
                this.accel.magnitude *= 0.3;
                this.velocity.magnitude *= 0.3;
            }
            kbMagnitude /= 0.3;
        }
        if (entity.physicsData.values.sides === 2) {
            if (this.positionData.values.flags & PositionFlags.canMoveThroughWalls) {
                kbMagnitude = 0;
            } else if (entity.physicsData.values.flags & PhysicsFlags.isSolidWall && this.relationsData.values.owner instanceof ObjectEntity && !(Entity.exists(this.relationsData.values.team) && this.relationsData.values.team === entity.relationsData.values.team)) {
                // this is a bit off still. k
                this.velocity.setPosition(this.positionData.values);
                this.setVelocity(0, 0);
                this.destroy(true) // Kills off bullets etc
                return;
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

    /** Detects collisions. */
    protected findCollisions() {
        if (this.cachedTick === this.game.tick) return this.cachedCollisions;
        
        this.cachedTick = this.game.tick;
        this.cachedCollisions = [];

        // Lets just let the game deal with this next tick.
        if (this.hash === 0) return [];
        if (this.physicsData.values.sides === 0) return [];

        // TODO(speed):
        // and the for loop
        const entities = this.game.entities.collisionManager.retrieveEntitiesByEntity(this);
        for (let i = 0; i < entities.length; ++i) {
            const entity = entities[i];
            if (entity === this) continue;
            if (entity.deletionAnimation) continue;
            if (entity.relationsData.values.team === this.relationsData.values.team) {
                if ((entity.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision) ||
                    (this.physicsData.values.flags & PhysicsFlags.noOwnTeamCollision)) continue;

                if (entity.relationsData.values.owner !== this.relationsData.values.owner) {
                    if ((entity.physicsData.values.flags & PhysicsFlags.onlySameOwnerCollision) ||
                        (this.physicsData.values.flags & PhysicsFlags.onlySameOwnerCollision)) continue;
                }
            }
            
            if (this.relationsData.values.team === this.game.arena && (entity.physicsData.values.flags & PhysicsFlags.isBase)) continue;

            if (entity.physicsData.values.sides === 0) continue;
            if (entity.physicsData.values.sides === 2 && this.physicsData.values.sides === 2) {
                // in Diep.io source code, rectangles do not support collisions with other rectangles
                // uncomment the following code to enable rect on rect collisions
                /*
                if (
                    Math.abs(entity.positionData.values.x - this.positionData.values.x) <= (entity.physicsData.values.size + this.physicsData.values.size) / 2 &&
                    Math.abs(entity.positionData.values.y - this.positionData.values.y) <= (entity.physicsData.values.width +this.physicsData.values.width) / 2
                   ) this.cachedCollisions.push(entity);
                */
            } else if (this.physicsData.values.sides !== 2 && entity.physicsData.values.sides === 2) {
                const dX = util.constrain(this.positionData.values.x, entity.positionData.values.x - entity.physicsData.values.size / 2, entity.positionData.values.x + entity.physicsData.values.size / 2) - this.positionData.values.x;
                const dY = util.constrain(this.positionData.values.y, entity.positionData.values.y - entity.physicsData.values.width / 2, entity.positionData.values.y + entity.physicsData.values.width / 2) - this.positionData.values.y;

                if (dX ** 2 + dY ** 2 <= this.physicsData.size ** 2) this.cachedCollisions.push(entity);
            } else if (this.physicsData.values.sides === 2 && entity.physicsData.values.sides !== 2) {
                const dX = util.constrain(entity.positionData.values.x, this.positionData.values.x - this.physicsData.values.size / 2, this.positionData.values.x + this.physicsData.values.size / 2) - entity.positionData.values.x;
                const dY = util.constrain(entity.positionData.values.y, this.positionData.values.y - this.physicsData.values.width / 2, this.positionData.values.y + this.physicsData.values.width / 2) - entity.positionData.values.y;

                if (dX ** 2 + dY ** 2 <= entity.physicsData.size ** 2) this.cachedCollisions.push(entity);
            } else {
                if ((entity.positionData.values.x - this.positionData.values.x) ** 2 + (entity.positionData.values.y - this.positionData.values.y) ** 2 <= (entity.physicsData.values.size + this.physicsData.values.size) ** 2) {
                    this.cachedCollisions.push(entity);
                }
            }
        }

        return this.cachedCollisions;
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

    public tick(tick: number) {
        this.velocity.setPosition(this.positionData.values);
        this.deletionAnimation?.tick();

        if (this.isPhysical && !(this.deletionAnimation)) {
            const collidedEntities = this.findCollisions();

            for (let i = 0; i < collidedEntities.length; ++i) {
                this.receiveKnockback(collidedEntities[i]);
            }
        }

        if (this.isViewed) for (let i = 0; i < this.children.length; ++i) this.children[i].tick(tick);
        
        // Keep things in the arena
        if (!(this.physicsData.values.flags & PhysicsFlags.canEscapeArena)) {
            const arena = this.game.arena;
            xPos: {
                if (this.positionData.values.x < arena.arenaData.values.leftX - arena.ARENA_PADDING) this.positionData.x = arena.arenaData.values.leftX - arena.ARENA_PADDING;
                else if (this.positionData.values.x > arena.arenaData.values.rightX + arena.ARENA_PADDING) this.positionData.x = arena.arenaData.values.rightX + arena.ARENA_PADDING;
                else break xPos;

                this.velocity.position.x = this.positionData.values.x;
            }
            yPos: {
                if (this.positionData.values.y < arena.arenaData.values.topY - arena.ARENA_PADDING) this.positionData.y = arena.arenaData.values.topY - arena.ARENA_PADDING;
                else if (this.positionData.values.y > arena.arenaData.values.bottomY + arena.ARENA_PADDING) this.positionData.y = arena.arenaData.values.bottomY + arena.ARENA_PADDING;
                else break yPos;

                this.velocity.position.y = this.positionData.values.y;
            }
        }
    }
}
