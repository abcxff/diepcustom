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

import * as util from "../../util";

import Bullet from "./Projectile/Bullet";
import Trap from "./Projectile/Trap";
import Drone from "./Projectile/Drone";
import Rocket from "./Projectile/Rocket";
import Skimmer from "./Projectile/Skimmer";
import Minion from "./Projectile/Minion";
import ObjectEntity from "../Object";
import TankBody, { BarrelBase } from "./TankBody";

import { Color, PositionFlags, PhysicsFlags, BarrelFlags, Stat, Tank } from "../../Const/Enums";
import { BarrelGroup } from "../../Native/FieldGroups";
import { BarrelDefinition, TankDefinition } from "../../Const/TankDefinitions";
import { DevTank } from "../../Const/DevTankDefinitions";
import Flame from "./Projectile/Flame";
import MazeWall from "../Misc/MazeWall";
import CrocSkimmer from "./Projectile/CrocSkimmer";
import { BarrelAddon, BarrelAddonById } from "./BarrelAddons";
import { Swarm } from "./Projectile/Swarm";
import NecromancerSquare from "./Projectile/NecromancerSquare";
/**
 * Class that determines when barrels can shoot, and when they can't.
 */
export class ShootCycle {
    /** The barrel this cycle is keeping track of. */
    private barrelEntity: Barrel;
    /** The current position in the cycle. */
    private pos: number;
    /** The last known reload time of the barrel. */
    private reloadTime: number;

    public constructor(barrel: Barrel) {
        this.barrelEntity = barrel;
        this.barrelEntity.barrelData.reloadTime = this.barrelEntity.tank.reloadTime * this.barrelEntity.definition.reload;
        this.reloadTime = this.pos = barrel.barrelData.values.reloadTime;
    }

    public tick() {
        const reloadTime = this.barrelEntity.tank.reloadTime * this.barrelEntity.definition.reload;
        if (reloadTime !== this.reloadTime) {
            this.pos *= reloadTime / this.reloadTime;
            this.reloadTime = reloadTime;
        }

        const alwaysShoot = (this.barrelEntity.definition.forceFire) || (this.barrelEntity.definition.bullet.type === 'drone') || (this.barrelEntity.definition.bullet.type === 'minion');

        if (this.pos >= reloadTime) {
            // When its not shooting dont shoot, unless its a drone
            if (!this.barrelEntity.attemptingShot && !alwaysShoot) {
                this.pos = reloadTime;
                return;
            }
            // When it runs out of drones, dont shoot
            if (typeof this.barrelEntity.definition.droneCount === 'number' && this.barrelEntity.droneCount >= this.barrelEntity.definition.droneCount) {
                this.pos = reloadTime;
                return;
            }
        }

        if (this.pos >= reloadTime * (1 + this.barrelEntity.definition.delay)) {
            this.barrelEntity.barrelData.reloadTime = reloadTime;
            this.barrelEntity.shoot();
            this.pos = reloadTime * this.barrelEntity.definition.delay;
        }

        this.pos += 1;
    }
}

/**
 * The barrel class containing all barrel related data.
 * - Converts barrel definitions to diep objects
 * - Will contain shooting logic (or interact with it)
 */
export default class Barrel extends ObjectEntity {
    /** The raw data defining the barrel. */
    public definition: BarrelDefinition;
    /** The owner / tank / parent of the barrel.  */
    public tank: BarrelBase;
    /** The cycle at which the barrel can shoot. */
    public shootCycle: ShootCycle;
    /** Whether or not the barrel is cycling the shoot cycle. */
    public attemptingShot = false;
    /** Bullet base accel. Used for AI and bullet speed determination. */
    public bulletAccel = 20;
    /** Number of drones that this barrel shot that are still alive. */
    public droneCount = 0;

    /** The barrel's addons */
    public addons: BarrelAddon[] = [];

    /** Always existant barrel field group, present on all barrels. */
    public barrelData: BarrelGroup = new BarrelGroup(this);

