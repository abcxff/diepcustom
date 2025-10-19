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

import GameServer from "../Game";
import Vector, { VectorAbstract } from "../Physics/Vector";
import ObjectEntity from "./Object";

import { InputFlags, PhysicsFlags } from "../Const/Enums";
import { Entity } from "../Native/Entity";
import { PhysicsGroup, PositionGroup, RelationsGroup } from "../Native/FieldGroups";
import PackedEntitySet from "../Physics/PackedEntitySet";

// Beware
// The logic in this file is somewhat messed up

/**
 * Used for simplifying the current state of the AI.
 * - `idle`: When the AI is idle
 * - `target`: When the AI has found a target
 */
export const enum AIState {
    idle = 0,
    hasTarget = 1,
    possessed = 3
}

/**
 * Inputs are the shared thing between AIs and Clients. Both use inputs
 * and both can replace eachother.
 */
export class Inputs {
    /**
     * InputFlags.
     */
    public flags = 0;
    /** Mouse position */
    public mouse: Vector = new Vector();
    /** Movement direction */
    public movement: Vector = new Vector();
    /** Whether the inputs are deleted or not. */
    public deleted = false;

    public constructor() { }

    public attemptingShot(): boolean {
        return !!(this.flags & InputFlags.leftclick);
    }
    public attemptingRepel(): boolean {
        return !!(this.flags & InputFlags.rightclick);
    }
}

/**
 * The Intelligence behind Auto Turrets.
 */
export class AI {
    /** Default static rotation that Auto Turrets rotate when in passive mode. */
    public static PASSIVE_ROTATION = 0.01;
    /** Whether a player < FullAccess can claim */
    public isClaimable: boolean = false;

    /** Specific rotation of the AI in passive mode. */
    public passiveRotation = Math.random() < .5 ? AI.PASSIVE_ROTATION : -AI.PASSIVE_ROTATION;
    /** View range in diep units. */
    public viewRange = 1700;
    /** The state of the AI. */
    public state = AIState.idle;

    /** The inputs, which are more like outputs for the AI. */
    public inputs: Inputs = new Inputs();
    /** The entity's whose AI is `this`. */
    public owner: ObjectEntity;
    /** The current game. */
    public game: GameServer;
    /** The AI's target. */
    public target: Entity & { positionData: PositionGroup, physicsData: PhysicsGroup, relationsData: RelationsGroup, velocity: Vector } | null = null;
    /** The speed at which the ai's owner can move. */
    public movementSpeed = 1;
    /** The speed at which the ai can reach the target. */
    public aimSpeed = 1;
    /** If the AI should predict enemy's movements, and aim accordingly. */
    public doAimPrediction: boolean = false;

    /** Optionally filter targets for health */
    public targetFilterNonLiving = true;
    /** Target filter letting owner classes filter what can't be a target by position - false = not valid target */
    public targetFilter: (possibleTargetPos: VectorAbstract) => boolean;

    /** Stores a per-AI hash used to optimize ticking */
    private _aiHash: number;
    private static _aiHashCounter = 0;

    private _findTargetInterval: number = 2;

    public constructor(owner: ObjectEntity, claimable?: boolean) {
        this.owner = owner;
        this.game = owner.game;
        this._aiHash = (AI._aiHashCounter++) % 16384;

        this.inputs.mouse.set({
            x: 20,
            y: 0
        });

        this.targetFilter = () => true;
        if (claimable) this.isClaimable = true;

        this.game.entities.AIs.push(this);
    }

