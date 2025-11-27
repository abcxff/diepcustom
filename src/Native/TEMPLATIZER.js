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

/*
    ==========================================
            CHANGE NOTHING IN THIS FILE
    ==========================================
*/

const FIELD_ORDER = "Position:y,Position:x,Position:angle,Physics:size,Camera:player,Arena:flags,Style:color,Arena:scoreboardColors,Camera:killedBy,Arena:playersNeeded,Physics:sides,Team:flags,Health:flags,Arena:scoreboardTanks,Camera:respawnLevel,Camera:levelbarProgress,Camera:spawnTick,Physics:absorbtionFactor,Arena:leaderX,Health:maxHealth,Style:flags,!Example:exampleTest,Barrel:trapezoidDirection,Position:flags,Arena:scoreboardNames,Camera:score,Team:mothershipY,Arena:scoreboardSuffixes,Name:flags,Camera:movementSpeed,Arena:leaderY,Arena:bottomY,Relations:team,Camera:level,Team:teamColor,Camera:FOV,Camera:statLimits,Arena:leftX,Arena:scoreboardScores,Camera:statLevels,Camera:tankOverride,Camera:tank,Style:borderWidth,Camera:deathTick,Physics:width,Camera:statsAvailable,Barrel:flags,Camera:levelbarMax,Name:name,Relations:owner,Health:health,Camera:cameraY,Style:opacity,Barrel:reloadTime,Camera:statNames,Camera:cameraX,Team:mothershipX,Camera:unusedClientId,Relations:parent,Style:zIndex,Camera:flags,Arena:rightX,Physics:pushFactor,Physics:flags,Arena:scoreboardAmount,Arena:ticksUntilStart,Arena:topY,Score:score".split(',').map(e => e.split(':'));

