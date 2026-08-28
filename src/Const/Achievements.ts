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
import { ClientBound } from "./Enums";

/** The event types achievements can have */
export type eventId = "kill" | "score" | "levelUp" | "statUpgraded" | "classChange" | "latency";

/** The types of achievements */
export type achievementType = "counter";

/**
 * Format that the game stores bullet definitions in its memory.
 */
export interface AchievementDefinition {
    /** Achievement name */
    name: string;
    /** Achievement description */
    desc: string;
    /** Conditions needed to unlock */
    conds: AchievementCondition[];
}

export interface AchievementTags {
    "value"?: string | number;
    "total"?: string | number;
    /** Value change */
    "delta"?: string | number;
    /** Tank ID */
    "class"?: number;
    /** Tank level */
    "level"?: number;
    /** Stat ID */
    "id"?: number;
    /** Is max stat level */
    "isMaxLevel"?: boolean;
    "weapon.isTank"?: boolean;
    "victim.isTank"?: boolean;
    "victim.isBoss"?: boolean;
    "victim.isShiny"?: boolean;
    "victim.arenaMobID"?: string | null;
}

export interface AchievementCondition {
    event?: eventId;
    type?: achievementType;
    tags: AchievementTags;
    threshold?: number;
}

const Achievements = _Achievements as AchievementDefinition[];
export default Achievements;

// From https://github.com/jtpio/murmurhash2
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
    const nameSeed = 170;
    const descSeed = 221;

    return `${MurMurHash2(a.name, nameSeed).toString(16)}${MurMurHash2(a.desc, descSeed).toString(16)}_1`;
}

export const achievementHashMap = Achievements.reduce((map, a) => {
    map.set(a, createAchievementHash(a));
    return map;
}, new Map());

export const sendAchievementEvent = (client: Client, event: eventId, data: AchievementTags) => {
    console.time();
    const completed = [];

    for (const a of Achievements) {
        if (a.conds.every(c => c.event !== event)) continue;

        if (checkCondition(a, data)) {
            completed.push(achievementHashMap.get(a));
        }
    }
    
    if (completed.length) {
        sendAchievements(client, completed);
    }
    console.timeEnd();
}

export const checkCondition = (achievement: AchievementDefinition, data: AchievementTags) => {
    const conds = achievement.conds;

    return conds.every(condition => parseTags(condition.tags ?? {}, data));
}

export const parseTags = (tags: AchievementTags, data: AchievementTags): boolean => {
    return Object.entries(tags).every(([key, value]) => {
        if (key === "total" || key === "value" || key === "delta") {
            const op = value.charCodeAt(0);
            const v = value.slice(2);
            const dataValue = data[key as keyof AchievementTags]!;

            switch (op) {
                case 61: // ==
                    return dataValue == v;
                case 62: // >=
                    return dataValue >= v;
                case 60: // <=
                    return dataValue <= v;
                default:
                    throw new Error(`Invalid operation: ${op}`);
            }
        }

        return data[key as keyof AchievementTags] === value;
    });
}

export const sendAchievements = (client: Client, hashes: string[]) => {
    if (client.terminated) return;

    const w = client.write();

    w.u8(ClientBound.Achievement);
    w.u8(hashes.length);

    for (let i = 0; i < hashes.length; ++i) {
        w.stringNT(hashes[i]);
    }
    
    w.send();
}

export const getAchievementByName = (name: string): AchievementDefinition | null => {
    return Achievements.find(a => a.name === name) || null;
}