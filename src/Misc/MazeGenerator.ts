import ArenaEntity from "../Native/Arena";
import MazeWall from "../Entity/Misc/MazeWall";
import { VectorAbstract } from "../Physics/Vector";

export interface MazeGeneratorConfig {
    /**
     * Size of the grid
     * - size=7 implies a 7x7 grid
     */
    size: number,

    /**
     * Amount of "wall seeds" to plant initially
     */
    baseSeedCount: number,
    /**
     * Variation in the amount of "wall seeds" to plant initially
     * - Actual seeds planted = baseSeedCount + random(-0.5, 0.5) * seedCountVariation
     */
    seedCountVariation: number,
    /**
     * Chance of turning when growing a wall seed
     */
    turnChance: number,
    /**
     * Chance of branching when growing a wall seed
     */
    branchChance: number,
    /**
     * Chance of terminating when growing a wall seed
     */
    terminationChance: number
}

interface GridWall {
    x: number,
    y: number,
    width: number,
    height: number,
}

/**
 * Implementation details:
 * Maze map generator by damocles <https://github.com/lunacles>
 *  - Added into codebase on Saturday 3rd of December 2022
 *  - Split into its own file on Wednesday 3rd of December 2025
 */
export default class MazeGenerator {
    /** The variables that affect maze generation */
    public config: MazeGeneratorConfig;
    /** Rolled out matrix of the grid */
    public maze: Uint8Array;
    
    public constructor(config: MazeGeneratorConfig) {
        this.config = config;
        
        this.maze = new Uint8Array(config.size * config.size);
    }

    /** Builds the maze */
    public generate() {
        interface Seed {
            x: number,
            y: number,
        }

        const seeds: Seed[] = [];

        const seedCount = this.config.baseSeedCount + Math.floor((Math.random() - 0.5) * this.config.seedCountVariation);
        const maxSeedCount = this.config.baseSeedCount + this.config.seedCountVariation;
        // Plant some seeds
        for (let i = 0; i < 10000; i++) {
            // Stop if we exceed our maximum seed count
            if (seeds.length >= seedCount) break;
            // Attempt a seed planting
            let seed: VectorAbstract = {
                x: Math.floor((Math.random() * this.config.size) - 1),
                y: Math.floor((Math.random() * this.config.size) - 1),
            };
            // Check if our seed is valid (is 3 GU away from another seed, and is not on the border)
            if (seeds.some(a => (Math.abs(seed.x - a.x) <= 3 && Math.abs(seed.y - a.y) <= 3))) continue;
            if (seed.x <= 0 || seed.y <= 0 || seed.x >= this.config.size - 1 || seed.y >= this.config.size - 1) continue;
            // Push it to the pending seeds and set its grid to a wall cell
            seeds.push(seed);

            this.set(seed.x, seed.y, 1);
        }
        const direction: number[][] = [
            [-1, 0], [1, 0], // left and right
            [0, -1], [0, 1], // up and down
        ];
        // Let it grow!
        for (let seed of seeds) {
            // Select a direction we want to head in
            let dir: number[] = direction[Math.floor(Math.random() * 4)];
            let termination = 1;
            // Now we can start to grow
            while (termination >= this.config.terminationChance) {
                // Choose the next termination chance
                termination = Math.random();
                // Get the direction we're going in
                let [x, y] = dir;
                // Move forward in that direction, and set that grid to a wall cell
                seed.x += x;
                seed.y += y;
                if (seed.x <= 0 || seed.y <= 0 || seed.x >= this.config.size - 1 || seed.y >= this.config.size - 1) break;
                this.set(seed.x, seed.y, 1);
                // Now lets see if we want to branch or turn
                if (Math.random() <= this.config.branchChance) {
                    // If the seeds exceeds maxSeedCount, then we're going to stop creating branches in order to avoid making a massive maze tumor(s)
                    if (seeds.length > maxSeedCount) continue;
                    // Get which side we want the branch to be on (left or right if moving up or down, and up and down if moving left or right)
                    let [ xx, yy ] = direction.filter(a => a.every((b, c) => b !== dir[c]))[Math.floor(Math.random() * 2)];
                    // Create the seed
                    let newSeed = {
                        x: seed.x + xx,
                        y: seed.y + yy,
                    };
                    // Push the seed and set its grid to a maze zone
                    seeds.push(newSeed);
                    this.set(seed.x, seed.y, 1);
                } else if (Math.random() <= this.config.turnChance) {
                    // Get which side we want to turn to (left or right if moving up or down, and up and down if moving left or right)
                    dir = direction.filter(a => a.every((b, c) => b !== dir[c]))[Math.floor(Math.random() * 2)];
                }
            }
        }
        // Now lets attempt to add some singular walls around the arena
        for (let i = 0; i < 10; i++) {
            // Attempt to place it 
            let seed = {
                x: Math.floor((Math.random() * this.config.size) - 1),
                y: Math.floor((Math.random() * this.config.size) - 1),
            };
            // Check if our sprinkle is valid (is 3 GU away from another wall, and is not on the border)
            if (this.mapValues().some(([x, y, r]) => r === 1 && (Math.abs(seed.x - x) <= 3 && Math.abs(seed.y - y) <= 3))) continue;
            if (seed.x <= 0 || seed.y <= 0 || seed.x >= this.config.size - 1 || seed.y >= this.config.size - 1) continue;
            // Set its grid to a wall cell
            this.set(seed.x, seed.y, 1);
        }
        // Now it's time to fill in the inaccessible pockets
        // Start at the top left
        let queue: number[][] = [[0, 0]];
        this.set(0, 0, 2);
        let checkedIndices = new Set([0]);
        // Now lets cycle through the whole map
        for (let i = 0; i < 3000 && queue.length > 0; i++) {
            let next = queue.shift();
            if (next == null) break;
            let [x, y] = next;
            // Get what the coordinates of what lies to the side of our cell
            for (let [nx, ny] of [
                [x - 1, y], // left
                [x + 1, y], // right
                [x, y - 1], // top
                [x, y + 1], // bottom
            ]) {
                // If its a wall ignore it
                if (this.get(nx, ny) !== 0) continue;
                let i = ny * this.config.size + nx;
                // Check if we've already checked this cell
                if (checkedIndices.has(i)) continue;
                // Add it to the checked cells if we haven't already
                checkedIndices.add(i);
                // Add it to the next cycle to check
                queue.push([nx, ny]);
                // Set its grid to an accessible cell
                this.set(nx, ny, 2);
            }
        }
    }

