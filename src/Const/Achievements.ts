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

import _Achievements from "./Achievements.json";
import Client from "../Client";
import Writer from "../Coder/Writer";
import { ClientBound, Tank } from "./Enums";
import { DevTank } from "./DevTankDefinitions";
import { enableAchievements } from "../config";

const NAME_SEED = 170;
const DESC_SEED = 221;

const OP_EQUALS = 0;
const OP_GTE = 1;
const OP_LTE = 2;

/** The event types achievements can have */
export type eventId = "kill" | "score" | "levelUp" | "statUpgraded" | "classChange" | "latency";

/** The types of achievements */
export type achievementType = "counter";

/**
 * Format that the game stores achievements in its memory.
 */
export interface AchievementDefinition {
    /** Achievement name */
    name: string;
    /** Achievement description */
    desc: string;
    /** Conditions needed to unlock */
    conds: AchievementCondition[];
    /** Achievement hash which is sent to clients */
    hash: string;
}

export interface AchievementTags {
    /** Current value */
    "value"?: string | number;
    /** Total value */
    "total"?: string | number;
    /** Value change */
    "delta"?: string | number;
    /** Tank ID */
    "class"?: Tank | DevTank;
    /** Tank level */
    "level"?: number;
    /** Stat ID */
    "id"?: number;
    /** Is max stat level */
    "isMaxLevel"?: boolean;
    /** Used for ramming case */
    "weapon.isTank"?: boolean;
    /** Was the victim a tank? */
    "victim.isTank"?: boolean;
    /** Was the victim a boss? */
    "victim.isBoss"?: boolean;
    /** Was the victim a shiny shape? */
    "victim.isShiny"?: boolean;
    /** Victim tank ID */
    "victim.class"?: Tank | DevTank;
    /** Victim mob ID */
    "victim.arenaMobID"?: string | null;
}

export interface AchievementCondition {
    event?: eventId;
    type?: achievementType;
    tags: AchievementTags;
    threshold?: number;
    /** Created during parsing */
    op?: number | null;
}

/** From https://github.com/jtpio/murmurhash2 */
export const MurMurHash2 = (str: string, seed: number): number => {
    const m = 0x5bd1e995;
    const encoder = new TextEncoder();

    const data = encoder.encode(str);
    let len = data.length;
    let h = seed ^ len;
    let i = 0;

    while (len >= 4) {
        let k =
            (data[i] & 0xff) |
            ((data[++i] & 0xff) << 8) |
            ((data[++i] & 0xff) << 16) |
            ((data[++i] & 0xff) << 24);

        k = (k & 0xffff) * m + ((((k >>> 16) * m) & 0xffff) << 16);
        k ^= k >>> 24;
        k = (k & 0xffff) * m + ((((k >>> 16) * m) & 0xffff) << 16);

        h = ((h & 0xffff) * m + ((((h >>> 16) * m) & 0xffff) << 16)) ^ k;

        len -= 4;
        ++i;
    }

    switch (len) {
        case 3:
            h ^= (data[i + 2] & 0xff) << 16;
        case 2:
            h ^= (data[i + 1] & 0xff) << 8;
        case 1:
            h ^= data[i] & 0xff;
            h = (h & 0xffff) * m + ((((h >>> 16) * m) & 0xffff) << 16);
    }

    h ^= h >>> 13;
    h = (h & 0xffff) * m + ((((h >>> 16) * m) & 0xffff) << 16);
    h ^= h >>> 15;

    return h >>> 0;
}

export const createAchievementHash = (a: AchievementDefinition) => {
    return `${MurMurHash2(a.name, NAME_SEED).toString(16)}${MurMurHash2(a.desc, DESC_SEED).toString(16)}_1`;
}

export const compileConds = (conds: AchievementCondition[]) => {
    for (const c of conds) {
        const tags = c.tags;

        for (const key in tags) {
            const value = tags[key as keyof AchievementTags] as string;

            if (key === "total" || key === "value" || key === "delta") {
                tags[key] = parseInt(value.slice(2));
                const op = value.slice(0, 2);

                switch (op) {
                    case "==":
                        c.op = OP_EQUALS;
                        break;
                    case ">=":
                        c.op = OP_GTE;
                        break;
                    case "<=":
                        c.op = OP_LTE;
                        break;
                    default: throw new Error(`Invalid operation: ${op}`);
                }
            }
        }
    }

    return conds;
}

export const compileAchievement = (a: AchievementDefinition) => {
    return {
        ...a,
        hash: createAchievementHash(a),
        conds: compileConds(a.conds)
    }
}

const Achievements = _Achievements.map(a => compileAchievement(a as AchievementDefinition));
export default Achievements;

export const achievementEventMap = Achievements.reduce((map, a) => {
    for (const c of a.conds) {
        const byEvent = map.get(c.event);
        
        if (!byEvent) {
            map.set(c.event, [a]);
            continue;
        }
        
        byEvent.push(a);
    }

    return map;
}, new Map());

export const sendAchievementEvent = (client: Client, event: eventId, data: AchievementTags) => {
    if (!enableAchievements) return;

    const completed = [];

    const achievements = achievementEventMap.get(event);

    for (const a of achievements) {
        if (checkCondition(a, data)) {
            completed.push(a.hash);
        }
    }
    
    if (completed.length) {
        client.giveAchievements(completed);
    }
}

const checkCondition = (achievement: AchievementDefinition, data: AchievementTags) => {
    const conds = achievement.conds;

    return conds.every(condition => parseCondition(condition, data));
}

const parseCondition = (conds: AchievementCondition | null, data: AchievementTags): boolean => {
    if (!conds) return true;

    const tags = conds.tags
    for (const key in tags) {
        const value = tags[key as keyof AchievementTags]!;
        const givenValue = data[key as keyof AchievementTags]!;

        if (givenValue === undefined || givenValue === null) { // Just in case
            return false;
        }

        if (key === "total" || key === "value" || key === "delta") {
            const op = conds.op;

            switch (op) {
                case OP_EQUALS: // ==
                    if (givenValue !== value) return false;
                    break;
                case OP_GTE: // >=
                    if (givenValue < value) return false;
                    break;
                case OP_LTE: // <=
                    if (givenValue > value) return false;
                    break;
            }
        } else {
            if (givenValue !== value) {
                return false;
            }
        }
    }

    return true;
}

export const sendAchievements = (client: Client, hashes: string[]) => {
    if (client.terminated) return;

    const w = client.write();

    w.u8(ClientBound.Achievement);
    w.vu(hashes.length);

    for (let i = 0; i < hashes.length; ++i) {
        w.stringNT(hashes[i]);
    }
    
    w.send();
}

export const getAchievementByName = (name: string): AchievementDefinition | null => {
    return Achievements.find(a => a.name === name) || null;
}