    public constructor(owner: BarrelBase, barrelDefinition: BarrelDefinition) {
        super(owner.game);

        this.tank = owner;
        this.definition = barrelDefinition;

        // Begin Loading Definition
        this.styleData.values.color = this.definition.color ?? Color.Barrel;
        this.physicsData.values.sides = 2;
        if (barrelDefinition.isTrapezoid) this.physicsData.values.flags |= PhysicsFlags.isTrapezoid;

        this.setParent(owner);
        this.relationsData.values.owner = owner;
        this.relationsData.values.team = owner.relationsData.values.team;

        const sizeFactor = this.tank.sizeFactor;
        const size = this.physicsData.values.size = this.definition.size * sizeFactor;

        this.physicsData.values.width = this.definition.width * sizeFactor;
        this.positionData.values.angle = this.definition.angle + (this.definition.trapezoidDirection);
        this.positionData.values.x = Math.cos(this.definition.angle) * (size / 2 + (this.definition.distance || 0)) - Math.sin(this.definition.angle) * this.definition.offset * sizeFactor;
        this.positionData.values.y = Math.sin(this.definition.angle) * (size / 2 + (this.definition.distance || 0)) + Math.cos(this.definition.angle) * this.definition.offset * sizeFactor;

        // addons are below barrel, use StyleFlags.aboveParent to go above parent
        if (barrelDefinition.addon) {
            const AddonConstructor = BarrelAddonById[barrelDefinition.addon];
            if (AddonConstructor) this.addons.push(new AddonConstructor(this));
        }

        this.barrelData.values.trapezoidDirection = barrelDefinition.trapezoidDirection;
        this.shootCycle = new ShootCycle(this);

        this.bulletAccel = (20 + (owner.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletSpeed] || 0) * 3) * barrelDefinition.bullet.speed;
    }

    /** Shoots a bullet from the barrel. */
    public shoot() {
        this.barrelData.flags ^= BarrelFlags.hasShot;

        // No this is not correct
        const scatterAngle = (Math.PI / 180) * this.definition.bullet.scatterRate * (Math.random() - .5) * 10;
        let angle = this.definition.angle + scatterAngle + this.tank.positionData.values.angle;

        this.rootParent.addAcceleration(angle + Math.PI, this.definition.recoil * 2);

        let tankDefinition: TankDefinition | null = null;

        if (this.rootParent instanceof TankBody) tankDefinition = this.rootParent.definition;

        let projectile: ObjectEntity | null = null;

        switch (this.definition.bullet.type) {
            case "skimmer":
                projectile = new Skimmer(this, this.tank, tankDefinition, angle, this.tank.inputs.attemptingRepel() ? -Skimmer.BASE_ROTATION : Skimmer.BASE_ROTATION);
                break;
            case "rocket":
                new Rocket(this, this.tank, tankDefinition, angle);
                break;
            case 'bullet': {
                projectile = new Bullet(this, this.tank, tankDefinition, angle);

                if (tankDefinition && (tankDefinition.id === Tank.ArenaCloser || tankDefinition.id === DevTank.Squirrel)) projectile.positionData.flags |= PositionFlags.canMoveThroughWalls;
                break;
            }
            case 'trap':
                projectile = new Trap(this, this.tank, tankDefinition, angle);
                break;
            case 'drone':
                projectile = new Drone(this, this.tank, tankDefinition, angle);
                break;
            case 'necrodrone':
                projectile = new NecromancerSquare(this, this.tank, tankDefinition, angle);
                break;
            case 'swarm':
                projectile = new Swarm(this, this.tank, tankDefinition, angle);
                break;
            case 'minion':
                projectile = new Minion(this, this.tank, tankDefinition, angle);
                break;
            case 'flame':
                projectile = new Flame(this, this.tank, tankDefinition, angle);
                break;
            case 'wall': {
                const w = projectile = new MazeWall(this.game, Math.round(this.tank.inputs.mouse.x / 50) * 50, Math.round(this.tank.inputs.mouse.y / 50) * 50, 250, 250);
                setTimeout(() => {
                    w.delete();
                }, 60 * 1000);
                break;
            }
            case "croc": 
                projectile = new CrocSkimmer(this, this.tank, tankDefinition, angle);
                break;
            default:
                util.log('Ignoring attempt to spawn projectile of type ' + this.definition.bullet.type);
                break;
        }

        if (projectile) { 
            if (this.definition.bullet.sides) projectile.physicsData.values.sides = this.definition.bullet.sides;

            if (this.definition.bullet.color) projectile.styleData.values.color = this.definition.bullet.color;
        }
    }

    /** Resizes the barrel; when the tank gets bigger, the barrel must as well. */
    protected resize() {
        const sizeFactor = this.tank.sizeFactor;
        const size = this.physicsData.size = this.definition.size * sizeFactor;

        this.physicsData.width = this.definition.width * sizeFactor;
        this.positionData.angle = this.definition.angle + (this.definition.trapezoidDirection);
        this.positionData.x = Math.cos(this.definition.angle) * (size / 2 + (this.definition.distance || 0)) - Math.sin(this.definition.angle) * this.definition.offset * sizeFactor;
        this.positionData.y = Math.sin(this.definition.angle) * (size / 2 + (this.definition.distance || 0)) + Math.cos(this.definition.angle) * this.definition.offset * sizeFactor;

        // Updates bullet accel too
        this.bulletAccel = (20 + (this.tank.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletSpeed] || 0) * 3) * this.definition.bullet.speed;
    }

    public tick(tick: number) {
        this.resize();

        this.relationsData.values.team = this.tank.relationsData.values.team;

        if (!this.tank.rootParent.deletionAnimation){
            this.attemptingShot = this.tank.inputs.attemptingShot();
            this.shootCycle.tick();
        }

        super.tick(tick);
    }
}
