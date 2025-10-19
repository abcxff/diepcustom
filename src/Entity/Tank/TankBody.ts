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

import type GameServer from "../../Game";
import type { CameraEntity } from "../../Native/Camera";

import Square from "../Shape/Square";
import NecromancerSquare from "./Projectile/NecromancerSquare";
import LivingEntity from "../Live";
import ObjectEntity from "../Object";
import Barrel from "./Barrel";

import { Color, StyleFlags, StatCount, Tank, CameraFlags, Stat, InputFlags, PhysicsFlags, PositionFlags, NameFlags, HealthFlags } from "../../Const/Enums";
import { Entity } from "../../Native/Entity";
import { NameGroup, ScoreGroup } from "../../Native/FieldGroups";
import { Addon, AddonById } from "./Addons";
import { getTankById, TankDefinition, visibilityRateDamage } from "../../Const/TankDefinitions";
import { DevTank } from "../../Const/DevTankDefinitions";
import { Inputs } from "../AI";
import { ArenaState } from "../../Native/Arena";
import { AccessLevel, maxPlayerLevel } from "../../config";

/**
 * Abstract type of entity which barrels can connect to.
 * - `sizeFactor` is required and must be a `number`
 * - `cameraEntity` is required and must be a `Camera`
 */
export type BarrelBase = ObjectEntity & { sizeFactor: number, cameraEntity: CameraEntity, reloadTime: number, inputs: Inputs };

/**
 * The Tank Body, which could also be called the Player class, converts defined
 * tank data into diep entities. Controls speeds, barrels, addons, and names.
 * Created for each spawn.
 */
export default class TankBody extends LivingEntity implements BarrelBase {
    /** Always existant name field group, present on all tanks. */
    public nameData: NameGroup = new NameGroup(this);
    /** Always existant score field group, present on all tanks. */
    public scoreData: ScoreGroup = new ScoreGroup(this);

    /** The camera entity which stores stats and level data about the tank. */
    public cameraEntity: CameraEntity;
    /** The inputs of the client, lets the barrels know when to shoot etc. */
    public inputs: Inputs;

    /** The tank's barrels, if any. */
    public barrels: Barrel[] = [];
    /** The tank's addons, if any. */
    private addons: Addon[] = [];

    /** Size of the tank at level 1. Defined by tank loader.  */
    public baseSize = 50;
    /** The definition of the currentTank */
    public definition: TankDefinition = getTankById(Tank.Basic) as TankDefinition;
    /** Reload time base, used for barrel's reloads. */
    public reloadTime = 15;
    /** The current tank definition / tank id. */
    private _currentTank: Tank | DevTank = Tank.Basic;
    /** Sets tanks to be invulnerable - example, godmode, or AC */
    public isInvulnerable: boolean = false;

    public constructor(game: GameServer, camera: CameraEntity, inputs: Inputs) {
        super(game);
        this.cameraEntity = camera;
        this.inputs = inputs;

        this.physicsData.values.size = 50;
        this.physicsData.values.sides = 1;
        this.styleData.values.color = Color.Tank;

        this.relationsData.values.team = camera;
        this.relationsData.values.owner = camera;

        this.cameraEntity.cameraData.spawnTick = game.tick;
        this.cameraEntity.cameraData.flags |= CameraFlags.showingDeathStats;
        this.cameraEntity.cameraData.killedBy = "";

        // spawn protection
        this.styleData.values.flags |= StyleFlags.isFlashing;
        this.damageReduction = 0;
        if (this.game.playersOnMap) this.setGlobalEntity();

        this.damagePerTick = 5;
        this.maxDamageMultiplier = 6;
        this.setTank(Tank.Basic);
    }

    /** The active change in size from the base size to the current. Contributes to barrel and addon sizes. */
    public get sizeFactor() {
        return this.physicsData.values.size / this.baseSize;
    }

    /** The current tank type / tank id. */
    public get currentTank() {
        return this._currentTank;
    }

