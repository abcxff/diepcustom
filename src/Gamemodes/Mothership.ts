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

import Client from "../Client";
import { Color, ArenaFlags, TeamFlags, ValidScoreboardIndex } from "../Const/Enums";
import Mothership from "../Entity/Misc/Mothership";
import { TeamEntity } from "../Entity/Misc/TeamEntity";
import TankBody from "../Entity/Tank/TankBody";
import GameServer from "../Game";
import ArenaEntity, { ArenaState } from "../Native/Arena";
import { Entity } from "../Native/Entity";
import { PI2 } from "../util";

const arenaSize = 11150;
const TEAM_COLORS = [Color.TeamBlue, Color.TeamRed];

/**
 * Mothership Gamemode Arena
 */
export default class MothershipArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "mot";

    /** All team entities in game */
    public teams: TeamEntity[] = [];
    /** Motherships in game */
    public motherships: Mothership[] = [];

    /** Maps clients to their mothership */
    public playerTeamMotMap: WeakMap<Client, Mothership> = new WeakMap();

    public constructor(game: GameServer) {
        super(game);
        this.shapeScoreRewardMultiplier = 3.0;

        this.arenaData.values.flags |= ArenaFlags.hiddenScores;

        // little fun thing to support multiple teams - spread colors around map
        let randAngle = Math.random() * PI2;
        for (const teamColor of TEAM_COLORS) {
            const team = new TeamEntity(this.game, teamColor);
            this.teams.push(team);
            const mot = new Mothership(this.game);
            this.motherships.push(mot);
    
            mot.relationsData.values.team = team;
            mot.styleData.values.color = team.teamData.values.teamColor;
            mot.positionData.values.x = Math.cos(randAngle) * arenaSize * 0.75;
            mot.positionData.values.y = Math.sin(randAngle) * arenaSize * 0.75;

            randAngle += PI2 / TEAM_COLORS.length;
        }

        this.updateBounds(arenaSize * 2, arenaSize * 2);
    }

    public spawnPlayer(tank: TankBody, client: Client) {
        if (!this.motherships.length && !this.playerTeamMotMap.has(client)) {
            const team = this.teams[~~(Math.random()*this.teams.length)];
            const { x, y } = this.findSpawnLocation();

            tank.positionData.values.x = x;
            tank.positionData.values.y = y;
            tank.relationsData.values.team = team;
            tank.styleData.values.color = team.teamData.teamColor;
            return;
        }

        const mothership = this.playerTeamMotMap.get(client) || this.motherships[~~(Math.random() * this.motherships.length)];
        this.playerTeamMotMap.set(client, mothership);

        tank.relationsData.values.team = mothership.relationsData.values.team;
        tank.styleData.values.color = mothership.styleData.values.color;

        // TODO: Possess mothership if its unpossessed
        if (Entity.exists(mothership)) {
            tank.positionData.values.x = mothership.positionData.values.x;
            tank.positionData.values.y = mothership.positionData.values.y;
        } else {
            const { x, y } = this.findSpawnLocation();

            tank.positionData.values.x = x;
            tank.positionData.values.y = y;
        }

        if (client.camera) client.camera.relationsData.team = tank.relationsData.values.team;
    }
    public updateScoreboard() {
        this.motherships.sort((m1, m2) => m2.healthData.values.health - m1.healthData.values.health);

        const length = Math.min(10, this.motherships.length);
        for (let i = 0; i < length; ++i) {
            const mothership = this.motherships[i];
            const team = mothership.relationsData.values.team;
            const isTeamATeam = team instanceof TeamEntity;
            if (mothership.styleData.values.color === Color.Tank) this.arenaData.values.scoreboardColors[i as ValidScoreboardIndex] = Color.ScoreboardBar;
            else this.arenaData.values.scoreboardColors[i as ValidScoreboardIndex] = mothership.styleData.values.color;
            this.arenaData.values.scoreboardNames[i as ValidScoreboardIndex] = isTeamATeam ? team.teamName : `Mothership ${i+1}`;
            // TODO: Change id
            this.arenaData.values.scoreboardTanks[i as ValidScoreboardIndex] = -1;
            this.arenaData.values.scoreboardScores[i as ValidScoreboardIndex] = mothership.healthData.values.health;
            this.arenaData.values.scoreboardSuffixes[i as ValidScoreboardIndex] = " HP";
        }
       
        this.arenaData.scoreboardAmount = length;
    }
    public updateArenaState() {
        // backwards to preserve
        for (let i = this.motherships.length; i --> 0;) {
            const mot = this.motherships[i];
            if (!Entity.exists(mot)) {
                const pop = this.motherships.pop();
                if (pop && i < this.motherships.length) this.motherships[i] = pop;
            }
        }

        if (this.motherships.length <= 1) {
            if (this.state === ArenaState.OPEN) {
                this.state = ArenaState.OVER;
                setTimeout(() => {
                    this.close();
                }, 5000);
            }
        }
        const players = this.getAlivePlayers();
        if (players.length === 0 && this.state === ArenaState.CLOSING) {
            this.state = ArenaState.CLOSED;

            // This is a one-time, end of life event, so we just use setTimeout
            setTimeout(() => {
                this.game.end();
            }, 10000);
            return;
        }
        this.updateScoreboard();
    }
}
