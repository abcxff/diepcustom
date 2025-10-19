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

export interface VectorAbstract {
    x: number;
    y: number;
};

export default class Vector implements VectorAbstract {
    public x: number;
    public y: number;

    public constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }

    /** Returns true if the `Vector` only contains real numbers in the `x` and `y` property. */
    public static isFinite(vector: Vector | VectorAbstract) {
        return Number.isFinite(vector.x) && Number.isFinite(vector.y);
    }

    /** Converts coordinates from the polar coordinate system to the cartesian coordinate system */
    public static fromPolar(theta: number, distance: number) {
        // TODO(speed):
        // This might be overused
        return new Vector(
            distance * Math.cos(theta),
            distance * Math.sin(theta)
        );
    }

    /** Replaces this vector's properties with another vector */
    public set(vector: VectorAbstract) {
        this.x = vector.x;
        this.y = vector.y;
    }

    public add(vector: VectorAbstract) {
        this.x += vector.x,
        this.y += vector.y;
    }

    public subtract(vector: VectorAbstract) {
        this.x -= vector.x;
        this.y -= vector.y;
    }

    public distanceToSQ(vector: VectorAbstract) {
        return (vector.x - this.x) ** 2 + (vector.y - this.y) ** 2;
    } 

    public set angle(angle: number) {
        const currentMag = this.magnitude;

        this.set({
            x: Math.cos(angle) * currentMag, 
            y: Math.sin(angle) * currentMag
        });
    }

    public set magnitude(magnitude: number) {
        const currentDir = this.angle;

        this.set({
            x: Math.cos(currentDir) * magnitude,
            y: Math.sin(currentDir) * magnitude
        });
    }

    public get magnitude() {
       return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2));
    }

    public get angle() {
        // TODO(speed):
        // This also might be overused
        return Math.atan2(this.y, this.x);
    }
}
