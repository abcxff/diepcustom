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

import { PI2 } from "../util";
import { TankDefinition } from "./TankDefinitions";

/**
 * The IDs for all the dev tanks, by name.
 */
export const enum DevTank {
    Developer = -1,
    UsainBolt = -2,
    BigBoi = -3,
    Bouncy = -4,
    Master = -5,
    Musketeer = -6,
    Squirrel = -7,
    Shotgun = -8,
    Flamethrower = -9,
    Builder = -10,
    Goodbye = -11,
    Spectator = -12,
    TheCroc = -13,
    Railgun = -14,
    Commander = -15
};

/**
 * List of all dev tank definitions.
*/
const DevTankDefinitions: TankDefinition[] = [
    {
        id: DevTank.Developer,
        name: "Developer",
        upgradeMessage: "Use your right mouse button to teleport to where your mouse is",
        // upgrades dont have any affect
        upgrades: [],
        barrels: [
            {
                angle: 0,
                delay: 0,
                size: 85,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: .5,
                    damage: .5,
                    health: 0.45,
                    scatterRate: 0.01,
                    lifeLength: 0.3,
                    absorbtionFactor: 1,
                    sizeRatio: 1
                },
                reload: .6,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: Math.PI
            }
        ],
        levelRequirement: 45,
        fieldFactor: .75,
        speed: 1.5,
        absorbtionFactor: 1,
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0,
        invisibilityRate: 0,
        preAddon: "spike",
        postAddon: null,
        maxHealth: 50,
        borderWidth: 15,
        sides: 1,
        stats: [
            {
                name: "Movement Speed",
                max: 9
            },
            {
                name: "Reload",
                max: 9
            },
            {
                name: "Bullet Damage",
                max: 9
            },
            {
                name: "Bullet Penetration",
                max: 9
            },
            {
                name: "Bullet Speed",
                max: 9
            },
            {
                name: "Body Damage",
                max: 9
            },
            {
                name: "Max Health",
                max: 9
            },
            {
                name: "Health Regen",
                max: 9
            }
        ]
    },
    {
        id: DevTank.UsainBolt,
        name: "Usain Bolt",
        upgradeMessage: "Use your right mouse button to look further in the direction you're facing",
        // upgrades dont have any affect
        upgrades: [DevTank.Developer],
        barrels: [
            {
                angle: Math.PI,
                delay: 0,
                size: 65,
                offset: 0,
                recoil: 9,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: .1,
                    damage: 1,
                    health: 1,
                    scatterRate: 0.1,
                    lifeLength: .5,
                    absorbtionFactor: 1,
                    sizeRatio: 1
                },
                reload: .2,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: Math.PI
            },
            { // Sniper Barrel (basically)
                angle: 0,
                delay: 0,
                size: 110,
                offset: 0,
                recoil: .2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1.5,
                    damage: 1.5,
                    health: 1,
                    scatterRate: 3,
                    lifeLength: 1,
                    absorbtionFactor: 1,
                    sizeRatio: 1
                },
                reload: 1.5,
                width: 42,
                isTrapezoid: false,
                trapezoidDirection: 0
            }
        ],
        levelRequirement: 45,
        fieldFactor: .9,
        speed: 1.2,
        absorbtionFactor: 1,
        flags: {
            invisibility: false,
            zoomAbility: true,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0,
        invisibilityRate: 0,
        preAddon: null,
        postAddon: null,
        maxHealth: 50,
        borderWidth: 15,
        sides: 1,
        stats: [
            {
                name: "Movement Speed",
                max: 15
            },
            {
                name: "Reload",
                max: 0
            },
            {
                name: "Bullet Damage",
                max: 0
            },
            {
                name: "Bullet Penetration",
                max: 0
            },
            {
                name: "Bullet Speed",
                max: 0
            },
            {
                name: "Body Damage",
                max: 0
            },
            {
                name: "Max Health",
                max: 0
            },
            {
                name: "Health Regen",
                max: 0
            }
        ]
    },
    {
        id: DevTank.BigBoi,
        name: "Big Boi",
        upgradeMessage: "",
        upgrades: [],
        barrels: [
            {
                angle: 0,
                delay: 0,
                size: 95,
                offset: 0,
                recoil: 20,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 0.7,
                    damage: 5,
                    health: 4,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 1,
                    sizeRatio: 1
                },
                reload: 1,
                width: 200,
                isTrapezoid: false,
                trapezoidDirection: 0
            }
        ],
        levelRequirement: 45,
        fieldFactor: 1,
        speed: 1,
        absorbtionFactor: 1,
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0,
        invisibilityRate: 0,
        preAddon: null,
        postAddon: null,
        maxHealth: 50,
        borderWidth: 15,
        sides: 1,
        stats: [
            {
                name: "Movement Speed",
                max: 0
            },
            {
                name: "Reload",
                max: 0
            },
            {
                name: "Bullet Damage",
                max: 10
            },
            {
                name: "Bullet Penetration",
                max: 10
            },
            {
                name: "Bullet Speed",
                max: 0
            },
            {
                name: "Body Damage",
                max: 0
            },
            {
                name: "Max Health",
                max: 0
            },
            {
                name: "Health Regen",
                max: 0
            }
        ]
    },
    {
        id: DevTank.Bouncy,
        name: "Bouncy",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0,
        visibilityRateMoving: 0,
        invisibilityRate: 0,
        fieldFactor: 0.7,
        absorbtionFactor: 1,
        speed: 2,
        maxHealth: 100,
        preAddon: null,
        postAddon: null,
        sides: 7,
        borderWidth: 15,
        barrels: [
            {
                angle: PI2/ 7 * 0,
                offset: 0,
                size: 100,
                width: 60,
                delay: 0,
                reload: 0.2, 
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: "trapLauncher",
                bullet: {
                    type: "trap",
                    sizeRatio: 1,
                    health: 1,
                    lifeLength: 0.9,
                    damage: 16,
                    speed: 0,
                    scatterRate: .5,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 7 * 1,
                offset: 0,
                size: 100,
                width: 60,
                delay: 0,
                reload: 0.2, 
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: "trapLauncher",
                bullet: {
                    type: "trap",
                    sizeRatio: 1,
                    health: 1,
                    lifeLength: 0.9,
                    damage: 20,
                    speed: 0,
                    scatterRate: .5,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 7 * 2,
                offset: 0,
                size: 100,
                width: 60,
                delay: 0,
                reload: 0.2, 
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: "trapLauncher",
                bullet: {
                    type: "trap",
                    sizeRatio: 1,
                    health: 1,
                    lifeLength: 0.9,
                    damage: 20,
                    speed: 0,
                    scatterRate: .5,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 7 * 3,
                offset: 0,
                size: 100,
                width: 60,
                delay: 0,
                reload: 0.2, 
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: "trapLauncher",
                bullet: {
                    type: "trap",
                    sizeRatio: 1,
                    health: 1,
                    lifeLength: 0.9,
                    damage: 20,
                    speed: 0,
                    scatterRate: .5,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 7 * 4,
                offset: 0,
                size: 100,
                width: 60,
                delay: 0,
                reload: 0.2, 
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: "trapLauncher",
                bullet: {
                    type: "trap",
                    sizeRatio: 1,
                    health: 1,
                    lifeLength: 0.9,
                    damage: 20,
                    speed: 0,
                    scatterRate: .5,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 7 * 5,
                offset: 0,
                size: 100,
                width: 60,
                delay: 0,
                reload: 0.2, 
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: "trapLauncher",
                bullet: {
                    type: "trap",
                    sizeRatio: 1,
                    health: 1,
                    lifeLength: 0.9,
                    damage: 20,
                    speed: 0,
                    scatterRate: .5,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 7 * 6,
                offset: 0,
                size: 100,
                width: 60,
                delay: 0,
                reload: 0.2, 
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: "trapLauncher",
                bullet: {
                    type: "trap",
                    sizeRatio: 1,
                    health: 1,
                    lifeLength: 0.9,
                    damage: 20,
                    speed: 0,
                    scatterRate: .5,
                    absorbtionFactor: 1
                }
            }
        ],
        stats: [
            {
                name: "have fun",
                max: 5
            },
            {
                name: "Reload",
                max: 0
            },
            {
                name: "Bullet Damage",
                max: 0
            },
            {
                name: "Bullet Penetration",
                max: 0
            },
            {
                name: "Bullet Speed",
                max: 0
            },
            {
                name: "Body Damage",
                max: 0
            },
            {
                name: "Max Health",
                max: 0
            },
            {
                name: "Health Regen",
                max: 0
            }
        ]
    },
    {
        id: DevTank.Master,
        name: "Master",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        fieldFactor: 0.9,
        absorbtionFactor: 1,
        speed: 1,
        maxHealth: 50,
        preAddon: null,
        postAddon: null,
        sides: 1,
        borderWidth: 15,
        barrels: [
            {
                angle: 0,
                offset: 0,
                size: 65,
                width: 42,
                delay: 0,
                reload: 3,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 4,
                canControlDrones: true,
                bullet: {
                    type: "minion",
                    sizeRatio: 1,
                    health: 4,
                    damage: 0.7,
                    speed: 0.56,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2 / 3,
                offset: 0,
                size: 65,
                width: 42,
                delay: 0,
                reload: 3,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 4,
                canControlDrones: true,
                bullet: {
                    type: "minion",
                    sizeRatio: 1,
                    health: 4,
                    damage: 0.7,
                    speed: 0.56,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: Math.PI * 4 / 3,
                offset: 0,
                size: 65,
                width: 42,
                delay: 0,
                reload: 3,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 4,
                canControlDrones: true,
                bullet: {
                    type: "minion",
                    sizeRatio: 1,
                    health: 4,
                    damage: 0.7,
                    speed: 0.56,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            }
        ],
        stats: [
            {
                name: "Movement Speed",
                max: 7
            },
            {
                name: "Reload",
                max: 7
            },
            {
                name: "Drone Damage",
                max: 7
            },
            {
                name: "Drone Health",
                max: 7
            },
            {
                name: "Drone Speed",
                max: 7
            },
            {
                name: "Body Damage",
                max: 7
            },
            {
                name: "Max Health",
                max: 7
            },
            {
                name: "Health Regen",
                max: 7
            }
        ]
    },
    {
        id: DevTank.Musketeer,
        name: "Musketeer",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        fieldFactor: 0.9,
        absorbtionFactor: 1,
        speed: 1,
        maxHealth: 50,
        preAddon: null,
        postAddon: "autorocket",
        sides: 1,
        borderWidth: 15,
        barrels: [
            {
                angle: 0,
                offset: -21,
                size: 70,
                width: 28,
                delay: 0,
                reload: 0.75,
                recoil: 0.25,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1,
                    health: 0.5,
                    damage: 0.25,
                    speed: 1.5,
                    scatterRate: .3,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: 0,
                offset: 21,
                size: 70,
                width: 28,
                delay: 0,
                reload: 0.75,
                recoil: 0.25,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1,
                    health: 0.5,
                    damage: 0.25,
                    speed: 1.5,
                    scatterRate: .3,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: 0,
                offset: 0,
                size: 110,
                width: 42,
                delay: 0,
                reload: 1.5,
                recoil: 2,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1,
                    health: 0.9,
                    damage: 0.9,
                    speed: 1.5,
                    scatterRate: .3,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            },
        ],
        stats: [
            {
                name: "Movement Speed",
                max: 7
            },
            {
                name: "Reload",
                max: 7
            },
            {
                name: "Bullet Damage",
                max: 7
            },
            {
                name: "Bullet Penetration",
                max: 7
            },
            {
                name: "Bullet Speed",
                max: 7
            },
            {
                name: "Body Damage",
                max: 7
            },
            {
                name: "Max Health",
                max: 7
            },
            {
                name: "Health Regen",
                max: 7
            }
        ]
    },
    {
        id: DevTank.Squirrel,
        name: "Squirrel",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: true,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.4,
        visibilityRateMoving: 0.24,
        invisibilityRate: 0.2,
        fieldFactor: 0.9,
        absorbtionFactor: 0,
        speed: 1,
        maxHealth: 50,
        preAddon: null,
        postAddon: "spiesk",
        sides: 1,
        borderWidth: 15,
        barrels: [
            {
                angle: Math.PI,
                offset: 0,
                size: 80,
                width: 50,
                delay: 0,
                reload: 0.2,
                recoil: 0.6,
                isTrapezoid: true,
                trapezoidDirection: Math.PI,
                addon: null,
                droneCount: 4294967295,
                canControlDrones: false,
                bullet: {
                    type: "swarm",
                    sizeRatio: 0.5,
                    health: 1,
                    damage: 0.15,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 0.5,
                    absorbtionFactor: 1
                }
            },
            {
                angle: Math.PI * (1 / 9),
                offset: 35,
                size: 180,
                width: 36,
                delay: Infinity, // no shoot
                reload: 1,
                recoil: 0.25,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1,
                    health: 1,
                    damage: 1,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: Math.PI * (-1 / 9),
                offset: -35,
                size: 180,
                width: 36,
                delay: Infinity, // no shoot 
                reload: 1,
                recoil: 1,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1,
                    health: 1,
                    damage: 1,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: Math.PI / 4,
                offset: -204,
                size: 65,
                width: 70,
                delay: 0,
                reload: 1,
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 2,
                    health: 5,
                    damage: 1,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 0.05,
                    absorbtionFactor: 0
                }
            },
            {
                angle: - Math.PI / 4,
                offset: 204,
                size: 65,
                width: 70,
                delay: 0.5,
                reload: 1,
                recoil: 0,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 2,
                    health: 5,
                    damage: 1,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 0.05,
                    absorbtionFactor: 0
                }
            },
        ],
        stats: [
            {
                name: "Movement Speed",
                max: 7
            },
            {
                name: "Reload",
                max: 7
            },
            {
                name: "Bullet Damage",
                max: 7
            },
            {
                name: "Bullet Penetration",
                max: 7
            },
            {
                name: "Bullet Range",
                max: 7
            },
            {
                name: "Body Damage",
                max: 7
            },
            {
                name: "Max Health",
                max: 7
            },
            {
                name: "Health Regen",
                max: 7
            }
        ]
    },
    {
        id: DevTank.Shotgun,
        name: "Shotgun",
        upgradeMessage: "",
        upgrades: [],
        barrels: [
            {
                angle: 0,
                delay: 0,
                size: 140,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 140,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 140,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 140,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 140,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 120,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 100,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 80,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
            {
                angle: 0,
                delay: 0,
                size: 80,
                offset: 0,
                recoil: 2,
                addon: null,
                bullet: {
                    type: "bullet",
                    speed: 1,
                    damage: 0.2,
                    health: 5,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 0.05,
                    sizeRatio: 0.5
                },
                reload: 3,
                width: 50,
                isTrapezoid: true,
                trapezoidDirection: 0
            },
        ],
        levelRequirement: 45,
        fieldFactor: 1.1,
        speed: 1,
        absorbtionFactor: 1,
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        preAddon: null,
        postAddon: null,
        maxHealth: 50,
        borderWidth: 15,
        sides: 1,
        stats: [
            {
                name: "Movement Speed",
                max: 7
            },
            {
                name: "Reload",
                max: 0
            },
            {
                name: "Bullet Damage",
                max: 7
            },
            {
                name: "Bullet Penetration",
                max: 7
            },
            {
                name: "Bullet Speed",
                max: 7
            },
            {
                name: "Body Damage",
                max: 7
            },
            {
                name: "Max Health",
                max: 7
            },
            {
                name: "Health Regen",
                max: 7
            }
        ]
    },
    {
        id: DevTank.Flamethrower,
        name: "Flame Thrower",
        upgradeMessage: "",
        levelRequirement: 30,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        fieldFactor: 1,
        absorbtionFactor: 1,
        speed: 1,
        maxHealth: 50,
        preAddon: null,
        postAddon: null,
        sides: 1,
        borderWidth: 15,
        barrels: [
            {
                angle: 0,
                offset: 0,
                size: 110,
                width: 40,
                delay: 0,
                reload: 0.8,
                recoil: 0.5,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "flame",
                    sizeRatio: 1,
                    health: 200,
                    damage: 0.2,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: 0,
                offset: 0,
                size: 75,
                width: 24,
                delay: 0,
                reload: 0.25,
                recoil: 0.25,
                isTrapezoid: true,
                trapezoidDirection: Math.PI,
                addon: null,
                bullet: {
                    type: "flame",
                    sizeRatio: 1,
                    health: 200,
                    damage: 0.2,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            }
        ],
        stats: [
            {
                name: "Movement Speed",
                max: 7
            },
            {
                name: "Reload",
                max: 7
            },
            {
                name: "Flame Damage",
                max: 7
            },
            {
                name: "Flame Penetration",
                max: 0
            },
            {
                name: "Flame Speed",
                max: 7
            },
            {
                name: "Body Damage",
                max: 7
            },
            {
                name: "Max Health",
                max: 7
            },
            {
                name: "Health Regen",
                max: 7
            }
        ]
    },
    {
        id: DevTank.Builder,
        name: "Builder",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: true,
            zoomAbility: false,
            devOnly: true
        },
        visibilityRateShooting: 0.09,
        visibilityRateMoving: 0,
        invisibilityRate: 0.06,
        fieldFactor: 0.7,
        absorbtionFactor: 0,
        speed: 1.7,
        maxHealth: 50,
        preAddon: null,
        postAddon: null,
        sides: 5,
        borderWidth: 15,
        barrels: [
            {
                angle: 0,
                offset: 0,
                size: 80,
                width: 50,
                delay: 0,
                reload: 0.5,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "wall",
                    sizeRatio: 0,
                    health: 0,
                    damage: 0,
                    speed: 0,
                    scatterRate: 1,
                    lifeLength: 0,
                    absorbtionFactor: 0
                }
            }
        ],
        stats: [
            {
                name: "Movement Speed",
                max: 0
            },
            {
                name: "Reload",
                max: 0
            },
            {
                name: "Drone Damage",
                max: 0
            },
            {
                name: "Drone Health",
                max: 0
            },
            {
                name: "Drone Speed",
                max: 0
            },
            {
                name: "Body Damage",
                max: 0
            },
            {
                name: "Max Health",
                max: 0
            },
            {
                name: "Health Regen",
                max: 0
            }
        ]
    },
    {
        id: DevTank.Goodbye,
        name: "Goodbye",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: true
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        fieldFactor: 1,
        absorbtionFactor: 1,
        speed: 1,
        maxHealth: 50,
        preAddon: null,
        postAddon: null,
        sides: 1,
        borderWidth: 15,
        barrels: [
            // 7 ac bullets gg
            {angle:-0.15,offset:0,size:75,width:42,delay:0,reload:1,recoil:0.1,isTrapezoid:false,trapezoidDirection:0,addon:null,bullet:{type:"bullet",sizeRatio:1,health:300,damage:7,speed:2,scatterRate:1,lifeLength:1,absorbtionFactor:1}},
            {angle:0.15,offset:0,size:75,width:42,delay:0,reload:1,recoil:0.1,isTrapezoid:false,trapezoidDirection:0,addon:null,bullet:{type:"bullet",sizeRatio:1,health:300,damage:7,speed:2,scatterRate:1,lifeLength:1,absorbtionFactor:1}},
            {angle:-0.10,offset:0,size:75,width:42,delay:0,reload:1,recoil:0.1,isTrapezoid:false,trapezoidDirection:0,addon:null,bullet:{type:"bullet",sizeRatio:1,health:300,damage:7,speed:2,scatterRate:1,lifeLength:1,absorbtionFactor:1}},
            {angle:0.10,offset:0,size:75,width:42,delay:0,reload:1,recoil:0.1,isTrapezoid:false,trapezoidDirection:0,addon:null,bullet:{type:"bullet",sizeRatio:1,health:300,damage:7,speed:2,scatterRate:1,lifeLength:1,absorbtionFactor:1}},
            {angle:-0.05,offset:0,size:75,width:42,delay:0,reload:1,recoil:0.1,isTrapezoid:false,trapezoidDirection:0,addon:null,bullet:{type:"bullet",sizeRatio:1,health:300,damage:7,speed:2,scatterRate:1,lifeLength:1,absorbtionFactor:1}},
            {angle:0.05,offset:0,size:75,width:42,delay:0,reload:1,recoil:0.1,isTrapezoid:false,trapezoidDirection:0,addon:null,bullet:{type:"bullet",sizeRatio:1,health:300,damage:7,speed:2,scatterRate:1,lifeLength:1,absorbtionFactor:1}},
            {angle:0,offset:0,size:75,width:42,delay:0,reload:1,recoil:0.1,isTrapezoid:false,trapezoidDirection:0,addon:null,bullet:{type:"bullet",sizeRatio:1,health:300,damage:7,speed:2,scatterRate:1,lifeLength:1,absorbtionFactor:1}},
        ],
        stats: [
            {
                name: "Movement Speed",
                max: 7
            },
            {
                name: "Reload",
                max: 7
            },
            {
                name: "Bullet Damage",
                max: 7
            },
            {
                name: "Bullet Penetration",
                max: 7
            },
            {
                name: "Bullet Speed",
                max: 7
            },
            {
                name: "Body Damage",
                max: 7
            },
            {
                name: "Max Health",
                max: 7
            },
            {
                name: "Health Regen",
                max: 7
            }
        ]
    },
    {
        id: DevTank.Spectator,
        name: "Spectator",
        upgradeMessage: "",
        levelRequirement: 0,
        upgrades: [],
        flags: {
            invisibility: true,
            zoomAbility: false,
            devOnly: true
        },
        visibilityRateShooting: 0.0,
        visibilityRateMoving: 0.0,
        invisibilityRate: 1.0,
        fieldFactor: 0.3,
        absorbtionFactor: 0,
        speed: 3,
        maxHealth: 50,
        preAddon: null,
        postAddon: null,
        sides: 0,
        borderWidth: 15,
        barrels: [],
        stats: [
            {
                name: "Movement Speed",
                max: 0
            },
            {
                name: "Reload",
                max: 0
            },
            {
                name: "Bullet Damage",
                max: 0
            },
            {
                name: "Bullet Penetration",
                max: 0
            },
            {
                name: "Bullet Speed",
                max: 0
            },
            {
                name: "Body Damage",
                max: 0
            },
            {
                name: "Max Health",
                max: 0
            },
            {
                name: "Health Regen",
                max: 0
            }
        ]
    },
    {
        id: DevTank.TheCroc,
        name: "The Croc",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        fieldFactor: 0.9,
        absorbtionFactor: 1,
        speed: 1,
        maxHealth: 50,
        preAddon: "pronounced",
        postAddon: null,
        sides: 1,
        borderWidth: 15,
        barrels: [
            {
                angle: 0,
                offset: 0,
                size: 95,
                width: 42,
                delay: 0,
                reload: 0.7,
                recoil: 0.8,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "croc",
                    sizeRatio: 1,
                    health: 1,
                    damage: 1,
                    speed: 0.8,
                    scatterRate: 0,
                    lifeLength: 1.3,
                    absorbtionFactor: 0.1
                }
            }
        ],
        stats: [
            {
                name: "Movement Speed",
                max: 7
            },
            {
                name: "Reload",
                max: 7
            },
            {
                name: "Bullet Damage",
                max: 7
            },
            {
                name: "Bullet Penetration",
                max: 7
            },
            {
                name: "Bullet Speed",
                max: 7
            },
            {
                name: "Body Damage",
                max: 7
            },
            {
                name: "Max Health",
                max: 7
            },
            {
                name: "Health Regen",
                max: 7
            }
        ]
    },
    {
        id: DevTank.Railgun,
        name: "Railgun",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        fieldFactor: 0.8,
        absorbtionFactor: 1,
        speed: 1,
        maxHealth: 50,
        preAddon: null,
        postAddon: "pronounced",
        sides: 1,
        borderWidth: 15,
        barrels: [
            {
                angle: 0,
                offset: 0,
                size: 130,
                width: 42,
                delay: Infinity,
                reload: 1.75,
                recoil: 5,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1.25,
                    health: 1.5,
                    damage: 1.8,
                    speed: 3,
                    scatterRate: 1,
                    lifeLength: 1.5,
                    absorbtionFactor: 0.7
                }
            },
            {
                angle: 0,
                offset: 0,
                size: 110,
                width: 42,
                delay: Infinity,
                reload: 1.75,
                recoil: 5,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1.25,
                    health: 1.5,
                    damage: 1.8,
                    speed: 3,
                    scatterRate: 1,
                    lifeLength: 1.5,
                    absorbtionFactor: 0.7
                }
            },
            {
                angle: 0,
                offset: 0,
                size: 90,
                width: 42,
                delay: 0,
                reload: 1.75,
                recoil: 5,
                isTrapezoid: false,
                trapezoidDirection: 0,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1.25,
                    health: 1.5,
                    damage: 1.8,
                    speed: 3,
                    scatterRate: 1,
                    lifeLength: 1.5,
                    absorbtionFactor: 0.7
                }
            },
            {
                angle: PI2 - Math.PI * (1 / 36),
                offset: -20,
                size: 150,
                width: 21,
                delay: Infinity,
                reload: 1,
                recoil: 0.75,
                isTrapezoid: true,
                trapezoidDirection: Math.PI,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1,
                    health: 0.9,
                    damage: 0.65,
                    speed: 1,
                    scatterRate: 1,
                    lifeLength: 1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: Math.PI * (1 / 36),
                offset: 20,
                size: 150,
                width: 21,
                delay: Infinity,
                reload: 1,
                recoil: 0.75,
                isTrapezoid: true,
                trapezoidDirection: Math.PI,
                addon: null,
                bullet: {
                    type: "bullet",
                    sizeRatio: 1,
                    health: 0.9,
                    damage: 0.65,
                    speed: 1,
                    lifeLength: 1,
                    scatterRate: 1,
                    absorbtionFactor: 1
                }
            }
        ],
       stats: [
            {
                name: "Movement Speed",
                "max": 7
            },
            {
                name: "Reload",
                "max": 7
            },
            {
                name: "Bullet Damage",
                "max": 7
            },
            {
                name: "Bullet Penetration",
                "max": 7
            },
            {
                name: "Bullet Speed",
                "max": 7
            },
            {
                name: "Body Damage",
                "max": 7
            },
            {
                name: "Max Health",
                "max": 7
            },
            {
                name: "Health Regen",
                "max": 7
            }
        ]
    },
    {
        id: DevTank.Commander,
        name: "Commander",
        upgradeMessage: "",
        levelRequirement: 45,
        upgrades: [],
        flags: {
            invisibility: false,
            zoomAbility: false,
            devOnly: false
        },
        visibilityRateShooting: 0.23,
        visibilityRateMoving: 0.08,
        invisibilityRate: 0.03,
        fieldFactor: 0.9,
        absorbtionFactor: 1,
        speed: 1,
        maxHealth: 50,
        preAddon: null,
        postAddon: null,
        sides: 1,
        borderWidth: 15,
        barrels: [
            {
                angle: PI2/ 6 * 1,
                offset: 0,
                size: 70,
                width: 42,
                delay: 0,
                reload: 6,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 2,
                canControlDrones: true,
                bullet: {
                    type: "drone",
                    sizeRatio: 1,
                    health: 2,
                    damage: 0.7,
                    speed: 0.8,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 6 * 3,
                offset: 0,
                size: 70,
                width: 42,
                delay: 0,
                reload: 6,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 2,
                canControlDrones: true,
                bullet: {
                    type: "drone",
                    sizeRatio: 1,
                    health: 2,
                    damage: 0.7,
                    speed: 0.8,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 6 * 5,
                offset: 0,
                size: 70,
                width: 42,
                delay: 0,
                reload: 6,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 2,
                canControlDrones: true,
                bullet: {
                    type: "drone",
                    sizeRatio: 1,
                    health: 2,
                    damage: 0.7,
                    speed: 0.8,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 6 * 2,
                offset: 0,
                size: 70,
                width: 42,
                delay: 0,
                reload: 6,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 2,
                canControlDrones: true,
                bullet: {
                    type: "drone",
                    sizeRatio: 1,
                    health: 2,
                    damage: 0.7,
                    speed: 0.8,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 6 * 4,
                offset: 0,
                size: 70,
                width: 42,
                delay: 0,
                reload: 6,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 2,
                canControlDrones: true,
                bullet: {
                    type: "drone",
                    sizeRatio: 1,
                    health: 2,
                    damage: 0.7,
                    speed: 0.8,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
            {
                angle: PI2/ 6 * 6,
                offset: 0,
                size: 70,
                width: 42,
                delay: 0,
                reload: 6,
                recoil: 1,
                isTrapezoid: true,
                trapezoidDirection: 0,
                addon: null,
                droneCount: 2,
                canControlDrones: true,
                bullet: {
                    type: "drone",
                    sizeRatio: 1,
                    health: 2,
                    damage: 0.7,
                    speed: 0.8,
                    scatterRate: 1,
                    lifeLength: -1,
                    absorbtionFactor: 1
                }
            },
        ],
       stats: [
            {
                name: "Movement Speed",
                "max": 7
            },
            {
                name: "Reload",
                "max": 7
            },
            {
                name: "Drone Damage",
                "max": 7
            },
            {
                name: "Drone Health",
                "max": 7
            },
            {
                name: "Drone Speed",
                "max": 7
            },
            {
                name: "Body Damage",
                "max": 7
            },
            {
                name: "Max Health",
                "max": 7
            },
            {
                name: "Health Regen",
                "max": 7
            }
        ]
    }
]

export default DevTankDefinitions;
// export const DevTankCount = DevTankDefinitions.reduce((a, b) => b ? a + 1 : a, 1);
