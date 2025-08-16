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

import ObjectEntity from "../Object";
import Barrel from "../Tank/Barrel";
import TeamBase from "./TeamBase";

import { BarrelBase } from "../Tank/TankBody";
import { Color, StyleFlags, PhysicsFlags } from "../../Const/Enums";
import { BarrelDefinition } from "../../Const/TankDefinitions";
import { Inputs } from "../AI";
import { CameraEntity } from "../../Native/Camera";

/**
 * Base drone stats.
 */
const DroneSpawnerDefinition = (count: number): BarrelDefinition => ({
    angle: 0,
    offset: 0,
    size: 95 / 5,
    width: 42 / 5,
    delay: 0,
    reload: 0,
    recoil: 0,
    isTrapezoid: true,
    trapezoidDirection: 0,
    addon: null,
    droneCount: count,
    canControlDrones: true,
    bullet: {
        type: "drone",
        sizeRatio: 1,
        health: 1000,
        damage: 1,
        speed: 2.7,
        scatterRate: 1,
        lifeLength: -1,
        absorbtionFactor: 1
    }
});

/**
 * Represents all base drones in game.
 */
export default class BaseDrones extends ObjectEntity implements BarrelBase {
    /** The base drone spawner barrel */
    private droneSpawner: Barrel;

    /** Fake camera entity, needed for BarrelBase. */
    public cameraEntity: CameraEntity = this as unknown as CameraEntity;

    /** Base reload value for internal calculations. */
    public reloadTime = 15;

    /** Needed for BarrelBase */
    public inputs = new Inputs();

    public constructor(base: TeamBase, droneCount: number = 12) {
        super(base.game);

        this.isPhysical = false;
        this.physicsData.values.sides = 0;
        this.physicsData.values.size = 50;
        this.physicsData.values.absorbtionFactor = 0;
        this.physicsData.values.pushFactor = 0;
        this.physicsData.values.flags |= PhysicsFlags.isBase;

        this.positionData.values.x = base.positionData.values.x;
        this.positionData.values.y = base.positionData.values.y;

        this.relationsData.values.owner = base;
        this.relationsData.values.team = base.relationsData.values.team;
        
        this.styleData.values.color = base.styleData.values.color;

        this.droneSpawner = new Barrel(this, DroneSpawnerDefinition(droneCount));
        this.droneSpawner.styleData.values.flags = this.styleData.values.flags ^= StyleFlags.isVisible;
       
    }

    public get sizeFactor() {
        return 5; // Large drone AI range, hacky
    }
}
