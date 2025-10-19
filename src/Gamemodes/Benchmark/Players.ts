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

import { DevTank } from "../../Const/DevTankDefinitions";
import { InputFlags, Stat, Tank } from "../../Const/Enums";
import { Inputs } from "../../Entity/AI";

import ShapeManager from "../../Entity/Shape/Manager";
import TankBody from "../../Entity/Tank/TankBody";
import GameServer from "../../Game";
import ArenaEntity, { ArenaState } from "../../Native/Arena";
import { CameraEntity } from "../../Native/Camera";

class CustomShapeManager extends ShapeManager {
    protected get wantedShapes() {
        return 500;
    }
}

export default class PlayersArena extends ArenaEntity {
    static override GAMEMODE_ID: string = "players";

    public constructor(game: GameServer) {
        super(game);
        this.state = ArenaState.OPEN;
        this.updateBounds(8_000, 8_000);
        this.shapes = new CustomShapeManager(this);

        const PLAYER_COUNT = 100;
        for (let i = 0; i < PLAYER_COUNT; ++i) {
            // const tank = this.spawnTestTank(Tank.Factory);
            const tank = this.spawnTestTank(Tank.MachineGun);
            const posX = Math.cos((i / PLAYER_COUNT) * Math.PI * 2) * this.width / 2;
            const posY = Math.sin((i / PLAYER_COUNT) * Math.PI * 2) * this.height / 2;
            tank.positionData.values.x = posX;
            tank.positionData.values.y = posY;
            tank.cameraEntity.cameraData.statLevels[Stat.Reload] = 7;
            tank.cameraEntity.cameraData.statLevels[Stat.BulletDamage] = 7;
            tank.cameraEntity.cameraData.statLevels[Stat.BulletPenetration] = 7;
            tank.cameraEntity.cameraData.statLevels[Stat.BulletSpeed] = 7;
            tank.setInvulnerability(true);
            tank.inputs.flags |= InputFlags.leftclick;

            const tankTick = tank.tick.bind(tank);
            tank.tick = function(tick: number) {
                // tank.positionData.x = posX;
                // tank.positionData.y = posY;
                tankTick(tick);
                this.setVelocity(0, 0);
            };
        }
    }

    private spawnTestTank(id: Tank | DevTank) {
        const testTank = new TankBody(this.game, new CameraEntity(this.game), new Inputs());
        testTank.cameraEntity.cameraData.player = testTank;
        testTank.setTank(id);
        testTank.cameraEntity.setLevel(45);
        return testTank;
    }
}