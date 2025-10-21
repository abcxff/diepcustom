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
import ShapeManager from "../Entity/Shape/Manager";
import TankBody from "../Entity/Tank/TankBody";
import ArenaCloser from "../Entity/Misc/ArenaCloser";

import { VectorAbstract } from "../Physics/Vector";
import { ArenaGroup, TeamGroup } from "./FieldGroups";
import { Entity } from "./Entity";
import { Color, ArenaFlags, CameraFlags, ValidScoreboardIndex } from "../Const/Enums";
import { PI2, saveToLog } from "../util";
import { TeamGroupEntity } from "../Entity/Misc/TeamEntity";

import Client from "../Client";

import AbstractBoss from "../Entity/Boss/AbstractBoss";
import Guardian from "../Entity/Boss/Guardian";
import Summoner from "../Entity/Boss/Summoner";
import FallenOverlord from "../Entity/Boss/FallenOverlord";
import FallenBooster from "../Entity/Boss/FallenBooster";
import Defender from "../Entity/Boss/Defender";

import { countdownTicks, bossSpawningInterval, scoreboardUpdateInterval } from "../config";

export const enum ArenaState {
    /** Countdown, waiting for players screen */
    COUNTDOWN = -1,
    /** Alive, open */
    OPEN = 0,
    /** Game ended - someone won */
    OVER = 1,
    /** Lobby starts to close */
    CLOSING = 2,
    /** Lobby closed */
    CLOSED = 3,
}

/**
 * The Arena Entity, sent to the client and also used for internal calculations.
 */
export default class ArenaEntity extends Entity implements TeamGroupEntity {
    /** Gamemode id to be used for gamemode listing */
    public static GAMEMODE_ID: string | null = null;

    /** Always existant arena field group. Present in all arenas. */
    public arenaData: ArenaGroup = new ArenaGroup(this);

    /** Always existant team field group. Present in all (or maybe just ffa) arenas. */
    public teamData: TeamGroup = new TeamGroup(this);

    /** Cached width of the arena. Not sent to the client directly. */
    public width: number;

    /** Cached height of the arena. Not sent to the client directly. */
    public height: number;

    /** Whether or not the arena allows new players to spawn. */
    public state: ArenaState = ArenaState.COUNTDOWN;

    public shapeScoreRewardMultiplier: number = 1;

    /** Enable or disable natural boss spawning */
    public allowBoss: boolean = true;

    /** The current boss spawned into the game */
    public boss: AbstractBoss | null = null;

    /** Scoreboard leader */
    public leader: TankBody | null = null;

    /** Controller of all shapes in the arena. */
    protected shapes = new ShapeManager(this);

    /** Padding between arena size and maximum movement border. */
    public ARENA_PADDING: number = 200;

    public constructor(game: GameServer) {
        super(game);

        this.updateBounds(this.width = 22300, this.height = 22300);

        this.arenaData.values.topY = -this.height / 2;
        this.arenaData.values.bottomY = this.height / 2;
        this.arenaData.values.leftX = -this.width / 2;
        this.arenaData.values.rightX = this.width / 2;

        this.arenaData.values.flags = ArenaFlags.gameReadyStart;
        this.arenaData.values.playersNeeded = 0;
        this.arenaData.values.ticksUntilStart = countdownTicks;

        this.teamData.values.teamColor = Color.Neutral;
    }

    /** Returns if the arena is open */
    public isOpen(): boolean {
        return this.state === ArenaState.OPEN;
    }

    /** Returns if the arena is counting down to open */
    public isCountingDown(): boolean {
        return this.state === ArenaState.COUNTDOWN;
    }

    /** Returns if the arena game is over */
    public isGameOver(): boolean {
        return this.state === ArenaState.OVER;
    }

    /** Returns if the arena is closing */
    public isClosing(): boolean {
        return this.state === ArenaState.CLOSING;
    }

    /** Returns if the arena is closed */
    public isClosed(): boolean {
        return this.state === ArenaState.CLOSED;
    }