    /* Finds the closest entity in a different team */
    public findTarget(tick: number) {
        // If there's a target interval, wait a cycle till looking for new target
        if (this._findTargetInterval !== 0 && ((tick + this._aiHash) % this._findTargetInterval) !== 1) {
            return Entity.exists(this.target) ? this.target : (this.target = null);
        }

        const rootPos = this.owner.rootParent.positionData.values;
        const team = this.owner.relationsData.values.team;

        // TODO(speed): find a way to speed up
        if (Entity.exists(this.target)) {

            // If the AI already has a valid target within view distance, it's not necessary to find a new one

            // Make sure the target hasn't changed teams, and is existant (sides != 0)
            if (team !== this.target.relationsData.values.team && this.target.physicsData.values.sides !== 0) {
                // confirm its within range
                const targetDistSq = (this.target.positionData.values.x - rootPos.x) ** 2 + (this.target.positionData.values.y - rootPos.y) ** 2;
                if (this.targetFilter(this.target.positionData.values) && targetDistSq < (this.viewRange ** 2) * 2) return this.target; // this range is inaccurate i think

            }
        }

        // const entities = this.game.entities.inner.slice(0, this.game.entities.lastId);
        const root = (this.owner.rootParent === this.owner && (this.owner.relationsData.values.owner as ObjectEntity)?.positionData) ? this.owner.relationsData.values.owner as ObjectEntity : this.owner.rootParent;
        const entities = this.viewRange === Infinity
            ? PackedEntitySet.FULL_SET
            : this.game.entities.collisionManager.retrieve(
                root.positionData.values.x, root.positionData.values.y,
                this.viewRange, this.viewRange
            );

        let closestEntity = null;
        let closestDistSq = this.viewRange ** 2;

        for (let i = 0; i < entities.data.length; ++i) {
            let chunk = entities.data[i];

            while (chunk) {
                const bitValue = chunk & -chunk;
                const bitIdx = 31 - Math.clz32(bitValue);
                chunk ^= bitValue;
                const id = 32 * i + bitIdx;

                const entity = this.game.entities.inner[id] as ObjectEntity;
                if (!entity || entity.hash === 0) continue;
                if (!entity.positionData || !entity.relationsData || !entity.physicsData) continue;

                if (!entity.isPhysical) continue;
                // Check if the target is living
                if (this.targetFilterNonLiving && !entity.healthData) continue;
                // Check if the target is a base
                if (entity.physicsData.values.flags & PhysicsFlags.isBase) continue;
                // Don't target entities who have an object owner
                if (entity.relationsData.values.owner !== null && entity.relationsData.values.owner.positionData) continue;
                // Check if target is own team
                if (entity.relationsData.values.team === team) continue;
                // Check if target has a collider
                if (entity.physicsData.values.sides === 0) continue;
                // Custom check
                if (!this.targetFilter(entity.positionData.values)) continue;

                const dX = entity.positionData.values.x - rootPos.x;
                const dY = entity.positionData.values.y - rootPos.y;
                const distSq = dX * dX + dY * dY;

                if (distSq < closestDistSq) {
                    closestEntity = entity;
                    closestDistSq = distSq;
                }
            }
        }

        return this.target = closestEntity as Entity & { positionData: PositionGroup, physicsData: PhysicsGroup, relationsData: RelationsGroup, velocity: Vector };
    }

    /** Aims and predicts at the target. */
    public aimAtTarget() {
        if(!this.target) return;

        const movementSpeed = this.aimSpeed * 1.6;
        const ownerPos = this.owner.getWorldPosition();

        const pos = {
            x: this.target.positionData.values.x,
            y: this.target.positionData.values.y,
        }

        if (movementSpeed <= 0.001) { // Pls no weirdness

            this.inputs.movement.set({
                x: pos.x - ownerPos.x,
                y: pos.y - ownerPos.y
            });

            this.inputs.mouse.set(pos);

            // this.inputs.movement.angle = Math.atan2(delta.y, delta.x);
            this.inputs.movement.magnitude = 1;
            return;
        }
        if (this.doAimPrediction) {
            const delta = {
                x: pos.x - ownerPos.x,
                y: pos.y - ownerPos.y
            }

            let dist = Math.sqrt(delta.x ** 2 + delta.y ** 2);
            if (dist === 0) dist = 1;

            const unitDistancePerp = {
                x: delta.y / dist,
                y: -delta.x / dist
            }

            let entPerpComponent = unitDistancePerp.x * this.target.velocity.x + unitDistancePerp.y * this.target.velocity.y;

            if (entPerpComponent > movementSpeed * 0.9) entPerpComponent = movementSpeed * 0.9;

            if (entPerpComponent < movementSpeed * -0.9) entPerpComponent = movementSpeed * -0.9;

            const directComponent = Math.sqrt(movementSpeed ** 2 - entPerpComponent ** 2);
            const offset = (entPerpComponent / directComponent * dist) / 2;

            this.inputs.mouse.set({
                x: pos.x + offset * unitDistancePerp.x,
                y: pos.y + offset * unitDistancePerp.y
            });

        } else {
            this.inputs.mouse.set({
                x: pos.x,
                y: pos.y
            });
        }

        this.inputs.movement.magnitude = 1;
        this.inputs.movement.angle = Math.atan2(this.inputs.mouse.y - ownerPos.y, this.inputs.mouse.x - ownerPos.x);
    }

    public tick(tick: number) {
        // If its being posessed, but its possessor is deleted... then just restart;
        if (this.state === AIState.possessed) {
            if (!this.inputs.deleted) return;

            this.inputs = new Inputs();
        }

        const target = this.findTarget(tick);

        if (!target) {
            this.inputs.flags = 0;
            this.state = AIState.idle;
            const angle = this.inputs.mouse.angle + this.passiveRotation;

            this.inputs.mouse.set({
                x: Math.cos(angle) * 100,
                y: Math.sin(angle) * 100
            });
        } else {
            this.state = AIState.hasTarget;
            this.inputs.flags |= InputFlags.leftclick;
            this.aimAtTarget();
        }
    }
}
