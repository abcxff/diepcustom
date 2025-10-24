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
import ArenaEntity, { ArenaState } from "../Native/Arena";

import ShapeManager from "../Entity/Shape/Manager";
import { ArenaFlags } from "../Const/Enums";

/**
 * Manage shape count
 */
export class SandboxShapeManager extends ShapeManager {
    protected get wantedShapes() {
        let i = 0;
        for (const client of this.game.clients) {
            if (client.camera) i += 1;
        }
        return Math.floor(i * 12.5);
    }
}

/**
 * Sandbox Gamemode Arena
 */
export default class SandboxArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "sandbox";

    /** Limits shape count to floor(12.5 * player count) */
    protected shapes: ShapeManager = new SandboxShapeManager(this);

    public constructor(game: GameServer) {
        super(game);

        this.arenaData.values.flags |= ArenaFlags.canUseCheats;
        this.state = ArenaState.OPEN; // Sandbox should start instantly, no countdown

        this.setSandboxArenaSize(0);
    }
    
    public setSandboxArenaSize(playerCount: number) {
        const arenaSize = Math.floor(25 * Math.sqrt(Math.max(playerCount, 1))) * 100;
        this.updateBounds(arenaSize, arenaSize);
    }

    public tick(tick: number) {
        this.setSandboxArenaSize(this.game.clients.size);

        super.tick(tick);
    }
}
