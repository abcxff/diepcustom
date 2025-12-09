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
import { randomFrom } from "../util";

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
    /** Maps clients to their teams */
    public playerTeamMap: WeakMap<Client, TeamBase> = new WeakMap();
    
    public constructor(game: GameServer) {
        super(game);
        this.updateBounds(arenaSize * 2, arenaSize * 2);
        this.blueTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamBlue), -arenaSize + baseWidth / 2, 0, arenaSize * 2, baseWidth, true, 12, 2);
        this.redTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamRed), arenaSize - baseWidth / 2, 0, arenaSize * 2, baseWidth, true, 12, 2);
    }
    
    public findPlayerSpawnLocation(player: TankBody) {
        const xOffset = (Math.random() - 0.5) * baseWidth;
        const client = player.cameraEntity.getClient() as Client;
        const base = this.playerTeamMap.get(client) as TeamBase;
        
        const x = base.positionData.values.x + xOffset,
              y = 2 * arenaSize * Math.random() - arenaSize

        return { x, y }
    }

    public spawnPlayer(tank: TankBody, client: Client) {
        const base = this.playerTeamMap.get(client) || randomFrom([this.blueTeamBase, this.redTeamBase]);
        tank.relationsData.values.team = base.relationsData.values.team;
        tank.styleData.values.color = base.styleData.values.color;
        this.playerTeamMap.set(client, base);
        
        super.spawnPlayer(tank, client);
    }
}