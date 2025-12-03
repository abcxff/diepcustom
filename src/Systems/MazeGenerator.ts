import ArenaEntity from "../Native/Arena";
import MazeWall from "../Entity/Misc/MazeWall";
import { VectorAbstract } from "../Physics/Vector";

export interface MazeGeneratorConfig {
    CELL_SIZE: number,
    GRID_SIZE: number,
    SEED_AMOUNT: number,
    TURN_CHANCE: number,
    BRANCH_CHANCE: number,
    TERMINATION_CHANCE: number
}

/**
 * Implementation details:
 * Maze map generator by damocles <github.com/SpanksMcYeet>
 *  - Added into codebase on Saturday 3rd of December 2022
 *  - Split into its own file on Wednesday 3rd of December 2025
 */
export default class MazeGenerator {
    public arena: ArenaEntity;

    public config: MazeGeneratorConfig;

    /** Stores all the "seed"s */
    public SEEDS: VectorAbstract[] = [];
    /** Stores all the "wall"s, contains cell based coords */
    public WALLS: (VectorAbstract & {width: number, height: number})[] = [];
    /** Rolled out matrix of the grid */
    public MAZE: Uint8Array;
    
    constructor(arena: ArenaEntity, config: MazeGeneratorConfig) {
        this.arena = arena;
        
        this.config = config;
        
        this.MAZE = new Uint8Array(config.GRID_SIZE * config.GRID_SIZE);
    }
    /** Creates a maze wall from cell coords */
    public _buildWallFromGridCoord(gridX: number, gridY: number, gridW: number, gridH: number) {
        const scaledW = gridW * this.config.CELL_SIZE;
        const scaledH = gridH * this.config.CELL_SIZE;
        const scaledX = gridX * this.config.CELL_SIZE - this.arena.width / 2 + (scaledW / 2);
        const scaledY = gridY * this.config.CELL_SIZE - this.arena.height / 2 + (scaledH / 2);
        new MazeWall(this.arena.game, scaledX, scaledY, scaledH, scaledW);
    }
    /** Allows for easier (x, y) based getting of maze cells */
    public _get(x: number, y: number): number {
        return this.MAZE[y * this.config.GRID_SIZE + x];
    }
    /** Allows for easier (x, y) based setting of maze cells */
    public _set(x: number, y: number, value: number): number {
        return this.MAZE[y * this.config.GRID_SIZE + x] = value;
    }
    /** Converts MAZE grid into an array of set and unset bits for ease of use */
    public _mapValues(): [x: number, y: number, value: number][] {
        const values: [x: number, y: number, value: number][] = Array(this.MAZE.length);
        for (let i = 0; i < this.MAZE.length; ++i) values[i] = [i % this.config.GRID_SIZE, Math.floor(i / this.config.GRID_SIZE), this.MAZE[i]];
        return values;
    }
    /** Builds the maze */
    public buildMaze() {
        // Plant some seeds
        for (let i = 0; i < 10000; i++) {
            // Stop if we exceed our maximum seed amount
            if (this.SEEDS.length >= this.config.SEED_AMOUNT) break;
            // Attempt a seed planting
            let seed: VectorAbstract = {
                x: Math.floor((Math.random() * this.config.GRID_SIZE) - 1),
                y: Math.floor((Math.random() * this.config.GRID_SIZE) - 1),
            };
            // Check if our seed is valid (is 3 GU away from another seed, and is not on the border)
            if (this.SEEDS.some(a => (Math.abs(seed.x - a.x) <= 3 && Math.abs(seed.y - a.y) <= 3))) continue;
            if (seed.x <= 0 || seed.y <= 0 || seed.x >= this.config.GRID_SIZE - 1 || seed.y >= this.config.GRID_SIZE - 1) continue;
            // Push it to the pending seeds and set its grid to a wall cell
            this.SEEDS.push(seed);
            this._set(seed.x, seed.y, 1);
        }
        const direction: number[][] = [
            [-1, 0], [1, 0], // left and right
            [0, -1], [0, 1], // up and down
        ];
        // Let it grow!
        for (let seed of this.SEEDS) {
            // Select a direction we want to head in
            let dir: number[] = direction[Math.floor(Math.random() * 4)];
            let termination = 1;
            // Now we can start to grow
            while (termination >= this.config.TERMINATION_CHANCE) {
                // Choose the next termination chance
                termination = Math.random();
                // Get the direction we're going in
                let [x, y] = dir;
                // Move forward in that direction, and set that grid to a wall cell
                seed.x += x;
                seed.y += y;
                if (seed.x <= 0 || seed.y <= 0 || seed.x >= this.config.GRID_SIZE - 1 || seed.y >= this.config.GRID_SIZE - 1) break;
                this._set(seed.x, seed.y, 1);
                // Now lets see if we want to branch or turn
                if (Math.random() <= this.config.BRANCH_CHANCE) {
                    // If the seeds exceeds 75, then we're going to stop creating branches in order to avoid making a massive maze tumor(s)
                    if (this.SEEDS.length > 75) continue;
                    // Get which side we want the branch to be on (left or right if moving up or down, and up and down if moving left or right)
                    let [ xx, yy ] = direction.filter(a => a.every((b, c) => b !== dir[c]))[Math.floor(Math.random() * 2)];
                    // Create the seed
                    let newSeed = {
                        x: seed.x + xx,
                        y: seed.y + yy,
                    };
                    // Push the seed and set its grid to a maze zone
                    this.SEEDS.push(newSeed);
                    this._set(seed.x, seed.y, 1);
                } else if (Math.random() <= this.config.TURN_CHANCE) {
                    // Get which side we want to turn to (left or right if moving up or down, and up and down if moving left or right)
                    dir = direction.filter(a => a.every((b, c) => b !== dir[c]))[Math.floor(Math.random() * 2)];
                }
            }
        }
        // Now lets attempt to add some singular walls around the arena
        for (let i = 0; i < 10; i++) {
            // Attempt to place it 
            let seed = {
                x: Math.floor((Math.random() * this.config.GRID_SIZE) - 1),
                y: Math.floor((Math.random() * this.config.GRID_SIZE) - 1),
            };
            // Check if our sprinkle is valid (is 3 GU away from another wall, and is not on the border)
            if (this._mapValues().some(([x, y, r]) => r === 1 && (Math.abs(seed.x - x) <= 3 && Math.abs(seed.y - y) <= 3))) continue;
            if (seed.x <= 0 || seed.y <= 0 || seed.x >= this.config.GRID_SIZE - 1 || seed.y >= this.config.GRID_SIZE - 1) continue;
            // Set its grid to a wall cell
            this._set(seed.x, seed.y, 1);
        }
        // Now it's time to fill in the inaccessible pockets
        // Start at the top left
        let queue: number[][] = [[0, 0]];
        this._set(0, 0, 2);
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
                if (this._get(nx, ny) !== 0) continue;
                let i = ny * this.config.GRID_SIZE + nx;
                // Check if we've already checked this cell
                if (checkedIndices.has(i)) continue;
                // Add it to the checked cells if we haven't already
                checkedIndices.add(i);
                // Add it to the next cycle to check
                queue.push([nx, ny]);
                // Set its grid to an accessible cell
                this._set(nx, ny, 2);
            }
        }
        // Cycle through all areas of the map
        for (let x = 0; x < this.config.GRID_SIZE; x++) {
            for (let y = 0; y < this.config.GRID_SIZE; y++) {
                // If we're not a wall, ignore the cell and move on
                if (this._get(x, y) === 2) continue;
                // Define our properties
                let chunk = { x, y, width: 0, height: 1 };
                // Loop through adjacent cells and see how long we should be
                while (this._get(x + chunk.width, y) !== 2) {
                    this._set(x + chunk.width, y, 2);
                    chunk.width++;
                }
                // Now lets see if we need to be t h i c c
                outer: while (true) {
                    // Check the row below to see if we can still make a box
                    for (let i = 0; i < chunk.width; i++)
                        // Stop if we can't
                        if (this._get(x + i, y + chunk.height) === 2) break outer;
                    // If we can, remove the line of cells from the map and increase the height of the block
                    for (let i = 0; i < chunk.width; i++)
                        this._set(x + i, y + chunk.height, 2);
                    chunk.height++;
                }
                this.WALLS.push(chunk);
            }
        }
        // Create the walls!
        for (let {x, y, width, height} of this.WALLS) {
            this._buildWallFromGridCoord(x, y, width, height);
        }
    }
    public isInWall(x: number, y: number): boolean {
        const width = this.arena.width / 2
        const height = this.arena.height / 2
        for (const wall of this.WALLS) {
            const wallX = wall.x * this.config.CELL_SIZE - width;
            const wallY = wall.y * this.config.CELL_SIZE - height;
            const wallW = wall.width * this.config.CELL_SIZE;
            const wallH = wall.height * this.config.CELL_SIZE;
            if (
                x >= wallX &&
                x <= wallX + wallW &&
                y >= wallY &&
                y <= wallY + wallH
            ) {
                return true;
            }
        }
        return false;
    }
}