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
import ArenaEntity from "../../Native/Arena";

import ShapeManager from "../../Misc/ShapeManager";
import { DevTank } from "../../Const/DevTankDefinitions";
import TankBody from "../../Entity/Tank/TankBody";
import { ArenaFlags } from "../../Const/Enums";
import Client from "../../Client";
import FallenSpike from "../../Entity/Misc/Boss/FallenSpike";
import FallenOverlord from "../../Entity/Boss/FallenOverlord";
/**
 * Only spawns crashers
 */
class ZeroShapeManager extends ShapeManager {
    protected get wantedShapes() {
        return 0;
    }
}


/**
 * Testing Arena
 */
export default class TestingArena extends ArenaEntity {
    protected shapes: ShapeManager = new ZeroShapeManager(this);

    public constructor(game: GameServer) {
        super(game);

        this.updateBounds(4000, 4000);
        this.arenaData.values.flags |= ArenaFlags.canUseCheats;
        setTimeout(() => {
            new FallenOverlord(game);
            new FallenSpike(game);
        }, 5000)

    }

    public spawnPlayer(tank: TankBody, client: Client): void {
        tank.setTank(DevTank.Spectator);
    }

}