    /** This method allows for changing the current tank. */
    public setTank(id: Tank | DevTank) {
        // Delete old barrels and addons
        for (let i = 0; i < this.children.length; ++i) {
            this.children[i].isChild = false;
            this.children[i].delete();
        }
        this.children = [];
        this.barrels = [];
        this.addons = [];

        // Get the new tank data
        const tank = getTankById(id);
        const camera = this.cameraEntity;

        if (!tank) throw new TypeError("Invalid tank ID");
        this.definition = tank;
        if (!Entity.exists(camera)) throw new Error("No camera");

        this.physicsData.sides = tank.sides;
        this.styleData.opacity = 1;

        for (let i: Stat = 0; i < StatCount; ++i) {
            const {name, max} = tank.stats[i];

            camera.cameraData.statLimits[i] = max;
            camera.cameraData.statNames[i] = name;
            if (camera.cameraData.statLevels[i] > max) {
                camera.cameraData.statsAvailable += (camera.cameraData.statLevels[i] - (camera.cameraData.statLevels[i] = max));
            }
        }

        // Size ratios
        this.baseSize = tank.baseSizeOverride ?? tank.sides === 4 ? Math.SQRT2 * 32.5 : tank.sides === 16 ? Math.SQRT2 * 25 : 50;
        this.physicsData.absorbtionFactor = this.isInvulnerable ? 0 : tank.absorbtionFactor;
        if (tank.absorbtionFactor === 0) this.positionData.flags |= PositionFlags.canMoveThroughWalls;
        else if (this.positionData.flags & PositionFlags.canMoveThroughWalls) this.positionData.flags ^= PositionFlags.canMoveThroughWalls;

        camera.cameraData.tank = this._currentTank = id;
        const client = camera.getClient();
        if (client && tank.upgradeMessage) {
            client.notify(tank.upgradeMessage, 0x000000, 10000);
        }

        // Build addons, then tanks, then addons.
        const preAddon = tank.preAddon;
        if (preAddon) {
            const AddonConstructor = AddonById[preAddon];
            if (AddonConstructor) this.addons.push(new AddonConstructor(this));
        }

        for (const barrel of tank.barrels) {
            this.barrels.push(new Barrel(this, barrel));
        }

        const postAddon = tank.postAddon;
        if (postAddon) {
            const AddonConstructor = AddonById[postAddon];
            if (AddonConstructor) this.addons.push(new AddonConstructor(this));
        }

        // Yeah, yeah why not
        this.cameraEntity.cameraData.tankOverride = tank.name;
        camera.setFieldFactor(tank.fieldFactor);
    }
    /** See LivingEntity.onKill */
    public onKill(entity: LivingEntity) {
        if (Entity.exists(this.cameraEntity.cameraData.values.player) && entity !== this) this.scoreData.score = this.cameraEntity.cameraData.score += entity.scoreReward;

        if ((entity.nameData && !(entity.nameData.values.flags & NameFlags.hiddenName))) {
            const client = this.cameraEntity.getClient();
            if (client) client.notify("You've killed " + (entity.nameData.values.name || "an unnamed tank"));
        }

        // TODO(ABC):
        // This is actually not how necromancers claim squares.
        if (entity instanceof Square && this.definition.flags.canClaimSquares && this.barrels.length) {
            // If can claim, pick a random barrel that has drones it can still shoot, then shoot
            const MAX_DRONES_PER_BARREL = 11 + this.cameraEntity.cameraData.values.statLevels.values[Stat.Reload];
            const barrelsToShoot = this.barrels.filter((e) => e.definition.bullet.type === "necrodrone" && e.droneCount < MAX_DRONES_PER_BARREL);

            if (barrelsToShoot.length) {
                const barrelToShoot = barrelsToShoot[~~(Math.random()*barrelsToShoot.length)];

                // No destroy it on the next tick to make it look more like the way diep does it.
                entity.destroy(true);
                if (entity.deletionAnimation) {
                    entity.deletionAnimation.frame = 0;
                    entity.styleData.opacity = 1;
                    entity.healthData.flags = HealthFlags.hiddenHealthbar
                }

                const sunchip = NecromancerSquare.fromShape(barrelToShoot, this, this.definition, entity);
            }
        }
    }