const FIELD_GROUPS = [
    [
        "Relations",
        [
            {
                "name": "parent",
                "encType": "entid",
                "type": "Entity"
            },
            {
                "name": "owner",
                "encType": "entid",
                "type": "Entity"
            },
            {
                "name": "team",
                "encType": "entid",
                "type": "Entity"
            }
        ]
    ],
    ["!CPUControllable", []], // Unused, Unsupported
    [
        "Barrel",
        [
            {
                "name": "flags",
                "encType": "vu",
                "type": "number"
            },
            {
                "default": 15,
                "name": "reloadTime",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "trapezoidDirection",
                "encType": "float",
                "type": "number"
            }
        ]
    ],
    [
        "Physics",
        [
            {
                "name": "flags",
                "encType": "vu",
                "type": "number"
            },
            {
                "name": "sides",
                "encType": "vu",
                "type": "number"
            },
            {
                "name": "size",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "width",
                "encType": "float",
                "type": "number"
            },
            {
                "default": 1,
                "name": "absorbtionFactor",
                "encType": "float",
                "type": "number"
            },
            {
                "default": 8,
                "name": "pushFactor",
                "encType": "float",
                "type": "number"
            }
        ]
    ],
    [
        "Health",
        [
            {
                "name": "flags",
                "encType": "vu",
                "type": "number"
            },
            {
                "default": 1.0,
                "name": "health",
                "encType": "float",
                "type": "number"
            },
            {
                "default": 1.0,
                "name": "maxHealth",
                "encType": "float",
                "type": "number"
            }
        ]
    ],
    ["!Dominator", []], // Unused, Unsupported
    ["!Example",[{"name": "exampleTest","encType": "vi","type": "number"}]], // Unused
    // [
    //     "Lobby",
    //     [
    //         {
    //             "name": "playerCount",
    //             "encType": "vu"
    //         },
    //         {
    //             "amount": 80,
    //             "name": "playerIds",
    //             "encType": "stringNT",
    //         },
    //         {
    //             "amount": 80,
    //             "name": "playerNames",
    //             "encType": "stringNT",
    //         }
    //     ]
    // ],
    [
        "Arena",
        [
            {
                "default": 2,
                "name": "flags",
                "encType": "vu",
                "type": "number"
            },
            {
                "name": "leftX",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "topY",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "rightX",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "bottomY",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "scoreboardAmount",
                "encType": "vu",
                "type": "number"
            },
            {
                "amount": 10,
                "name": "scoreboardNames",
                "encType": "stringNT",
                "type": "string"
            },
            {
                "amount": 10,
                "name": "scoreboardScores",
                "encType": "float",
                "type": "number"
            },
            {
                "default": 13,
                "amount": 10,
                "name": "scoreboardColors",
                "encType": "vu",
                "type": "Color"
            },
            {
                "amount": 10,
                "name": "scoreboardSuffixes",
                "encType": "stringNT",
                "type": "string"
            },
            {
                "amount": 10,
                "name": "scoreboardTanks",
                "encType": "vi",
                "type": "Tank | DevTank"
            },
            {
                "name": "leaderX",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "leaderY",
                "encType": "float",
                "type": "number"
            },
            {
                "default": 1,
                "name": "playersNeeded",
                "encType": "vi",
                "type": "number"
            },
            {
                "default": 250,
                "name": "ticksUntilStart",
                "encType": "float",
                "type": "number"
            }
        ]
    ],
    [
        "Name",
        [
            {
                "name": "flags",
                "encType": "vu",
                "type": "number"
            },
            {
                "name": "name",
                "encType": "stringNT",
                "type": "string"
            }
        ]
    ],
    [
        "Camera",
        [
            {
                "name": "unusedClientId",
                "encType": "vu",
                "type": "number"
            },
            {
                "default": 1,
                "name": "flags",
                "encType": "vu",
                "type": "number"
            },
            {
                "name": "player",
                "encType": "entid",
                "type": "Entity"
            },
            {
                "default": 0.35,
                "name": "FOV",
                "encType": "float",
                "type": "number"
            },
            {
                "default": 1,
                "name": "level",
                "encType": "vi",
                "type": "number"
            },
            {
                "default": 53,
                "name": "tank",
                "encType": "vi",
                "type": "Tank | DevTank"
            },
            {
                "name": "levelbarProgress",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "levelbarMax",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "statsAvailable",
                "encType": "vi",
                "type": "number"
            },
            {
                "amount": 8,
                "name": "statNames",
                "encType": "stringNT",
                "type": "string"
            },
            {
                "amount": 8,
                "name": "statLevels",
                "encType": "vi",
                "type": "number"
            },
            {
                "amount": 8,
                "name": "statLimits",
                "encType": "vi",
                "type": "number"
            },
            {
                "name": "cameraX",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "cameraY",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "score",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "respawnLevel",
                "encType": "vi",
                "type": "number",
                "default": 1
            },
            {
                "name": "killedBy",
                "encType": "stringNT",
                "type": "string"
            },
            // {
            //     "name": "spectatorID",
            //     "encType": "stringNT"
            // },
            {
                "name": "spawnTick",
                "encType": "vi",
                "type": "number"
            },
            {
                "default": -1,
                "name": "deathTick",
                "encType": "vi",
                "type": "number"
            },
            {
                "name": "tankOverride",
                "encType": "stringNT",
                "type": "string"
            },
            {
                "name": "movementSpeed",
                "encType": "float",
                "type": "number"
            }
        ]
    ],
    [
        "Position",
        [
            {
                "name": "x",
                "encType": "vi",
                "type": "number"
            },
            {
                "name": "y",
                "encType": "vi",
                "type": "number"
            },
            {
                "name": "angle",
                "encType": "float64Precision",
                "type": "number"
            },
            {
                "name": "flags",
                "encType": "vu",
                "type": "number"
            }
        ]
    ],
    [
        "Style",
        [
            {
                "default": 1,
                "name": "flags",
                "encType": "vu",
                "type": "number"
            },
            {
                "name": "color",
                "encType": "vu",
                "type": "Color"
            },
            {
                "default": 7.5,
                "name": "borderWidth",
                "encType": "float64Precision",
                "type": "number"
            },
            {
                "default": 1,
                "name": "opacity",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "zIndex",
                "encType": "vu",
                "type": "number"
            }
        ]
    ],
    ["!Tagged", []], // unused, Unsupported
    [
        "Score",
        [
            {
                "name": "score",
                "encType": "float",
                "type": "number"
            }
        ]
    ],
    [
        "Team",
        [
            {
                "name": "teamColor",
                "encType": "vu",
                "type": "Color"
            },
            {
                "name": "mothershipX",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "mothershipY",
                "encType": "float",
                "type": "number"
            },
            {
                "name": "flags",
                "encType": "vu",
                "type": "number"
            }
        ]
    ]
];

const EXISTANT_FIELD_GROUPS = FIELD_GROUPS.filter(e => !e[0].startsWith('!'));
const EXISTANT_FIELD_GROUP_NAMES = EXISTANT_FIELD_GROUPS.map(e => e[0]);



const OUTPUTS = [
    ["./FieldGroups.TEMPLATE", "./FieldGroups.ts"],
    ["./Entity.TEMPLATE", "./Entity.ts"],
    ["./UpcreateCompiler.TEMPLATE", "./UpcreateCompiler.ts"]
]

const evalMatch = /\^\<\<((\n|.)+?)\>\>\^/gm;

const fs = require('fs');
const interpolate = (template, context) => {
    return template.split('\n').filter(e=>!e.startsWith('#')).join('\n').replace(evalMatch, (_, statement) => {
        with (context) {
            return ' /* <template> auto-generated */ ' + eval(statement);
        }
    });
}
for (const [templateName, outFileName] of OUTPUTS) {
    const template = fs.readFileSync(templateName, 'utf-8');
    const outFile = interpolate(template, {
        EXISTANT_FIELD_GROUPS,
        EXISTANT_FIELD_GROUP_NAMES,
        FIELD_GROUPS,
        FIELD_ORDER
    });
    fs.writeFileSync(outFileName, outFile);
}