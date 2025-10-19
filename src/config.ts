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

/** The build supported by the server. */
export const buildHash: string = "6f59094d60f98fafc14371671d3ff31ef4d75d9e";

/** The port the server is hosting its game server on. */
export const serverPort: number = parseInt(process.env.PORT || "8080");

/** Milliseconds per tick in the game. */
export const mspt: number = 40;

/** Ticks per second in the game */
export const tps: number = 1000 / mspt;

/** Max connections per ip. Infinity = no limit */
export const connectionsPerIp: number = Infinity;

/** Max incoming packet size (HARD LIMIT), not the max read / write size */
export const wssMaxMessageSize: number = 4096; // 4 kb

/** Output Chunk Size for the Writer (during resize) */
export const writtenBufferChunkSize = Buffer.poolSize || 2048;

/** Host id to be sent to client. */
export const host: string = process.env.SERVER_INFO || "unknown";

/** Runtime mode. */
export const mode: string = process.env.NODE_ENV || "development";

/** How long the countdown should last until the game is started. By default it is 10 seconds. Set to 0 if you wish to disable this. */
export const countdownTicks = 10 * tps;

/** Is hosting a rest api */
export const enableApi: boolean = true;

/** Rest API location (root of all other endpoints), ignored if enableApi is false */
export const apiLocation: string = "api";

/** Allows execution of custom commands */
export const enableCommands: boolean = true;

/** Is hosting a client */
export const enableClient: boolean = true;

/** Client files location, ignored if enableClient is false, path from the root dir of the project */
export const clientLocation: string = "./client";

/** Magic number used for tank xor and stat xor. */
export const magicNum = (function magicNum(build: string) {
    let char;
    for (var i = 0, seed = 1, res = 0, timer = 0; i < 40; i++) {
        char = parseInt(build[i], 16);
        res ^= ((char << ((seed & 1) << 2)) << (timer << 3));
        timer = (timer + 1) & 3;
        seed ^= +!(timer);
    };
    return res >>> 0; // unsigned
})(buildHash);

/** Spatial Hash Grid Cell Size for physics */
export const hashGridCellSize: number = 7;

/** Amount of TICKs before the next boss spawn attempt */
export const bossSpawningInterval = 45 * 60 * tps;

/** Amount of TICKs before the scoreboard update */
export const scoreboardUpdateInterval = 0.5 * tps;

/** Hashed (sha256) dev password */
export const devPasswordHash: string | undefined = process.env.DEV_PASSWORD_HASH;

/** Whether or not Verbose Logs should be logged */
export const doVerboseLogs: boolean = false;

/** Access levels of each client. */
export const enum AccessLevel {
    FullAccess   = 3,
    BetaAccess   = 2,
    kReserved    = 1,
    PublicAccess = 0,
    NoAccess     = -1
}

/** Every access level, including and above this one is unbannable via client.ban() */
export const unbannableLevelMinimum: AccessLevel = AccessLevel.FullAccess;

/** Default access level, client's without valid password's will get set to this */
export const defaultAccessLevel: AccessLevel = AccessLevel.BetaAccess;

/** Maximum level that player tanks can have. Default: 45 */
export const maxPlayerLevel = 45;
