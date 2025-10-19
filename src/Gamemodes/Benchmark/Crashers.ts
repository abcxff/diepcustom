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

import AbstractShape from "../../Entity/Shape/AbstractShape";
import Crasher from "../../Entity/Shape/Crasher";
import ShapeManager from "../../Entity/Shape/Manager";
import GameServer from "../../Game";
import ArenaEntity, { ArenaState } from "../../Native/Arena";

class ManyCrashersManager extends ShapeManager {
    protected get wantedShapes() {
        return 4000;
    }

    protected spawnShape(): AbstractShape {
        const shape = new Crasher(this.arena.game, Math.random() < 0.3);
        const loc = this.arena.findSpawnLocation(false);
        shape.positionData.values.x = loc.x;
        shape.positionData.values.y = loc.y;
        return shape;
    }
}

export default class CrashersArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "crashers";

    public constructor(game: GameServer) {
        super(game);
        this.state = ArenaState.OPEN;
        this.updateBounds(8_000, 8_000);
        this.shapes = new ManyCrashersManager(this);
    }
}