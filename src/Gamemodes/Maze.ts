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

import ArenaEntity from "../Native/Arena";
import GameServer from "../Game";
import MazeGenerator, { MazeGeneratorConfig } from "../Systems/MazeGenerator";

import ShapeManager from "../Entity/Shape/Manager";

/**
 * Manage shape count
 */
export class MazeShapeManager extends ShapeManager {
    protected get wantedShapes() {
        // Uncomment to use scaled shape manager (might be slower)
        /*
        const ratio = Math.ceil(Math.pow(this.game.arena.width / 2500, 2));

        return Math.floor(12.5 * ratio);
        */

        return 1300;
    }
}

const config: MazeGeneratorConfig = {
    CELL_SIZE: 635,
    GRID_SIZE: 40,
    SEED_AMOUNT: Math.floor(Math.random() * 30) + 30,
    TURN_CHANCE: 0.2,
    BRANCH_CHANCE: 0.2,
    TERMINATION_CHANCE: 0.2
}

export default class MazeArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "maze";

    protected shapes: ShapeManager = new MazeShapeManager(this);

    public mazeGenerator: MazeGenerator = new MazeGenerator(this, config);

    public constructor(game: GameServer) {
        super(game);

        const arenaSize = config.CELL_SIZE * config.GRID_SIZE
        this.updateBounds(arenaSize, arenaSize);

        this.mazeGenerator.buildMaze();

        this.allowBoss = false;
    }

    public isValidSpawnLocation(x: number, y: number): boolean {
        // Should never spawn inside walls
        return !this.mazeGenerator.isInWall(x, y);
    }
}
