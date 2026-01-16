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
import TeamBase from "./TeamBase";
import ObjectEntity from "../Object";
import TankBody from "../Tank/TankBody";

import { Color } from "../../Const/Enums";
import { Entity } from "../../Native/Entity";
import { TeamGroup } from "../../Native/FieldGroups";

export type TeamGroupEntity = Entity & { teamData: TeamGroup }

export const ColorsTeamName: { [K in Color]?: string } = {
    [Color.Border]: "BORDER",
    [Color.Barrel]: "BARREL",
    [Color.Tank]: "TANK",
    [Color.TeamBlue]: "BLUE",
    [Color.TeamRed]: "RED",
    [Color.TeamPurple]: "PURPLE",
    [Color.TeamGreen]: "GREEN",
    [Color.Shiny]: "SHINY",
    [Color.EnemySquare]: "SQUARE",
    [Color.EnemyTriangle]: "TRIANGLE",
    [Color.EnemyPentagon]: "PENTAGON",
    [Color.EnemyCrasher]: "CRASHER",
    [Color.Neutral]: "NEUTRAL",
    [Color.ScoreboardBar]: "SCOREBOARD",
    [Color.Box]: "MAZE",
    [Color.EnemyTank]: "ENEMY",
    [Color.NecromancerSquare]: "SUNCHIP",
    [Color.Fallen]: "FALLEN"
}

export class TeamEntity extends Entity implements TeamGroupEntity {
    /** This group makes `this` a team entity in the first place. */
    public teamData: TeamGroup = new TeamGroup(this);

    /** Used for notifications in team based gamemodes */
    public teamName: string;
    
    /** The team's spawn base. */
    public base: TeamBase | null = null;

    public constructor(game: GameServer, color: Color, name: string = ColorsTeamName[color] || "UNKNOWN") {
        super(game);

        this.teamData.values.teamColor = color;
        this.teamName = name;
    }

    public static isTeam(entity: Entity | null | undefined): entity is TeamEntity {
        if (!entity) return false;

        return !!entity.teamData;
    }
    
    public static setTeam(team: TeamGroupEntity, entity: ObjectEntity) {
        if (!Entity.exists(entity)) return;

        entity.relationsData.values.team = team;

        entity.styleData.color = team.teamData.values.teamColor;
        
        if (TankBody.isTank(entity)) {
            entity.cameraEntity.relationsData.values.team = team;
        }
    }
}