    /** See TankBody.isInvulnerable */
    public setInvulnerability(invulnerable: boolean) {
        if (this.styleData.flags & StyleFlags.isFlashing) this.styleData.flags ^= StyleFlags.isFlashing;

        if (this.isInvulnerable === invulnerable) return;
      
        if (invulnerable) {
            this.damageReduction = 0.0;
            this.physicsData.absorbtionFactor = 0.0;
        } else {
            this.damageReduction = 1.0;
            this.physicsData.absorbtionFactor = this.definition.absorbtionFactor;
        }
      
        this.isInvulnerable = invulnerable;
    }

    /** See LivingEntity.receiveDamage */
    public receiveDamage(source: LivingEntity, amount: number): void {
        if (amount > 0 && this.damageReduction !== 0) {
            if (this.game.tick !== this.lastDamageTick && this.styleData.values.opacity < 1) {
                this.styleData.opacity += visibilityRateDamage;
            }

            if (this.styleData.values.opacity > 1) this.styleData.opacity = 1;
        }

        super.receiveDamage(source, amount);

    }

    /** See LivingEntity.onDeath */
    public onDeath(killer: LivingEntity) {
        const client = this.cameraEntity.getClient();
        if (!client) return this.cameraEntity.delete();
        if (!(this.cameraEntity.cameraData.player === this)) return;
        this.cameraEntity.spectatee = killer;
        this.cameraEntity.cameraData.killedBy = (killer.nameData && killer.nameData.values.name) || "";
    }

    /** Destroys the tank body. Extends LivivingEntity.destroy(animate); */
    public destroy(animate=true) {
        // Stats etc
        if (!animate && Entity.exists(this.cameraEntity)) {
            if (this.cameraEntity.cameraData.player === this) {
                this.cameraEntity.cameraData.deathTick = this.game.tick;
                this.cameraEntity.cameraData.respawnLevel = Math.min(Math.max(this.cameraEntity.cameraData.values.level - 1, 1), Math.floor(Math.sqrt(this.cameraEntity.cameraData.values.level) * 3.2796));
            }

            // Wipe this nonsense
            this.barrels = [];
            this.addons = [];
        }
        super.destroy(animate);
    }

    public delete() {
        if (this.cameraEntity.cameraData.values.player === this) this.cameraEntity.cameraData.FOV = 0.4;
        super.delete();
    }

