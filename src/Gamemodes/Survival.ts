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
import GameServer from "../Game";
import ArenaEntity, { ArenaState } from "../Native/Arena";
import { Entity } from "../Native/Entity";
import TankBody from "../Entity/Tank/TankBody";

import ShapeManager from "../Entity/Shape/Manager";
import { ArenaFlags, ClientBound } from "../Const/Enums";
import { tps, scoreboardUpdateInterval } from "../config";

const minPlayers = 4;

/**
 * Manage shape count
 */
export class SurvivalShapeManager extends ShapeManager {
    protected get wantedShapes() {
        const mult = 50 * 50;
        const ratio = Math.ceil(Math.pow(this.game.arena.width / mult, 2));
        return Math.floor(12.5 * ratio);
    }
}

/**
 * Survival Gamemode Arena
 */
export default class SurvivalArena extends ArenaEntity {
    /** Limits shape count to floor(12.5 * player count) */
    protected shapes: ShapeManager = new SurvivalShapeManager(this);

    public constructor(game: GameServer) {
        super(game);
        this.shapeScoreRewardMultiplier = 3.0;

        this.updateBounds(2500, 2500);
        this.arenaData.values.flags &= ~ArenaFlags.gameReadyStart;
        this.arenaData.values.playersNeeded = minPlayers;
    }
    
    public updateArenaState() {
        this.setSurvivalArenaSize();

        if ((this.game.tick % scoreboardUpdateInterval) === 0) {
            const players = this.getAlivePlayers();
            // Sorts them too DONT FORGET
            this.updateScoreboard(players);
        }

        const players = this.getAlivePlayers();
        const aliveCount = players.length;

        if (aliveCount <= 1 && this.state === ArenaState.OPEN) {
            /*
            this.game.broadcast()
            .u8(ClientBound.Notification)
            .stringNT(`${players[0]?.nameData.values.name || "an unnamed tank"} HAS WON THE GAME!`)
            .u32(0x000000)
            .float(-1)
            .stringNT("").send();
            */

            this.state = ArenaState.OVER;
            this.close();
        }

        if (aliveCount === 0 && this.state === ArenaState.CLOSING) {
            this.state = ArenaState.CLOSED;

            // This is a one-time, end of life event, so we just use setTimeout
            setTimeout(() => {
                this.game.end();
            }, 5000);
            return;
        }
    }

    public setSurvivalArenaSize() {
        const arenaSize = Math.floor(25 * Math.sqrt(Math.max(this.game.arena.getAlivePlayers().length, 1))) * 100;
        this.updateBounds(arenaSize, arenaSize);
    }

    public manageCountdown() {
        if (this.state === ArenaState.WAIT) {
            this.arenaData.playersNeeded = minPlayers - this.game.clientsAwaitingSpawn.size;
            if (this.arenaData.values.playersNeeded <= 0) {
                this.arenaData.flags |= ArenaFlags.gameReadyStart;
            } else {
                this.arenaData.values.ticksUntilStart = 10 * tps;
                if (this.arenaData.flags & ArenaFlags.gameReadyStart) this.arenaData.flags &= ~ArenaFlags.gameReadyStart;
            }
        }

        if (this.arenaData.values.ticksUntilStart <= 0) {
            this.arenaData.flags = ArenaFlags.noJoining; // No joining once the game has started, and also no respawns
        }

        super.manageCountdown();
    }
    
    public spawnPlayer(tank: TankBody, client: Client) {
        // Since all players spawn at once, we need to update arena size per each spawn. Otherwise it will be updated next tick and players will spawn too close together
        this.setSurvivalArenaSize();
        super.spawnPlayer(tank, client)
    }

    public tick(tick: number) {
        for (const client of this.game.clients) {
            const camera = client.camera;
            if (camera && Entity.exists(camera.cameraData.values.player)) camera.cameraData.score += 0.2;
        }
        super.tick(tick);
    }
}
