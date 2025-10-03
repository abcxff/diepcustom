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

import GameServer from "../../Game";
import ObjectEntity from "../Object";

import { PhysicsFlags, Color } from "../../Const/Enums";
/**
 * Only used for maze walls and nothing else.
 */
export default class MazeWall extends ObjectEntity {
    public constructor(game: GameServer, x: number, y: number, width: number, height: number) {
        super(game);

        this.setGlobalEntity();

        this.positionData.values.x = x;
        this.positionData.values.y = y;

        this.physicsData.values.width = width;
        this.physicsData.values.size = height;
        this.physicsData.values.sides = 2;
        this.physicsData.values.flags |= PhysicsFlags.isSolidWall;
        this.physicsData.values.pushFactor = 2;
        this.physicsData.values.absorbtionFactor = 0;

        this.relationsData.values.team = this.game.arena;

        this.styleData.values.borderWidth = 10;
        this.styleData.values.color = Color.Box;
    }

    public tick(tick: number) {} // No need to tick walls
}
