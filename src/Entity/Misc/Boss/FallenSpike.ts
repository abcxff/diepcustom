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

import GameServer from "../../../Game";
import { AIState } from "../../AI";
import AbstractBoss from "../../Boss/AbstractBoss";

import { AddonById } from "../../Tank/Addons";

/**
 * Class which represents the a funny Fallen Spike boss
 */
export default class FallenSpike extends AbstractBoss {
    public constructor(game: GameServer) {
        super(game);

        this.movementSpeed = 3.0;

        this.nameData.values.name = 'Fallen Spike';

        // Sharp
        this.damagePerTick *= 2;

        if (AddonById.spike) new AddonById['spike'](this);
    }

    public get sizeFactor() {
        return this.physicsData.values.size / 50;
    }

    protected moveAroundMap() {
        if (this.ai.state === AIState.idle) {
            this.positionData.angle += this.ai.passiveRotation;
            this.setVelocity(0, 0);
        } else {
            const x = this.positionData.values.x,
                  y = this.positionData.values.y;

            this.positionData.angle = Math.atan2(this.ai.inputs.mouse.y - y, this.ai.inputs.mouse.x - x);
        }
    }

    public tick(tick: number) {
        super.tick(tick);
    }
}
