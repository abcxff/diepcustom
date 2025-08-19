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
import Barrel from "../Tank/Barrel";
import AbstractBoss from "./AbstractBoss";

import { Color, Tank } from "../../Const/Enums";
import { AIState } from "../AI";

import { BarrelDefinition } from "../../Const/TankDefinitions";
import { PI2 } from "../../util";

const SummonerSpawnerDefinition: BarrelDefinition = {
    angle: Math.PI,
    offset: 0,
    size: 135,
    width: 71.4,
    delay: 0,
    reload: 0.36,
    recoil: 1,
    isTrapezoid: true,
    trapezoidDirection: 0,
    addon: null,
    droneCount: 7,
    canControlDrones: true,
    bullet: {
        type: "drone",
        sizeRatio: 55 * Math.SQRT1_2 / (71.4 / 2),
        health: 12.5,
        damage: 0.56,
        speed: 1.7,
        scatterRate: 1,
        lifeLength: -1,
        absorbtionFactor: 1,
        color: Color.NecromancerSquare,
        sides: 4
    }
};

const SUMMONER_SIZE = 150;
/**
 * Class which represents the boss "Summoner"
 */
export default class Summoner extends AbstractBoss {

    /** Summoner spawners */
    private spawners: Barrel[] = [];

    public constructor(game: GameServer) {
        super(game);

        this.nameData.values.name = 'Summoner';
        this.styleData.values.color = Color.EnemySquare;
        this.relationsData.values.team = this.game.arena;
        this.physicsData.values.size = SUMMONER_SIZE * Math.SQRT1_2;
        this.physicsData.values.sides = 4;

        for (let i = 0; i < 4; ++i) {
            this.spawners.push(new Barrel(this, {
                ...SummonerSpawnerDefinition,
                angle: PI2 * ((i / 4))
            }));
        }
    }

    public get sizeFactor() {
        return (this.physicsData.values.size / Math.SQRT1_2) / SUMMONER_SIZE;
    }


    public tick(tick: number) {
        super.tick(tick);

        if (this.ai.state !== AIState.possessed) {
            this.positionData.angle += this.ai.passiveRotation;
        }
    }
}
