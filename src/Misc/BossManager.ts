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

import ArenaEntity from "../Native/Arena";

import AbstractBoss from "../Entity/Boss/AbstractBoss";
import Guardian from "../Entity/Boss/Guardian";
import Summoner from "../Entity/Boss/Summoner";
import FallenOverlord from "../Entity/Boss/FallenOverlord";
import FallenBooster from "../Entity/Boss/FallenBooster";
import Defender from "../Entity/Boss/Defender";

import { bossSpawningInterval } from "../config";
import { VectorAbstract } from "../Physics/Vector";
import { randomFrom } from "../util";

/**
 * Manages boss spawning.
 */
export default class BossManager {
    /** The arena to spawn bosses in. */
    public arena: ArenaEntity;
    /** The current boss spawned into the game */
    public boss: AbstractBoss | null = null;
    /** A random boss will be selected out of these. */
    public bossClasses: typeof AbstractBoss[] = [Guardian, Summoner, FallenOverlord, FallenBooster, Defender];

    public constructor(arena: ArenaEntity) {
        this.arena = arena;
    }

    public findBossSpawnLocation(): VectorAbstract {
        // Bossess spawn around the center of the arena
        const width = this.arena.width / 2;
        const height = this.arena.height / 2;

        const pos = this.arena.findSpawnLocation(width, height);
        return pos;
    }
    
    public spawnBoss() {
        const TBoss = randomFrom(this.bossClasses);
        this.boss = new TBoss(this.arena.game);
        
        const { x, y } = this.findBossSpawnLocation();
        
        this.boss.positionData.values.x = x;
        this.boss.positionData.values.y = y;

        const deleteMixin = this.boss.delete.bind(this.boss); 
        this.boss.delete = () => {
            deleteMixin();
            // Reset arena boss
            this.boss = null;
        }
    }

    public tick(tick: number) { 
        if (tick >= 1 && (tick % bossSpawningInterval) === 0 && !this.boss) {
            this.spawnBoss();
        }
    }
}

