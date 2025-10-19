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
import { Color, ColorsHexCode, ArenaFlags, ValidScoreboardIndex, ClientBound } from "../Const/Enums";
import { TeamEntity } from "../Entity/Misc/TeamEntity";
import TankBody from "../Entity/Tank/TankBody";
import LivingEntity from "../Entity/Live";
import GameServer from "../Game";
import ArenaEntity, { ArenaState } from "../Native/Arena";
import { Entity } from "../Native/Entity";
import { shuffleArray } from "../util";
import { tps, scoreboardUpdateInterval } from "../config";

import TeamBase from "../Entity/Misc/TeamBase"
import Dominator from "../Entity/Misc/Dominator"

import ShapeManager from "../Entity/Shape/Manager";

const arenaSize = 11150;
const TEAM_COLORS = [Color.TeamBlue, Color.TeamRed, Color.TeamPurple, Color.TeamGreen];
const MIN_PLAYERS = TEAM_COLORS.length * 1; // It is higher in the official servers, though we do not have enough players for that (4 players per team)

const SHRINK_AMOUNT = 100;
const SHRINK_INTERVAL = 15 * tps;
const MIN_SIZE = 6600;

const ENABLE_DOMINATOR = false;

shuffleArray(TEAM_COLORS); // Randomize leading team

/**
 * Manage shape count
 */
export class TagShapeManager extends ShapeManager {
    protected get wantedShapes() {
        const ratio = Math.ceil(Math.pow(this.game.arena.width / 2500, 2));

        return Math.floor(12.5 * ratio);
    }
}

/**
 * Tag Gamemode Arena
 */
export default class TagArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "tag";

    protected shapes: ShapeManager = new TagShapeManager(this);
	
    /** All team entities in game */
    public teams: TeamEntity[] = [];

    /** Maps clients to their team */
    public playerTeamMap: WeakMap<Client, TeamEntity> = new WeakMap();

    public constructor(game: GameServer) {
        super(game);
        this.shapeScoreRewardMultiplier = 3.0;

        this.arenaData.values.flags |= ArenaFlags.hiddenScores;
		
        for (const teamColor of TEAM_COLORS) {
            const team = new TeamEntity(this.game, teamColor);
            this.teams.push(team);
        }

        if (ENABLE_DOMINATOR) {
            const domBaseSize = 3345 / 2
            new Dominator(this, new TeamBase(game, this, 0, 0, domBaseSize, domBaseSize, false));
        }

        this.updateBounds(arenaSize * 2, arenaSize * 2);
    }

    public spawnPlayer(tank: TankBody, client: Client) {
        this.updateArenaState();
        const deathMixin = tank.onDeath.bind(tank); 
        tank.onDeath = (killer: LivingEntity) => {
            deathMixin(killer);

            if (this.game.clients.size < MIN_PLAYERS) return;
            const team = tank.relationsData.values.team;
            const killerTeam = killer.relationsData.values.team;

            const playerIsATeam = team instanceof TeamEntity && this.teams.includes(team);
            if (!playerIsATeam) return;
			
            const killerTeamIsATeam = killerTeam instanceof TeamEntity && this.teams.includes(killerTeam);
            if (killerTeamIsATeam) this.playerTeamMap.set(client, killerTeam); // Respawn with killer's team, if it is valid
            else this.playerTeamMap.set(client, team);
        }

        if (!this.playerTeamMap.has(client)) {
            const team = this.getAlivePlayers().length <= MIN_PLAYERS ? this.teams[this.teams.length - 1] :
                         this.teams[0]; // If there are not enough players to start the game, choose the team with least players. Otherwise choose the one with highest player count
            const { x, y } = this.findSpawnLocation();

            tank.positionData.values.x = x;
            tank.positionData.values.y = y;
            tank.relationsData.values.team = team;
            tank.styleData.values.color = team.teamData.teamColor;

            this.playerTeamMap.set(client, team)
            return;
        }

        const team = this.playerTeamMap.get(client) || this.teams[0];

        this.playerTeamMap.set(client, team);

        tank.relationsData.values.team = team;
        tank.styleData.values.color = team.teamData.values.teamColor;

        const { x, y } = this.findSpawnLocation();

        tank.positionData.values.x = x;
        tank.positionData.values.y = y;

        if (client.camera) client.camera.relationsData.team = tank.relationsData.values.team;
    }

    public updateScoreboard() {
        const length = Math.min(10, this.teams.length);
        for (let i = 0; i < length; ++i) {
            const team = this.teams[i];
            const playerCount = this.getTeamPlayers(team).length;
            if (team.teamData.values.teamColor === Color.Tank) this.arenaData.values.scoreboardColors[i as ValidScoreboardIndex] = Color.ScoreboardBar;
            else this.arenaData.values.scoreboardColors[i as ValidScoreboardIndex] = team.teamData.values.teamColor;
            this.arenaData.values.scoreboardNames[i as ValidScoreboardIndex] = team.teamName;
            this.arenaData.values.scoreboardTanks[i as ValidScoreboardIndex] = -1;
            this.arenaData.values.scoreboardScores[i as ValidScoreboardIndex] = playerCount;
            this.arenaData.values.scoreboardSuffixes[i as ValidScoreboardIndex] = playerCount === 1 ? " player" : " players";
        }
       
        this.arenaData.scoreboardAmount = Math.min(10, length);
    }
	
    public updateArenaState() {
        this.teams.sort((t1, t2) => this.getTeamPlayers(t2).length - this.getTeamPlayers(t1).length);
        const length = Math.min(10, this.teams.length);
        const arenaPlayerCount = this.getAlivePlayers().length; // Only count alive players for win condition
        const leaderTeam = this.teams[0]; // Most players are in this team
        for (let i = 0; i < length; ++i) {
            const team = this.teams[i];
			
            if (this.getTeamPlayers(leaderTeam).length === arenaPlayerCount && arenaPlayerCount >= MIN_PLAYERS) { // If all alive players are in the leading team, it has won since all other team's players have died
                if (this.state === ArenaState.OPEN) {
                    this.game.broadcast()
                        .u8(ClientBound.Notification)
                        .stringNT(`${leaderTeam.teamName} HAS WON THE GAME!`)
                        .u32(ColorsHexCode[leaderTeam.teamData.values.teamColor])
                        .float(-1)
                        .stringNT("").send();
						
                    this.state = ArenaState.OVER;
                    setTimeout(() => {
                        this.close();
                    }, 5000);
                }
            }
        }

        if (arenaPlayerCount === 0 && this.state === ArenaState.CLOSING) {
            this.state = ArenaState.CLOSED;

            // This is a one-time, end of life event, so we just use setTimeout
            setTimeout(() => {
                this.game.end();
            }, 10000);
            return;
        }

        if ((this.game.tick % scoreboardUpdateInterval) === 0) {
            this.updateScoreboard();
        }

        if ((this.game.tick % SHRINK_INTERVAL) === 0 && this.width > MIN_SIZE) {
            this.updateBounds(this.width - SHRINK_AMOUNT, this.height - SHRINK_AMOUNT);
        }
    }
}

