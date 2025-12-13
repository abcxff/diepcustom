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
import TankBody from "../../Entity/Tank/TankBody";
import { CameraEntity } from "../../Native/Camera";
import { Inputs } from "../../Entity/AI";
import { DevTank } from "../../Const/DevTankDefinitions";
import { ArenaFlags, Tank } from "../../Const/Enums";
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

        // const tank1 = this.spawnTestTank(Tank.Booster);
        // const tank2 = this.spawnTestTank(Tank.Annihilator);

        // tank1.inputs.mouse.x = - 2 * (tank1.position.x = 10000);
        // tank1.inputs.mouse.y = (tank1.position.y = -400);
        // tank1.setVelocity(0, 0);

        // tank2.inputs.mouse.x = 2 * (tank2.position.x = 10000);
        // tank2.inputs.mouse.y = (tank2.position.y = 400);
        // tank2.setVelocity(0, 0);

        // tank1.cameraEntity.camera.statLevels[Stat.Reload] = tank1.cameraEntity.camera.statLimits[Stat.Reload];
        // tank1.cameraEntity.camera.statLevels[Stat.MovementSpeed] = tank1.cameraEntity.camera.statLimits[Stat.MovementSpeed];
        // tank2.cameraEntity.camera.statLevels[Stat.Reload] = tank2.cameraEntity.camera.statLimits[Stat.Reload];
        // tank2.cameraEntity.camera.statLevels[Stat.MovementSpeed] = tank2.cameraEntity.camera.statLimits[Stat.MovementSpeed];   

        // setTimeout(() => {
        //     tank1.inputs.movement.magnitude = 1;
        //     tank1.inputs.movement.angle = Math.PI;
        //     tank1.inputs.movement.set = () => {};
        //     tank1.inputs.flags |= InputFlags.leftclick;
        //     tank2.inputs.movement.magnitude = 1;
        //     tank2.inputs.movement.angle = Math.PI;
        //     tank2.inputs.movement.set = () => {};
        //     tank2.inputs.flags |= InputFlags.leftclick;
        // }, 10000);
    }

    public spawnPlayer(tank: TankBody, client: Client): void {
        tank.setTank(DevTank.Spectator);
    }

    private spawnTestTank(id: Tank | DevTank) {
        const testTank = new TankBody(this.game, new CameraEntity(this.game), new Inputs());
        testTank.cameraEntity.cameraData.player = testTank;
        testTank.setTank(id);
        testTank.cameraEntity.setLevel(45);
        return testTank;
    }
}