    protected convertToWalls(): GridWall[] {
        const walls: GridWall[] = [];

        // Cycle through all areas of the map
        for (let x = 0; x < this.config.size; x++) {
            for (let y = 0; y < this.config.size; y++) {
                // If we're not a wall, ignore the cell and move on
                if (this.get(x, y) === 2) continue;
                // Define our properties
                const chunk: GridWall = { x, y, width: 0, height: 1 };
                // Loop through adjacent cells and see how long we should be
                while (this.get(x + chunk.width, y) !== 2) {
                    this.set(x + chunk.width, y, 2);
                    chunk.width++;
                }
                // Now lets see if we need to be t h i c c
                outer: while (true) {
                    // Check the row below to see if we can still make a box
                    for (let i = 0; i < chunk.width; i++)
                        // Stop if we can't
                        if (this.get(x + i, y + chunk.height) === 2) break outer;
                    // If we can, remove the line of cells from the map and increase the height of the block
                    for (let i = 0; i < chunk.width; i++)
                        this.set(x + i, y + chunk.height, 2);
                    chunk.height++;
                }
                walls.push(chunk);
            }
        }
        return walls;
    }

    public placeWalls(arena: ArenaEntity) {
        const walls = this.convertToWalls();

        for (const wall of walls) {
            this.buildWallFromGridCoord(arena, wall.x, wall.y, wall.width, wall.height);
        }
    }

    /** Creates a maze wall from cell coords */
    protected buildWallFromGridCoord(
        arena: ArenaEntity,
        gridX: number,
        gridY: number,
        gridW: number,
        gridH: number,
    ): MazeWall {
        const { x: minX, y: minY } = this.scaleGridToArenaPosition(arena, gridX, gridY);
        const { x: maxX, y: maxY } = this.scaleGridToArenaPosition(arena, gridX + gridW, gridY + gridH);
        return MazeWall.newFromBounds(arena.game, minX, minY, maxX, maxY);
    }

    /** Allows for easier (x, y) based getting of maze cells */
    protected get(x: number, y: number): number {
        return this.maze[y * this.config.size + x];
    }

    /** Checks if a cell is occupied on grid */
    public isCellOccupied(x: number, y: number): boolean {
        return this.get(x, y) !== 0;
    }

    /** Allows for easier (x, y) based setting of maze cells */
    protected set(x: number, y: number, value: number): number {
        return this.maze[y * this.config.size + x] = value;
    }
    /** Converts MAZE grid into an array of set and unset bits for ease of use */
    protected mapValues(): [x: number, y: number, value: number][] {
        const values: [x: number, y: number, value: number][] = Array(this.maze.length);
        for (let i = 0; i < this.maze.length; ++i) values[i] = [i % this.config.size, Math.floor(i / this.config.size), this.maze[i]];
        return values;
    }

    public scaleArenaToGridPosition(
        arena: ArenaEntity,
        x: number,
        y: number,
    ): { gridX: number, gridY: number } {
        const gridCellWidth = arena.width / this.config.size;
        const gridCellHeight = arena.height / this.config.size;
        const gridX = (x + arena.width / 2) / gridCellWidth;
        const gridY = (y + arena.height / 2) / gridCellHeight;
        return { gridX, gridY };
    }

    public getGridCell(
        arena: ArenaEntity,
        x: number,
        y: number,
    ): { gridX: number, gridY: number } {
        const { gridX, gridY } = this.scaleArenaToGridPosition(arena, x, y);

        return {
            gridX: Math.floor(gridX),
            gridY: Math.floor(gridY),
        }
    }

    public scaleGridToArenaPosition(
        arena: ArenaEntity,
        gridX: number,
        gridY: number,
    ): { x: number, y: number } {
        const gridCellWidth = arena.width / this.config.size;
        const gridCellHeight = arena.height / this.config.size;
        const x = gridX * gridCellWidth + arena.arenaData.values.leftX;
        const y = gridY * gridCellHeight + arena.arenaData.values.topY;
        return { x, y };
    }
}
