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

import ObjectEntity from "../Entity/Object";
import TeamBase from "../Entity/Misc/TeamBase";
import TankBody from "../Entity/Tank/TankBody";

import { TeamEntity } from "../Entity/Misc/TeamEntity";
import { Color } from "../Const/Enums";
import { randomFrom } from "../util";

const arenaSize = 11150;
const baseSize = arenaSize / (3 + 1/3); // 3345

/**
 * Teams4 Gamemode Arena
 */
export default class Teams4Arena extends ArenaEntity {
    static override GAMEMODE_ID: string = "4teams";

    /** Blue Team entity */
    public blueTeamEntity: TeamEntity;
    /** Red TeamBASE entity */
    public redTeamEntity: TeamEntity;
    /** Green TeamBASE entity */
    public greenTeamEntity: TeamEntity;
    /** Purple TeamBASE entity */
    public purpleTeamEntity: TeamEntity;

    /** Maps clients to their teams */
    public playerTeamMap: WeakMap<Client, TeamEntity> = new WeakMap();

    public constructor(game: GameServer) {
        super(game);

        this.updateBounds(arenaSize * 2, arenaSize * 2);

        this.blueTeamEntity = new TeamEntity(this.game, Color.TeamBlue);
        this.redTeamEntity = new TeamEntity(this.game, Color.TeamRed);
        this.purpleTeamEntity = new TeamEntity(this.game, Color.TeamPurple);
        this.greenTeamEntity = new TeamEntity(this.game, Color.TeamGreen);
        
        new TeamBase(game, this.blueTeamEntity, -arenaSize + baseSize / 2,  -arenaSize + baseSize / 2, baseSize, baseSize);
        new TeamBase(game, this.redTeamEntity, arenaSize - baseSize / 2, arenaSize - baseSize / 2, baseSize, baseSize);
        new TeamBase(game, this.purpleTeamEntity, -arenaSize + baseSize / 2,  arenaSize - baseSize / 2, baseSize, baseSize);
        new TeamBase(game, this.greenTeamEntity, arenaSize - baseSize / 2, -arenaSize + baseSize / 2, baseSize, baseSize);
    }

    public decideTeam(client: Client): TeamEntity {
        const team =  this.playerTeamMap.get(client) || randomFrom([this.blueTeamEntity, this.redTeamEntity, this.purpleTeamEntity, this.greenTeamEntity]);
        this.playerTeamMap.set(client, team);

        return team;
    }

    public spawnPlayer(tank: TankBody, client: Client) {
        const team = this.decideTeam(client);
        TeamEntity.setTeam(team, tank);
        
        const success = this.attemptFactorySpawn(tank);
        if (success) return; // This player was spawned from a factory instead

        const base = team.base;
        if (!base) return super.spawnPlayer(tank, client);

        const pos = ObjectEntity.getRandomPosition(base);
        tank.positionData.x = pos.x;
        tank.positionData.y = pos.y;
    }
}
