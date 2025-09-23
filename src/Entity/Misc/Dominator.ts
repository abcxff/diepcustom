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

import { Color, ColorsHexCode, NameFlags, StyleFlags, Tank, ClientBound } from "../../Const/Enums";
import ArenaEntity from "../../Native/Arena";
import ClientCamera, { CameraEntity } from "../../Native/Camera";
import { AI, AIState, Inputs } from "../AI";
import LivingEntity from "../Live";
import Bullet from "../Tank/Projectile/Bullet";
import TankBody from "../Tank/TankBody";
import TeamBase from "./TeamBase";
import { TeamEntity } from "./TeamEntity";

/**
 * Dominator Tank
 */
export default class Dominator extends TankBody {
    /** Size of a dominator */
    public static SIZE = 160;

    /** The AI that controls how the Dominator aims. */
    public ai: AI;

    /** The base its located on (used to change base color). */
    public base: TeamBase;
    
    public prefix: string | null = "";

    public constructor(arena: ArenaEntity, base: TeamBase, pTankId: Tank | null = null) {
        let tankId: Tank;
        if (pTankId === null) {
            const r = Math.random() * 3;

            if (r < 1) tankId = Tank.DominatorD;
            else if (r < 2) tankId = Tank.DominatorG;
            else tankId = Tank.DominatorT;
        } else tankId = pTankId;

        const inputs = new Inputs();
        const camera = new CameraEntity(arena.game);

        camera.setLevel(75);
        camera.sizeFactor = (Dominator.SIZE / 50);

        super(arena.game, camera, inputs);

        this.relationsData.values.team = arena;
        this.physicsData.values.size = Dominator.SIZE;
        // TODO(ABC):
        // Add setTeam method for this
        this.styleData.values.color = Color.Neutral;

        this.ai = new AI(this, true);
        this.ai.inputs = inputs;
        this.ai.movementSpeed = 0;
        this.ai.viewRange = 2000;
        this.ai.doAimPrediction = true;

        this.setTank(tankId);
        const def = (this.definition = Object.assign({}, this.definition));
        def.speed = camera.cameraData.values.movementSpeed = 0;
        this.nameData.values.name = "Dominator";
        this.nameData.values.flags |= NameFlags.hiddenName;
        this.physicsData.values.absorbtionFactor = 0;
        
        this.positionData.values.x = base.positionData.values.x;
        this.positionData.values.y = base.positionData.values.y;
        
        this.scoreReward = 0;
        camera.cameraData.values.player = this;

        this.base = base;

        Object.defineProperty(this, "damagePerTick", {
            get() {
                return 10;
            },
            set() {}
        });

        if (this.styleData.values.flags & StyleFlags.isFlashing) { // Remove spawn shield
            this.styleData.values.flags ^= StyleFlags.isFlashing;
            this.damageReduction = 1.0;
        }
    }

    public onDeath(killer: LivingEntity) {
        if (this.relationsData.values.team === this.game.arena && killer.relationsData.values.team instanceof TeamEntity) {
            const killerTeam = killer.relationsData.values.team;
            this.relationsData.team = killerTeam || this.game.arena;
            this.styleData.color = this.relationsData.team.teamData?.teamColor || killer.styleData.values.color;
            this.game.broadcast()
                .u8(ClientBound.Notification)
                .stringNT(`The ${this.prefix}${this.nameData.values.name} is now controlled by ${killerTeam.teamName}`)
                .u32(ColorsHexCode[killerTeam.teamData.values.teamColor])
                .float(7500)
                .stringNT("").send();
                
            for (const client of this.game.clients) {
                const camera = client.camera;
                if (!camera) continue;

                if (camera.relationsData.values.team === this.relationsData.values.team) client.notify(`Press H to take control of the ${this.nameData.values.name}`, ColorsHexCode[killerTeam.teamData.values.teamColor])
            }
        } else {
            this.relationsData.team = this.game.arena
            this.styleData.color = this.game.arena.teamData.teamColor;
            
           this.game.broadcast()
               .u8(ClientBound.Notification)
               .stringNT(`The ${this.prefix}${this.nameData.values.name} is being contested`)
               .u32(ColorsHexCode[Color.Neutral])
               .float(7500)
               .stringNT("").send();  
        }

        this.base.styleData.color = this.styleData.values.color;
        this.base.relationsData.team = this.relationsData.values.team;;

        this.healthData.health = this.healthData.values.maxHealth;

        for (let i = 1; i <= this.game.entities.lastId; ++i) {
            const entity = this.game.entities.inner[i];
            if (entity instanceof Bullet && entity.relationsData.values.owner === this) entity.destroy();
        }

        if (this.ai.state === AIState.possessed) {
            this.ai.inputs.deleted = true;
            this.ai.inputs = this.inputs = new Inputs();
            this.ai.state = AIState.idle;
        }
    }

    public tick(tick: number) {
        if (!this.barrels.length) return super.tick(tick)
        this.ai.aimSpeed = this.barrels[0].bulletAccel;
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
    }
}