    /**
     * Finds a spawnable location on the map.
     */
     public findSpawnLocation(isPlayer: boolean=false): VectorAbstract {
        const pos = {
            x: ~~(Math.random() * this.width - this.width / 2),
            y: ~~(Math.random() * this.height - this.height / 2),
        }

        for (let i = 0; i < 20; ++i) {
            if (
                !this.isValidSpawnLocation(pos.x, pos.y) ||
                isPlayer && Math.max(pos.x, pos.y) < this.arenaData.values.rightX / 2 && Math.min(pos.x, pos.y) > this.arenaData.values.leftX / 2
            ) {
                pos.x = ~~(Math.random() * this.width - this.width / 2);
                pos.y = ~~(Math.random() * this.height - this.height / 2);
                continue;
            }

            // If there is any tank within 1000 units, find a new position
            const entity = this.game.entities.collisionManager.getFirstMatch(pos.x, pos.y, 1000, 1000, (entity) => {
                if (!(entity instanceof TankBody)) return false;

                const dX = entity.positionData.values.x - pos.x;
                const dY = entity.positionData.values.y - pos.y;

                return (dX * dX + dY * dY) < 1_000_000; // 1000^2
            });

            if (entity) {
                pos.x = ~~(Math.random() * this.width - this.width / 2);
                pos.y = ~~(Math.random() * this.height - this.height / 2);
                continue;
            }

            break;
        }

        return pos;
    }
    
    /** Checks if players or shapes can spawn at the given coordinates. */
    public isValidSpawnLocation(x: number, y: number): boolean {
        // Override in gamemode files
        return true;
    }

    /**
     * Updates the scoreboard / leaderboard arena fields.
     */
    protected updateScoreboard(scoreboardPlayers: TankBody[]) {
        const scoreboardCount = this.arenaData.scoreboardAmount = (this.arenaData.values.flags & ArenaFlags.hiddenScores) ? 0 : Math.min(scoreboardPlayers.length, 10);

        if (!scoreboardCount) {
            if (this.arenaData.values.flags & ArenaFlags.showsLeaderArrow) {
                this.arenaData.flags ^= ArenaFlags.showsLeaderArrow;
            }

            return;
        }

        scoreboardPlayers.sort((p1, p2) => p2.scoreData.values.score - p1.scoreData.values.score);
        this.leader = scoreboardPlayers[0];
        
        this.arenaData.flags |= ArenaFlags.showsLeaderArrow;
        for (let i: ValidScoreboardIndex = 0; i < scoreboardCount; i = (i + 1) as ValidScoreboardIndex) {
            const player = scoreboardPlayers[i];
            
            if (player.styleData.values.color === Color.Tank) this.arenaData.values.scoreboardColors[i] = Color.ScoreboardBar;
            else this.arenaData.values.scoreboardColors[i] = player.styleData.values.color;
            this.arenaData.values.scoreboardNames[i] = player.nameData.values.name;
            this.arenaData.values.scoreboardScores[i] = player.scoreData.values.score;
            // _currentTank only since ts ignore
            this.arenaData.values.scoreboardTanks[i] = player['_currentTank'];
        }
    }

    /** Updates scoreboard and finalizes CLOSING of arena */
    protected updateArenaState() {
        if ((this.game.tick % scoreboardUpdateInterval) !== 0) return;

        const players = this.getAlivePlayers();
        // Sorts them too DONT FORGET
        this.updateScoreboard(players);
        
        if (players.length === 0 && this.state === ArenaState.CLOSING) {
            this.state = ArenaState.CLOSED;

            // This is a one-time, end of life event, so we just use setTimeout
            setTimeout(() => {
                this.game.end();
            }, 10000);
            return;
        }
    }

