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

import chalk from "chalk";
import { inspect } from "util";
import { doVerboseLogs } from "./config";

/** Logs data prefixed with the Date. */
export const log = (...args: any[]) => {
    console.log(`[${Date().split(" ")[4]}]`, ...args)
}
/** Logs data prefixed with the Date in a yellow format. */
export const warn = (...args: any[]) => {
    args = args.map(s => typeof s === "string" ? chalk.yellow(s) : s);
    console.log(chalk.yellow(`[${Date().split(" ")[4]}] WARNING: `), ...args);
}
/** Logs a raw object. */
export const inspectLog = (object: any, c = 14) => {
    console.log(inspect(object, false, c, true));
}

/**
 * Removes an element from an array by index quickly.
 * Unordered removal.
 */
export const removeFast = (array: any[], index: number) => {
    if (index < 0 || index >= array.length) throw new RangeError("Index out of range. In `removeFast`")

    if (index === array.length - 1) array.pop();
    else array[index] = array.pop();
}

/**
 * Self explanatory
 */
export const shuffleArray = (array: any[]) => {
    for (let i = array.length - 1; i >= 1; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Contrains a value between bounds
 */
export const constrain = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
}

/** 2π */
export const PI2 = Math.PI * 2;

/**
 * Normalize angle (ex: 4π-> 0π, 3π -> 1π)
 */
export const normalizeAngle = (angle: number) => {
    return ((angle % PI2) + PI2) % PI2;
}

/**
 * Logs - Used to have a webhook log here
 */
export const saveToLog = (title: string, description: string, color: number) => {
    const hex = chalk.hex("#" + color.toString(16).padStart(6, "0"))
    console.log(hex("[!] " + title + "\n :: " + description));
}

/**
 * Verbose log (if config.doVerboseLogs is set, it will log)
 *  - Used to have a webhook log here
 */
export const saveToVLog = (text: string) => {
   if (doVerboseLogs) console.log("[v] " + text);
}
