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

import { ClientInputs } from "../../Client";
import { tps } from "../../config";
import { Color, Tank, Stat, ColorsHexCode, ClientBound, TeamFlags } from "../../Const/Enums";
import GameServer from "../../Game";
import ArenaEntity, { ArenaState } from "../../Native/Arena";
import { CameraEntity } from "../../Native/Camera";
import { AI, AIState, Inputs } from "../AI";
import Live from "../Live";
import TankBody from "../Tank/TankBody";
import { TeamEntity } from "./TeamEntity";

const POSSESSION_TIMER = tps * 60 * 5;

/**
 * Mothership Entity
 */
export default class Mothership extends TankBody {
    /** The AI that controls how the Mothership aims. */
    public ai: AI;

    /** If the mothership's AI ever gets possessed, this is the tick that the possession started. */
    public possessionStartTick: number = -1;

    public constructor(game: GameServer) {

        const inputs = new Inputs();
        const camera = new CameraEntity(game);

        camera.setLevel(140);

        super(game, camera, inputs);

        this.relationsData.values.team = game.arena;

        this.styleData.values.color = Color.Neutral;

        this.ai = new AI(this, true);
        this.ai.inputs = inputs;
        this.ai.viewRange = 2000;
        
        this.positionData.values.x = 0;
        this.positionData.values.y = 0;
        
        this.setTank(Tank.Mothership);
        
        this.nameData.values.name = "Mothership"
        
        this.scoreReward = 0;
        
        camera.cameraData.values.player = this;

        for (let i = Stat.MovementSpeed; i < Stat.HealthRegen; ++i) camera.cameraData.values.statLevels.values[i] = 7;
        camera.cameraData.values.statLevels.values[Stat.HealthRegen] = 1;

        const def = (this.definition = Object.assign({}, this.definition));
        // 418 is what the normal health increase for stat/level would be, so we just subtract it and force it 7k
        def.maxHealth = 7008 - 418;
    }

    public onDeath(killer: Live): void {
        if ((this.game.arena.state >= ArenaState.OVER)) return; // Do not send a defeat notification if the game has been won already

        const team = this.relationsData.values.team;
        const teamIsATeam = team instanceof TeamEntity;

        const killerTeam = killer.relationsData.values.team;
        const killerTeamIsATeam = killerTeam instanceof TeamEntity;

        // UNCOMMENT TO ALLOW SOLO KILLS
        // if (!killerTeamIsATeam) return;
        this.game.broadcast()
            .u8(ClientBound.Notification)
            // If mothership has a team name, use it, otherwise just say has destroyed a mothership
            .stringNT(`${killerTeamIsATeam ? killerTeam.teamName : (killer.nameData?.values.name || "an unnamed tank")} has destroyed ${teamIsATeam ? team.teamName + "'s" : "a"} Mothership!`)
            .u32(killerTeamIsATeam ? ColorsHexCode[killerTeam.teamData.values.teamColor] : 0x000000)
            .float(-1)
            .stringNT("").send();   
    }

    public delete(): void {
        // No more mothership arrow - seems like in old diep this wasn't the case - we should probably keep though
        if (this.relationsData.values.team?.teamData) this.relationsData.values.team.teamData.flags  &= ~TeamFlags.hasMothership;
        super.delete();
    }


    public tick(tick: number) {
        if (!this.barrels.length) return super.tick(tick)

        this.inputs = this.ai.inputs;

        if (this.ai.state === AIState.idle) {
            const angle = this.positionData.values.angle + this.ai.passiveRotation;
            const mag = Math.sqrt((this.inputs.mouse.x - this.positionData.values.x) ** 2 + (this.inputs.mouse.y - this.positionData.values.y) ** 2);
            this.inputs.mouse.set({
                x: this.positionData.values.x + Math.cos(angle) * mag,
                y: this.positionData.values.y + Math.sin(angle) * mag
            });
        } else if (this.ai.state === AIState.possessed && this.possessionStartTick === -1) {
            this.possessionStartTick = tick;
        }
        if (this.possessionStartTick !== -1 && this.ai.state !== AIState.possessed) {
            this.possessionStartTick = -1;
        }

        // after 10 minutes, kick out the person possessing
        if (this.possessionStartTick !== -1) {
            if (this.possessionStartTick !== -1 && this.ai.state !== AIState.possessed) {
                this.possessionStartTick = -1;
            } else if (this.inputs instanceof ClientInputs) {
                if (tick - this.possessionStartTick >= POSSESSION_TIMER) {
                    this.inputs.deleted = true;
                } else if (tick - this.possessionStartTick === Math.floor(POSSESSION_TIMER - 10 * tps)) {
                    this.inputs.client.notify("You only have 10 seconds left in control of the Mothership", ColorsHexCode[this.styleData.values.color], 5_000, "");
                }
            }
        }
        const team = this.relationsData.values.team;
        if (team?.teamData) {
            team.teamData.mothershipX = this.positionData.values.x;
            team.teamData.mothershipY = this.positionData.values.y;
            team.teamData.flags |= TeamFlags.hasMothership;
        }

        super.tick(tick);
    }
}
