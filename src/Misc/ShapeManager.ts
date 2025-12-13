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

import Crasher from "../Entity/Shape/Crasher";
import Pentagon from "../Entity/Shape/Pentagon";
import Triangle from "../Entity/Shape/Triangle";
import Square from "../Entity/Shape/Square";
import AbstractShape from "../Entity/Shape/AbstractShape";
import { removeFast } from "../util";

/**
 * Used to balance out shape count in the arena, as well
 * as determines where each type of shape spawns around the arena.
 */

export default class ShapeManager {
    /** Current game server */
    protected game: GameServer;
    /** Arena whose shapes are being managed */
    protected arena: ArenaEntity;
    /** Stores all shapes */
    protected shapes: AbstractShape[] = [];

    public constructor(arena: ArenaEntity) {
        this.arena = arena;
        this.game = arena.game;
    }

    /**
     * Spawns a shape in a random location on the map.
     * Determines shape type by the random position chosen.
     */
    protected spawnShape(): AbstractShape {
        let shape: AbstractShape;
        const {x, y} = this.arena.findSpawnLocation();
        const rightX = this.arena.arenaData.values.rightX;
        const leftX = this.arena.arenaData.values.leftX;
        if (Math.max(x, y) < rightX / 10 && Math.min(x, y) > leftX / 10) {
            // Pentagon Nest
            shape = new Pentagon(this.game, Math.random() <= 0.05);

            shape.positionData.values.x = x;
            shape.positionData.values.y = y;
            shape.relationsData.values.owner = shape.relationsData.values.team = this.arena;
        } else if (Math.max(x, y) < rightX / 5 && Math.min(x, y) > leftX / 5) {
            // Crasher Zone
            const isBig = Math.random() < .2;

            shape = new Crasher(this.game, isBig);
            
            shape.positionData.values.x = x;
            shape.positionData.values.y = y;
            shape.relationsData.values.owner = shape.relationsData.values.team = this.arena;
        } else {
            // Fields of Shapes
            const rand = Math.random();
            if (rand < .04) {
                shape = new Pentagon(this.game);

                shape.positionData.values.x = x;
                shape.positionData.values.y = y;
                shape.relationsData.values.owner = shape.relationsData.values.team = this.arena;
            } else if (rand < .20) { // < 16%
                shape = new Triangle(this.game);

                shape.positionData.values.x = x;
                shape.positionData.values.y = y;
                shape.relationsData.values.owner = shape.relationsData.values.team = this.arena;
            } else { // if rand < 80%
                shape = new Square(this.game);

                shape.positionData.values.x = x;
                shape.positionData.values.y = y;
                shape.relationsData.values.owner = shape.relationsData.values.team = this.arena;
            }
        }

        shape.scoreReward *= this.arena.shapeScoreRewardMultiplier;

        return shape;
    }

    /** Kills all shapes in the arena */
    public killAll() {
        for(let i = 0; i < this.shapes.length; ++i) {
            this.shapes[i]?.delete();
        }
    }

    protected get wantedShapes() {
        return 1000;
    }

    public tick() {
        for (let i = this.wantedShapes; i --> 0;) {
            const shape = this.shapes[i];
            // Alternatively, Entity.exists(shape), though this is probably faster
            if (!shape || shape.hash === 0) this.shapes[i] = this.spawnShape();
        }
    }
}
