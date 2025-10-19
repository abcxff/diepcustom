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
import ArenaEntity from "../Native/Arena";
import Client from "../Client";

import TeamBase from "../Entity/Misc/TeamBase";
import TankBody from "../Entity/Tank/TankBody";

import { TeamEntity } from "../Entity/Misc/TeamEntity";
import { Color } from "../Const/Enums";

const arenaSize = 11150;
const baseWidth = arenaSize / (3 + 1/3) * 0.6; // 2007

/**
 * Teams2 Gamemode Arena
 */
export default class Teams2Arena extends ArenaEntity {
    static override GAMEMODE_ID: string = "teams";

    /** Blue Team entity */
    public blueTeamBase: TeamBase;
    /** Red Team entity */
    public redTeamBase: TeamBase;
    // /** Limits shape count 100 */
    //     protected shapes: ShapeManager = new class extends ShapeManager {
    //     protected get wantedShapes() {
    //         return 64;
    //     }
    // }(this);

    /** Maps clients to their teams */
    public playerTeamMap: WeakMap<Client, TeamBase> = new WeakMap();
    
    public constructor(game: GameServer) {
        super(game);
        this.updateBounds(arenaSize * 2, arenaSize * 2);
        this.blueTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamBlue), -arenaSize + baseWidth / 2, 0, arenaSize * 2, baseWidth, true, 12, 2);
        this.redTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamRed), arenaSize - baseWidth / 2, 0, arenaSize * 2, baseWidth, true, 12, 2);
    }

    public spawnPlayer(tank: TankBody, client: Client) {
        tank.positionData.values.y = 2 * arenaSize * Math.random() - arenaSize;

        const xOffset = (Math.random() - 0.5) * baseWidth;
        
        const base = this.playerTeamMap.get(client) || [this.blueTeamBase, this.redTeamBase][0|Math.random()*2];
        tank.relationsData.values.team = base.relationsData.values.team;
        tank.styleData.values.color = base.styleData.values.color;
        tank.positionData.values.x = base.positionData.values.x + xOffset;
        this.playerTeamMap.set(client, base);

        if (client.camera) client.camera.relationsData.team = tank.relationsData.values.team;
    }
}
