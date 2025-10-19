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
import { tps, countdownTicks, scoreboardUpdateInterval } from "../config";

const MIN_PLAYERS = 4;

/**
 * Manage shape count
 */
export class SurvivalShapeManager extends ShapeManager {
    protected get wantedShapes() {
        const ratio = Math.ceil(Math.pow(this.game.arena.width / 2500, 2));
        return Math.floor(12.5 * ratio);
    }
}

/**
 * Survival Gamemode Arena
 */
export default class SurvivalArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "survival";
    
    /** Limits shape count to floor(12.5 * player count) */
    protected shapes: ShapeManager = new SurvivalShapeManager(this);

    public constructor(game: GameServer) {
        super(game);
        this.shapeScoreRewardMultiplier = 3.0;

        this.updateBounds(2500, 2500);
        this.arenaData.values.flags &= ~ArenaFlags.gameReadyStart;
        this.arenaData.values.playersNeeded = MIN_PLAYERS;
    }

    public updateArenaState() {
        const players = this.getAlivePlayers();
        const aliveCount = players.length;

        this.setSurvivalArenaSize(aliveCount);

        if ((this.game.tick % scoreboardUpdateInterval) === 0) {
            // Sorts them too DONT FORGET
            this.updateScoreboard(players);
        }

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

    public setSurvivalArenaSize(playerCount: number) {
        const arenaSize = Math.floor(25 * Math.sqrt(Math.max(playerCount, 1))) * 100;
        this.updateBounds(arenaSize, arenaSize);
    }

    public manageCountdown() {
        if (this.state === ArenaState.COUNTDOWN) {
            this.arenaData.playersNeeded = MIN_PLAYERS - this.game.clientsAwaitingSpawn.size;
            if (this.arenaData.values.playersNeeded <= 0) {
                this.arenaData.flags |= ArenaFlags.gameReadyStart;
            } else {
                this.arenaData.ticksUntilStart = countdownTicks; // Reset countdown
                if (this.arenaData.flags & ArenaFlags.gameReadyStart) this.arenaData.flags &= ~ArenaFlags.gameReadyStart;
            }
        }
        super.manageCountdown();
    }

    public onGameStarted() {
        super.onGameStarted();

        this.setSurvivalArenaSize(this.game.clientsAwaitingSpawn.size);
        this.arenaData.flags |= ArenaFlags.noJoining; // No joining once the game has started, and also no respawns
    }

    public tick(tick: number) {
        for (const client of this.game.clients) {
            const camera = client.camera;
            if (camera && Entity.exists(camera.cameraData.values.player)) camera.cameraData.score += 0.2;
        }
        super.tick(tick);
    }
}
