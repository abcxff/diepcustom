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

import { PhysicsFlags } from "../../../Const/Enums";
import { TankDefinition } from "../../../Const/TankDefinitions";
import Barrel from "../Barrel";
import { BarrelBase } from "../TankBody";
import Drone from "./Drone";

/**
 * The Swarm class represents the swarm (projectile) entity in diep - think BattleShip
 */
export class Swarm extends Drone {
    public constructor(barrel: Barrel,  tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);
        this.ai.viewRange = 2000;
        this.physicsData.values.flags |= PhysicsFlags.canEscapeArena | PhysicsFlags.noOwnTeamCollision;
    }

    // TODO:
    // Add the custom resting state AI (after fixing real drone's)
}