    /** Deals with countdown screen and game start logic. */
    public manageCountdown() {
        const isReady = this.arenaData.values.flags & ArenaFlags.gameReadyStart;

        if (isReady) this.arenaData.ticksUntilStart--;

        if (this.state === ArenaState.COUNTDOWN && isReady && this.arenaData.values.ticksUntilStart < 0) {
            this.onGameStarted();
        }

        for (const [client, name] of this.game.clientsAwaitingSpawn) {
            const camera = client.camera;
            if (!Entity.exists(camera)) continue;

            if (this.state === ArenaState.COUNTDOWN) {
                // If the game has not yet started, display countdown and keep this client in the waiting list
                camera.cameraData.flags = CameraFlags.gameWaitingStart;
                continue;
            }

            // Otherwise, proceed as usual
            client.createAndSpawnPlayer(name);

            // Remove this client from waiting list once this is done
            this.game.clientsAwaitingSpawn.delete(client);
        }
    }

    /** Returns all alive, player controlled tanks. */
    public getAlivePlayers() {
        const players: TankBody[] = [];
        for (const client of this.game.clients) {
            const entity = client.camera?.cameraData.values.player;

            if (Entity.exists(entity) && entity instanceof TankBody) players.push(entity);
        }
        return players;
    }

    /** Returns all alive, player controlled tanks on the given team */
    public getTeamPlayers(team: TeamGroupEntity) {
        const players = this.getAlivePlayers();
        const teamPlayers: TankBody[] = [];
        for (let i = 0; i < players.length; ++i) {
            const entity = players[i];

            if (entity.relationsData.values.team === team) teamPlayers.push(entity);
        }
        return teamPlayers;
    }

    /**
     * Updates the size of the map. It should be the only way to modify arena size.
     */
    public updateBounds(arenaWidth: number, arenaHeight: number) {
        this.width = arenaWidth;
        this.height = arenaHeight;

        this.arenaData.topY = -arenaHeight / 2;
        this.arenaData.bottomY = arenaHeight / 2;
        this.arenaData.leftX = -arenaWidth / 2;
        this.arenaData.rightX = arenaWidth / 2;
    }

    /**
     * Allows the arena to decide how players are spawned into the game.
     */
    public spawnPlayer(tank: TankBody, client: Client) {
        const { x, y } = this.findSpawnLocation(true);

        tank.positionData.values.x = x;
        tank.positionData.values.y = y;
    }

    /**
     * Closes the arena.
     */
    public close() {
        for (const client of this.game.clients) {
            client.notify("Arena closed: No players can join", 0xFF0000, -1);
        }

        this.state = ArenaState.CLOSING;
        this.arenaData.flags |= ArenaFlags.noJoining;

        const acCount = Math.floor(Math.sqrt(this.width) / 10);
        const radius = this.width * Math.SQRT1_2 + 5000;
        for (let i = 0; i < acCount; ++i) {
            const ac = new ArenaCloser(this.game);

            const angle = (i / acCount) * PI2;
            ac.positionData.values.x = Math.cos(angle) * radius;
            ac.positionData.values.y = Math.sin(angle) * radius;
            ac.positionData.values.angle = angle + Math.PI;
        }

        saveToLog("Arena Closing", "Arena running at `" + this.game.gamemode + "` is now closing.", 0xFFE869);
    }

    /** This code will be executed once per game, when the countdown ends and players are spawned into the game. */
    public onGameStarted() {
        this.state = ArenaState.OPEN;
    }

    /** Spawns the boss into the arena */
    protected spawnBoss() {
        const TBoss = [Guardian, Summoner, FallenOverlord, FallenBooster, Defender]
            [~~(Math.random() * 5)];
        
        this.boss = new TBoss(this.game);

        const { x, y } = this.game.arena.findSpawnLocation();
        this.boss.positionData.values.x = x;
        this.boss.positionData.values.y = y;
    }

    public tick(tick: number) {
        this.shapes.tick();
        this.updateArenaState();
        this.manageCountdown();

        if (this.leader && this.arenaData.values.flags & ArenaFlags.showsLeaderArrow) {
            this.arenaData.leaderX = this.leader.positionData.values.x;
            this.arenaData.leaderY = this.leader.positionData.values.y;
        }

        if (this.allowBoss && this.game.tick >= 1 && (this.game.tick % bossSpawningInterval) === 0 && !this.boss) {
            this.spawnBoss();
        }
    }
}
