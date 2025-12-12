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
import MazeGenerator, { MazeGeneratorConfig } from "../Misc/MazeGenerator";

import ShapeManager from "../Misc/ShapeManager";

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

const GRID_SIZE = 40;
const CELL_SIZE = 635;
const ARENA_SIZE = GRID_SIZE * CELL_SIZE;

const config: MazeGeneratorConfig = {
    size: GRID_SIZE,
    baseSeedCount: 45,
    seedCountVariation: 30,
    turnChance: 0.2,
    branchChance: 0.2,
    terminationChance: 0.2
}

export default class MazeArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "maze";

    protected shapes: ShapeManager = new MazeShapeManager(this);

    public mazeGenerator: MazeGenerator = new MazeGenerator(config);

    public constructor(game: GameServer) {
        super(game);

        this.updateBounds(ARENA_SIZE, ARENA_SIZE);

        this.state = 0;
        this.mazeGenerator.generate();
        this.mazeGenerator.placeWalls(this);

        this.bossManager = null; // Disables boss spawning
    }

    public isValidSpawnLocation(x: number, y: number): boolean {
        const { gridX, gridY } = this.mazeGenerator.getGridCell(this, x, y);
        
        // Should never spawn inside walls
        return this.mazeGenerator.isCellOccupied(gridX, gridY) === false;
    }
}
