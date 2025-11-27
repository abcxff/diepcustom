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

import type Client from "../Client";
import type GameServer from "../Game";
import Writer from "../Coder/Writer";
import { Entity, EntityStateFlags } from "./Entity";
import { compileCreation, compileUpdate } from "./UpcreateCompiler";
import { CameraEntity } from "./Camera";
import ObjectEntity from "../Entity/Object";
import { ClientBound } from "../Const/Enums";
import { removeFast } from "../util";

export default class ClientHandle {
    public client: Client;
    public game: GameServer;
    public view: Entity[] = [];

    public constructor(client: Client) {
        this.client = client;
        this.game = client.game;
    }

    public compileCreation(w: Writer, entity: Entity) {
        compileCreation(this.client.camera!, w, entity);
    }

    public compileUpdate(w: Writer, entity: Entity) {
        compileUpdate(this.client.camera!, w, entity);
    }

    /** Adds an entity to the current view. */
    private addToView(entity: Entity) {
        let c = this.view.find(r => r.id === entity.id)
        if (c) {
            console.log(c.toString(), entity.toString(), c === entity)
        }
        this.view.push(entity);
    }

    /** Removes an entity from the current view. */
    private removeFromView(id: number) {
        const index = this.view.findIndex(r => r.id === id);
        if (index === -1) return;

        removeFast(this.view, index);
    }

    /** Updates the client's view */
    public updateView(tick: number, player: ObjectEntity | null, cameraX: number, cameraY: number, width: number, height: number, fov: number) {
        const w = this.client.write().u8(ClientBound.Update).vu(tick);

        const deletes: { id: number, hash: number, noDelete?: boolean }[] = [];
        const updates: Entity[] = [];
        const creations: Entity[] = [];

        // TODO(speed)
        const entitiesNearRange = this.game.entities.collisionManager.retrieve(cameraX, cameraY, width, height);
        const entitiesInRange: ObjectEntity[] = [];

        const l = cameraX - width;
        const r = cameraX + width;
        const t = cameraY - height;
        const b = cameraY + height;
        for (let i = 0; i < entitiesNearRange.data.length; ++i) {
            let chunk = entitiesNearRange.data[i];

            while (chunk) {
                const bitValue = chunk & -chunk;
                const bitIdx = 31 - Math.clz32(bitValue);
                chunk ^= bitValue;
                const id = 32 * i + bitIdx;

                const entity = this.game.entities.inner[id] as ObjectEntity;
                const width = entity.physicsData.values.sides === 2 ? entity.physicsData.values.size / 2 : entity.physicsData.values.size;
                const size = entity.physicsData.values.sides === 2 ? entity.physicsData.values.width / 2 : entity.physicsData.values.size;
                        
                if (entity.positionData.values.x - width < r &&
                    entity.positionData.values.y + size > t &&
                    entity.positionData.values.x + width > l &&
                    entity.positionData.values.y - size < b
                ) {
                    if (entity !== player &&!(entity.styleData.values.opacity === 0 && !entity.deletionAnimation)) {
                        entitiesInRange.push(entity);
                    }
                }
            }
        }

        for (let id = 0; id < this.game.entities.globalEntities.length; ++id) {
            const entity = this.game.entities.inner[this.game.entities.globalEntities[id]] as ObjectEntity;
            
            if (!entitiesInRange.includes(entity)) entitiesInRange.push(entity);
        }

        if (Entity.exists(player) && player instanceof ObjectEntity) entitiesInRange.push(player);

        for (let i = 0; i < this.view.length; ++i) {
            const entity = this.view[i]
            if (entity instanceof ObjectEntity) {
                // TODO(speed)
                // Orphan children must be destroyed
                if (!entitiesInRange.includes(entity.rootParent)) {
                    deletes.push({id: entity.id, hash: entity.preservedHash});
                    continue;
                }
            }
            // If the entity is gone, notify the client, if its updated, notify the client
            if (entity.hash === 0) {
                deletes.push({ id: entity.id, hash: entity.preservedHash });
            } else if (entity.entityState & EntityStateFlags.needsCreate) {
                if (entity.entityState & EntityStateFlags.needsDelete) deletes.push({hash: entity.hash, id: entity.id, noDelete: true});
                creations.push(entity);
            } else if (entity.entityState & EntityStateFlags.needsUpdate) {
                updates.push(entity);
            }
        }

        // Now compile
        w.vu(deletes.length);
        for (let i = 0; i < deletes.length; ++i) {
            w.entid(deletes[i]);
            if (!deletes[i].noDelete) this.removeFromView(deletes[i].id);
        }

        // Yeah.
        if (this.view.length === 0) {
            creations.push(this.game.arena, this.client.camera!);
            this.view.push(this.game.arena, this.client.camera!);
        }
        
        const entities = this.game.entities;
        for (const id of this.game.entities.otherEntities) {
            // TODO(speed)
            if (this.view.findIndex(r => r.id === id) === -1) {
                const entity = entities.inner[id];

                if (!entity) continue;
                if (entity instanceof CameraEntity) continue;

                creations.push(entity);

                this.addToView(entity);
            }
        }

        for (const entity of entitiesInRange) {
            if (this.view.indexOf(entity) === -1) {
                creations.push(entity);
                this.addToView(entity);

                if (entity instanceof ObjectEntity) {
                    if (entity.children.length && !entity.isChild) {
                        // add any of its children
                        this.view.push.apply(this.view, entity.children);
                        creations.push.apply(creations, entity.children);
                    }
                }
            } else {
                if (!Entity.exists(entity)) throw new Error("wtf");
                // add untracked children, if it has any
                if (entity.children.length && !entity.isChild) {
                    for (let child of entity.children) {
                        if (this.view.findIndex(r => r.id === child.id) === -1) {
                            this.view.push.apply(this.view, entity.children);
                            creations.push.apply(creations, entity.children);
                        } //else if (child.hash === 0) deletes.push({hash: child.preservedHash, id: child})
                    }
                }
            }
        }

        // Arrays of entities
        w.vu(creations.length + updates.length);
        for (let i = 0; i < updates.length; ++i) {
            this.compileUpdate(w, updates[i]);
        }
        for (let i = 0; i < creations.length; ++i) {
            this.compileCreation(w, creations[i]);
        }

        w.send();
    }
}