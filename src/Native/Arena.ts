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
import ClientCamera from "./Camera";

import { VectorAbstract } from "../Physics/Vector";
import { ArenaGroup, TeamGroup } from "./FieldGroups";
import { Entity } from "./Entity";
import { Color, ArenaFlags, ValidScoreboardIndex } from "../Const/Enums";
import { PI2, saveToLog } from "../util";
import { TeamGroupEntity } from "../Entity/Misc/TeamEntity";
import Client from "../Client";
import AbstractBoss from "../Entity/Boss/AbstractBoss";
import Guardian from "../Entity/Boss/Guardian";
import Summoner from "../Entity/Boss/Summoner";
import FallenOverlord from "../Entity/Boss/FallenOverlord";
import FallenBooster from "../Entity/Boss/FallenBooster";
import Defender from "../Entity/Boss/Defender";
import { bossSpawningInterval, scoreboardUpdateInterval } from "../config";

export const enum ArenaState {
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
	/** Always existant arena field group. Present in all arenas. */
	public arenaData: ArenaGroup = new ArenaGroup(this);
	/** Always existant team field group. Present in all (or maybe just ffa) arenas. */
	public teamData: TeamGroup = new TeamGroup(this);
	/** Cached width of the arena. Not sent to the client directly. */
	public width: number;
	/** Cached height of the arena. Not sent to the client directly. */
	public height: number;
	/** Whether or not the arena allows new players to spawn. */
	public state: ArenaState = ArenaState.OPEN;

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
	public ARENA_PADDING = 200;

	public constructor(game: GameServer) {
		super(game);

		this.updateBounds(this.width = 22300, this.height = 22300);

		this.arenaData.values.topY = -this.height / 2;
		this.arenaData.values.bottomY = this.height / 2;
		this.arenaData.values.leftX = -this.width / 2;
		this.arenaData.values.rightX = this.width / 2;

		this.arenaData.values.flags = ArenaFlags.gameReadyStart;
		this.teamData.values.teamColor = Color.Neutral;
	}

	/**
	 * Finds a spawnable location on the map.
	 */
	 public findSpawnLocation(): VectorAbstract {
		const pos = {
			x: ~~(Math.random() * this.width - this.width / 2),
			y: ~~(Math.random() * this.height - this.height / 2),
		}

		findSpawn: for (let i = 0; i < 20; ++i) {
			const entities = this.game.entities.collisionManager.retrieve(pos.x, pos.y, 1000, 1000);

			// Only spawn < 1000 units away from player, unless we can't find a place to spawn
			for (let len = entities.length; --len >= 0;) {
				if (entities[len] instanceof TankBody && (entities[len].positionData.values.x - pos.x) ** 2 + (entities[len].positionData.values.y - pos.y) ** 2 < 1_000_000) { // 1000^2
					pos.x = ~~(Math.random() * this.width - this.width / 2);
					pos.y = ~~(Math.random() * this.height - this.height / 2);

					continue findSpawn;
				}
			}

			break;
		}

		return pos;
	}

	/**
	 * Updates the scoreboard / leaderboard arena fields.
	 */
	protected updateScoreboard(scoreboardPlayers: TankBody[]) {

		const scoreboardCount = this.arenaData.scoreboardAmount = (this.arenaData.values.flags & ArenaFlags.hiddenScores) ? 0 : Math.min(scoreboardPlayers.length, 10);

		if (scoreboardCount) {
			this.arenaData.flags |= ArenaFlags.showsLeaderArrow;
			let i;
			for (i = 0; i < scoreboardCount; ++i) {
				const player = scoreboardPlayers[i];
				
				if (player.styleData.values.color === Color.Tank) this.arenaData.values.scoreboardColors[i as ValidScoreboardIndex] = Color.ScoreboardBar;
				else this.arenaData.values.scoreboardColors[i as ValidScoreboardIndex] = player.styleData.values.color;
				this.arenaData.values.scoreboardNames[i as ValidScoreboardIndex] = player.nameData.values.name;
				this.arenaData.values.scoreboardScores[i as ValidScoreboardIndex] = player.scoreData.values.score;
				// _currentTank only since ts ignore
				this.arenaData.values.scoreboardTanks[i as ValidScoreboardIndex] = player['_currentTank'];
			}
		} else if (this.arenaData.values.flags & ArenaFlags.showsLeaderArrow) this.arenaData.flags ^= ArenaFlags.showsLeaderArrow;
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
		const { x, y } = this.findSpawnLocation();

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

		setTimeout(() => {

			const acCount = Math.floor(Math.sqrt(this.width) / 10);
			const radius = this.width * Math.SQRT1_2 + 500;
			for (let i = 0; i < acCount; ++i) {
				const ac = new ArenaCloser(this.game);

				const angle = (i / acCount) * PI2;
				ac.positionData.values.x = Math.cos(angle) * radius;
				ac.positionData.values.y = Math.sin(angle) * radius;
				ac.positionData.values.angle = angle + Math.PI;
			}

			saveToLog("Arena Closing", "Arena running at `" + this.game.gamemode + "` is now closing.", 0xFFE869);
		}, 5000);
	}

	/** Spawns the boss into the arena */
	protected spawnBoss() {
		const TBoss = [Guardian, Summoner, FallenOverlord, FallenBooster, Defender]
			[~~(Math.random() * 5)];
		
		this.boss = new TBoss(this.game);
	}

	public tick(tick: number) {
		this.shapes.tick();

		if (this.allowBoss && this.game.tick >= 1 && (this.game.tick % bossSpawningInterval) === 0 && !this.boss) {
			this.spawnBoss();
		}

        if (this.state === ArenaState.CLOSED) return;
		
		if ((this.game.tick % scoreboardUpdateInterval) === 0) {
			const players: TankBody[] = [];
			for (let id = 0; id <= this.game.entities.lastId; ++id) {
				const entity = this.game.entities.inner[id];
			
				if (Entity.exists(entity) && entity instanceof TankBody && entity.cameraEntity instanceof ClientCamera && entity.cameraEntity.cameraData.values.player === entity) players.push(entity);
			}
			players.sort((p1, p2) => p2.scoreData.values.score - p1.scoreData.values.score);
			this.leader = players[0];

			// Sorts them too DONT FORGET
			this.updateScoreboard(players);

			if (players.length === 0 && this.state === ArenaState.CLOSING) {
				this.state = ArenaState.CLOSED;

				setTimeout(() => {
					this.game.end();
				}, 10000);
				return;
			}
		}
		if (this.leader && this.arenaData.values.flags & ArenaFlags.showsLeaderArrow) {
			this.arenaData.leaderX = this.leader.positionData.values.x;
			this.arenaData.leaderY = this.leader.positionData.values.y;
		}
	}
}
