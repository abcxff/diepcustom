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
import ArenaEntity from "../../Native/Arena";

import ShapeManager from "../../Entity/Shape/Manager";
import TankBody from "../../Entity/Tank/TankBody";
import AbstractShape from "../../Entity/Shape/AbstractShape";
import Client from "../../Client";
import { TeamEntity } from "../../Entity/Misc/TeamEntity";
import { Color } from "../../Const/Enums";
import { SandboxShapeManager } from "../Sandbox";

/**
 * Manage shape count
 */
class JungleShapeManager extends SandboxShapeManager {
    protected spawnShape(): AbstractShape {
        const shape = super.spawnShape();
        shape.physicsData.values.size *= 2.6;
        shape.healthData.values.health = (shape.healthData.values.maxHealth *= 4.3);
        shape.physicsData.values.absorbtionFactor /= 6;
        shape.scoreReward *= 19

        return shape;
    }
}

/**
 * Sandbox Gamemode Arena
 */
export default class JungleArena extends ArenaEntity {
    /** Limits shape count to floor(12.5 * player count) */
    protected shapes: ShapeManager = new JungleShapeManager(this);

    protected playerTeam: TeamEntity;

    public constructor(game: GameServer) {
        super(game);

        this.playerTeam = new TeamEntity(game, Color.TeamBlue);

        this.updateBounds(2500, 2500);
    }

    public spawnPlayer(tank: TankBody, client: Client): void {
        super.spawnPlayer(tank, client);

        tank.relationsData.values.team = this.playerTeam;
        tank.styleData.values.color = this.playerTeam.teamData.values.teamColor;
        if (client.camera) client.camera.relationsData.team = tank.relationsData.values.team;
    }

    public tick(tick: number) {
        const arenaSize = Math.floor(25 * Math.sqrt(Math.max(this.game.clients.size, 1))) * 100;
        if (this.width !== arenaSize || this.height !== arenaSize) this.updateBounds(arenaSize, arenaSize);

        super.tick(tick);
    }
}