    public tick(tick: number) {
        this.positionData.angle = Math.atan2(this.inputs.mouse.y - this.positionData.values.y, this.inputs.mouse.x - this.positionData.values.x);

        if (this.isInvulnerable) {
            if (this.game.clients.size !== 1 || this.game.arena.isOpen() === false) {
                // not for ACs
                const client = this.cameraEntity.getClient();
                if (client && client.accessLevel < AccessLevel.FullAccess) this.setInvulnerability(false);
            }
        }
        if (!this.deletionAnimation && !this.inputs.deleted) this.physicsData.size = this.baseSize * this.cameraEntity.sizeFactor;
        else this.regenPerTick = 0;

        super.tick(tick);

        // If we're currently in a deletion animation
        if (this.deletionAnimation) return;

        if (this.inputs.deleted) {
            if (this.cameraEntity.cameraData.values.level <= 5) return this.destroy();
            this.lastDamageTick = tick;
            this.healthData.health -= 2 + this.healthData.values.maxHealth / 500;

            if (this.isInvulnerable) this.setInvulnerability(false);
            if (this.styleData.values.flags & StyleFlags.isFlashing) {
                this.styleData.flags ^= StyleFlags.isFlashing;
                this.damageReduction = 1.0;
            }
            return;
            // return this.destroy();
        }

        if (this.definition.flags.zoomAbility && (this.inputs.flags & InputFlags.rightclick)) {
            if (!(this.cameraEntity.cameraData.values.flags & CameraFlags.usesCameraCoords)) {
                const angle = Math.atan2(this.inputs.mouse.y - this.positionData.values.y, this.inputs.mouse.x - this.positionData.values.x)
                this.cameraEntity.cameraData.cameraX = Math.cos(angle) * 1500 + this.positionData.values.x;
                this.cameraEntity.cameraData.cameraY = Math.sin(angle) * 1500 + this.positionData.values.y;
                this.cameraEntity.cameraData.flags |= CameraFlags.usesCameraCoords;
            }
        } else if (this.cameraEntity.cameraData.values.flags & CameraFlags.usesCameraCoords) this.cameraEntity.cameraData.flags ^= CameraFlags.usesCameraCoords;

        if (this.definition.flags.invisibility) {

            if (this.inputs.flags & InputFlags.leftclick) this.styleData.opacity += this.definition.visibilityRateShooting;
            if (this.inputs.flags & (InputFlags.up | InputFlags.down | InputFlags.left | InputFlags.right) || this.inputs.movement.x || this.inputs.movement.y) this.styleData.opacity += this.definition.visibilityRateMoving;
           
            this.styleData.opacity -= this.definition.invisibilityRate;

            this.styleData.opacity = util.constrain(this.styleData.values.opacity, 0, 1);
        }


        // Update stat related
        updateStats: {
            // Damage
            this.damagePerTick = this.cameraEntity.cameraData.statLevels[Stat.BodyDamage] + 5;
            if (this._currentTank === Tank.Spike) this.damagePerTick += 2;

            // Max Health
            const maxHealthCache = this.healthData.values.maxHealth;

            this.healthData.maxHealth = this.definition.maxHealth + 2 * (this.cameraEntity.cameraData.values.level - 1) + this.cameraEntity.cameraData.values.statLevels.values[Stat.MaxHealth] * 20;
            if (this.healthData.values.health === maxHealthCache) this.healthData.health = this.healthData.maxHealth; // just in case
            else if (this.healthData.values.maxHealth !== maxHealthCache) {
                this.healthData.health *= this.healthData.values.maxHealth / maxHealthCache
            }

            // Regen
            this.regenPerTick = (this.healthData.values.maxHealth * 4 * this.cameraEntity.cameraData.values.statLevels.values[Stat.HealthRegen] + this.healthData.values.maxHealth) / 25000;

            // Reload
            this.reloadTime = 15 * Math.pow(0.914, this.cameraEntity.cameraData.values.statLevels.values[Stat.Reload]);
        }

        this.scoreData.score = this.cameraEntity.cameraData.values.score;

        if ((this.styleData.values.flags & StyleFlags.isFlashing) && (this.game.tick >= this.cameraEntity.cameraData.values.spawnTick + 374 || this.inputs.attemptingShot() || this.inputs.movement.magnitude > 0)) {
            this.styleData.flags ^= StyleFlags.isFlashing;
            // Dont worry about invulnerability here - not gonna be invulnerable while flashing ever (see setInvulnerability)
            this.damageReduction = 1.0;
        }

        if (this.definition.sides === 2) {
            this.physicsData.width = this.physicsData.size * (this.definition.widthRatio ?? 1);
            if (this.definition.flags.displayAsTrapezoid === true) this.physicsData.flags |= PhysicsFlags.isTrapezoid;
        } else if (this.definition.flags.displayAsStar === true) this.styleData.flags |= StyleFlags.isStar;

        this.velocity.add({
            x: this.inputs.movement.x * this.cameraEntity.cameraData.values.movementSpeed,
            y: this.inputs.movement.y * this.cameraEntity.cameraData.values.movementSpeed
        });
        this.inputs.movement.set({
            x: 0,
            y: 0
        });
    }
}
