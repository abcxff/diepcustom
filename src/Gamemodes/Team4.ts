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
const baseSize = arenaSize / (3 + 1/3); // 3345

/**
 * Teams4 Gamemode Arena
 */
export default class Teams4Arena extends ArenaEntity {
    static override GAMEMODE_ID: string = "4teams";

    /** Blue TeamBASEentity */
    public blueTeamBase: TeamBase;
    /** Red TeamBASE entity */
    public redTeamBase: TeamBase;
    /** Green TeamBASE entity */
    public greenTeamBase: TeamBase;
    /** Purple TeamBASE entity */
    public purpleTeamBase: TeamBase;

    /** Maps clients to their teams */
    public playerTeamMap: WeakMap<Client, TeamBase> = new WeakMap();

    public constructor(game: GameServer) {
        super(game);
        this.updateBounds(arenaSize * 2, arenaSize * 2);

        this.blueTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamBlue), -arenaSize + baseSize / 2,  -arenaSize + baseSize / 2, baseSize, baseSize);
        this.redTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamRed), arenaSize - baseSize / 2, arenaSize - baseSize / 2, baseSize, baseSize);
        this.greenTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamGreen), -arenaSize + baseSize / 2,  arenaSize - baseSize / 2, baseSize, baseSize);
        this.purpleTeamBase = new TeamBase(game, new TeamEntity(this.game, Color.TeamPurple), arenaSize - baseSize / 2, -arenaSize + baseSize / 2, baseSize, baseSize);
    }

    public spawnPlayer(tank: TankBody, client: Client) {
        tank.positionData.values.y = arenaSize * Math.random() - arenaSize;

        const xOffset = (Math.random() - 0.5) * baseSize,
              yOffset = (Math.random() - 0.5) * baseSize;
        
        const base = this.playerTeamMap.get(client) || [this.blueTeamBase, this.redTeamBase, this.greenTeamBase, this.purpleTeamBase][0|Math.random()*4];
        tank.relationsData.values.team = base.relationsData.values.team;
        tank.styleData.values.color = base.styleData.values.color;
        tank.positionData.values.x = base.positionData.values.x + xOffset;
        tank.positionData.values.y = base.positionData.values.y + yOffset;
        this.playerTeamMap.set(client, base);

        if (client.camera) client.camera.relationsData.team = tank.relationsData.values.team;
    }
}
