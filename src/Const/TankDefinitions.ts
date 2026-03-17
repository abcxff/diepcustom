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

import DevTankDefinitions, { DevTank } from "./DevTankDefinitions";
import { Tank, Color } from "./Enums";
import _TankDefinitions from "./TankDefinitions.json";

/** The types of post addons that exist in the game, by their id. */
export type postAddonId = "dompronounced" | "auto5" | "auto3" | "autosmasher" | "spike" | "pronounced" | "smasher" | "landmine" | "autoturret" | "weirdspike" | "auto2" | "auto7" | "autorocket" | "spiesk"
/** The types of post addons that exist in the game, by their id. */
export type preAddonId = "dombase" | "launcher"
/** A joint list of all post addon ids and pre addon ids. */
export type addonId = preAddonId | postAddonId;

/** The types of projectiles in the game */
export type projectileId = "bullet" | "drone" | "trap" | "necrodrone" | "minion" | "skimmer" | "rocket" | "swarm" | "flame" | "wall" | "croc";

/** The types of barrel addons that exist in the game */
export type barrelAddonId = "trapLauncher" | "purplebarrel";

/** Increase in opacity when taking damage. */
export const visibilityRateDamage = 0.2;

/**
 * Format that the game stores bullet definitions in its memory.
 */
export interface BulletDefinition {
    /** The type of the bullet that the barrel shoots. */
    type: projectileId;
    /** Size of the bullet shot out of the barrel in relation to the barrel's size. */
    sizeRatio: number;
    /** Used to calculate the health of the bullet that the barrel shoots. */
    health: number;
    /** Used to calculate the damage of the bullet that the barrel shoots. */
    damage: number;
    /** Used to calculate the speed of the bullet that the barrel shoots. */
    speed: number;
    /** Used to calculate the scattering rate / spread of the bullets. */
    scatterRate: number;
    /** Used to calculate the life length of a bullet that the barrel shoots. */
    lifeLength: number;
    /** Knockback factor field of the bullet */
    absorbtionFactor: number;
    /** Projectile color - by default this is set to parent's body color. */
    color?: Color;
    /** Overrides number of sides for projectile. */
    sides?: number;
}

/**
 * Format that the game stores barrel definitions in its memory.
 */
export interface BarrelDefinition {
    /** The angle that the barrel is rotated towards, from the tank's body.  */
    angle: number;
    /** The x offset of the barrel (think of Twin's barrels for example) at base radius (50).  */
    offset: number;
    /** The y offset of the barrel (distance from the tanks main body) at base radius (50). Will have no effect on clientside tankrendering.*/
    distance?: number;
    /** The size of the barrel. Think of Sniper, the longer side is the size.  */
    size: number;
    /** The width of the barrel. Think of Sniper, the shorter side is the width. Width is used to determine bullet size */
    width: number;
    /** Delay between firing cycle. Think of Octo: half of the barrels have 0 delay, and the other half have 0.5 delay.  */
    delay: number;
    /** Used to calculate the reload of a barrel. */
    reload: number;
    /** Used to calculate the recoil of a barrel's shot. */
    recoil: number;
    /** Example: Machine Gun's barrel is a trapezoid. */
    isTrapezoid: boolean;
    /** Direction that the trapezoid is facing. Machine Gun's `trapezoidalDirection` is `0`, and Stalker's is `π`. */
    trapezoidDirection: number;
    /** Barrel addon. As of now only the trapper addon exists. */
    addon: barrelAddonId | null;
    /** The maximum numbers of drones the barrel can spawn - only present if `bullet.type` === 'drone'. */
    droneCount?: number;
    /** Whether or not the drones are controllable - only present if `bullet.type` === 'drone'. */
    canControlDrones?: boolean;
    /** Whether or not the barrel should always shoot (Trapper Dominator, Defender). */
    forceFire?: boolean;
    /** Barrel color - by default this is set to the 'Barrel' color id. */
    color?: Color;
    /** The definition of the bullet that is shot from the barrel. */
    bullet: BulletDefinition;
}
/**
 * Format that the game stores stat definitions in its memory.
 */
export interface StatDefinition {
    /** The name of the stat. */
    name: string;
    /** The stat level limit. */
    max: number;
}
/**
 * Format that the game stores tank definitions in its memory.
 */
export interface TankDefinition {
    /** The id of the tank. */
    id: Tank | DevTank;
    /** The name of the tank. */
    name: string;
    /** If not empty, the client is sent a notification with this message when it upgrades to this tank. */
    upgradeMessage: string;
    /** The levels required to upgrade to this tank. */
    levelRequirement: number;
    /** The tanks this tank can upgrade to. */
    upgrades: (Tank | DevTank)[];
    /** Boolean flags about the tank. */
    flags: {
        /** If the tank can go invisible. */
        invisibility: boolean;
        /** If the tank has a Predator-like zoom ability. */
        zoomAbility: boolean;
        /** If the tank can claim squares by killing them (necro). */
        canClaimSquares?: boolean;
        /** If the tank requires devmode to access (unused). */
        devOnly: boolean;
        /** If the tank should be rendered as a star (eg. traps are stars with 3 sides). */
        displayAsStar?: boolean;
        /** If the tank should be rendered as a trapezoid (eg. drone barrels are trapezoids), sides needs to be set to 2 for this to take effect. */
        displayAsTrapezoid?: boolean;
    },
    /** How much the opacity increases per tick while shooting. */
    visibilityRateShooting: number;
    /** How much the opacity increases per tick while moving. */
    visibilityRateMoving: number;
    /** How much does the opacity decrease per tick. */
    invisibilityRate: number;
    /** Used to determine the FOV of a tank. */
    fieldFactor: number;
    /** The speed of the tank. */
    speed: number;
    /** The absorbtionFactor (field) of the tank. */
    absorbtionFactor: number;
    /** The base max health of the tank. */
    maxHealth: number;
    /** Extra body damage addition, such as spike. */
    bodyDamage?: number;
    /** The addon, if not empty, which is built before the barrels. */
    preAddon: addonId | null;
    /** The addon, if not empty, which is built after the barrels. */
    postAddon: addonId | null;
    /** The sides of the tank's body. */
    sides: number;
    /** The ratio used for size to width calculation, only takes effect when sides is 2 (rectangle). */
    widthRatio?: number;
    /** The border width of the tank's body. */
    borderWidth: number;
    /** Can be used to override the tank body's base size. */
    baseSizeOverride?: number;
    /** The tank's barrels. */
    barrels: BarrelDefinition[];
    /** The tank's stat names and limits. */
    stats: StatDefinition[];
}

/**
 * List of all tank definitions.
 */
const TankDefinitions = _TankDefinitions as (TankDefinition | null)[] & Record<Tank, TankDefinition>;
export default TankDefinitions;

/**
 * The count of all existing tanks (some in tank definitions are null).
 * Used for tank xor generation.
 */
export const TankCount = TankDefinitions.reduce((a, b) => b ? a + 1 : a, 0);

/**
 * A function used to retrieve both tank and dev tank definitions from their id.
 * Negative IDs are used to index dev tanks, whereas positive are used to index normal tanks. 
 */
export const getTankById = function (id: number): TankDefinition | null {
    return (id < 0 ? DevTankDefinitions[~id] : TankDefinitions[id]) || null;
}

export const getTankByName = function (tankName: string): TankDefinition | null {
    return TankDefinitions.find(tank => tank && tank.name === tankName) || DevTankDefinitions.find(tank => tank && tank.name === tankName) || null;
}
