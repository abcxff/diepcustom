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
import TankBody from "../Tank/TankBody";

import { Color, PhysicsFlags, PositionFlags, Stat, Tank } from "../../Const/Enums";
import { CameraEntity } from "../../Native/Camera";
import { AI, AIState, Inputs } from "../AI";

/**
 * Represents the Arena Closers that end the game.
 */
export default class ArenaCloser extends TankBody {
    /** Size of a level 0 Arena Closer. */
    public static BASE_SIZE = 175;
    
    /** The AI that controls how the AC moves. */
    public ai: AI;

    public constructor(game: GameServer) {
        const inputs = new Inputs();
        const camera = new CameraEntity(game);

        camera.setLevel(300);
        camera.sizeFactor = (ArenaCloser.BASE_SIZE / 50);

        super(game, camera, inputs);

        this.relationsData.values.team = game.arena;

        this.ai = new AI(this);
        this.ai.inputs = inputs;
        this.ai.viewRange = Infinity;

        this.setTank(Tank.ArenaCloser);

        const def = (this.definition = Object.assign({}, this.definition));
        // 598 is what the normal health increase for stat/level would be, so we just subtract it.
        def.maxHealth = 10000 - 598;
        // TODO(ABC):
        // Fix all the stats
        def.speed = this.ai.movementSpeed = this.cameraEntity.cameraData.values.movementSpeed = 80;

        Object.defineProperty(this, "damagePerTick", {
            get() {
                return 45;
            },
            set() {}
        });

        this.nameData.values.name = "Arena Closer";
        this.styleData.values.color = Color.Neutral;
        this.positionData.values.flags |= PositionFlags.canMoveThroughWalls;
        this.physicsData.values.flags |= PhysicsFlags.canEscapeArena;
        camera.cameraData.values.player = this;

        for (let i = Stat.MovementSpeed; i < Stat.BodyDamage; ++i) camera.cameraData.values.statLevels.values[i] = 7;

        this.ai.aimSpeed = this.barrels[0].bulletAccel * 1.6;
        this.setInvulnerability(true);
    }

    public tick(tick: number) {
        this.inputs = this.ai.inputs;

        if (this.ai.state === AIState.idle) {
            const angle = this.positionData.values.angle + this.ai.passiveRotation;
            const mag = Math.sqrt((this.inputs.mouse.x - this.positionData.values.x) ** 2 + (this.inputs.mouse.y - this.positionData.values.y) ** 2);
            this.inputs.mouse.set({
                x: this.positionData.values.x + Math.cos(angle) * mag,
                y: this.positionData.values.y + Math.sin(angle) * mag
            });
        }

        super.tick(tick);

        this.ai.movementSpeed = this.cameraEntity.cameraData.movementSpeed = 80;
    }
}
