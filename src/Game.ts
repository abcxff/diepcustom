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

import * as config from "./config";
import * as util from "./util";
import Writer from "./Coder/Writer";
import EntityManager from "./Native/Manager";
import Client from "./Client";
import ArenaEntity from "./Native/Arena";
import FFAArena from "./Gamemodes/FFA";
import Teams2Arena from "./Gamemodes/Team2";
import SandboxArena from "./Gamemodes/Sandbox";
import { ClientBound } from "./Const/Enums";
import Teams4Arena from "./Gamemodes/Team4";
import DominationArena from "./Gamemodes/Domination";
import MothershipArena from "./Gamemodes/Mothership";
import TestingArena from "./Gamemodes/Misc/Testing";
import SpikeboxArena from "./Gamemodes/Misc/Spikebox";
import DominationTestingArena from "./Gamemodes/Misc/DomTest";
import JungleArena from "./Gamemodes/Misc/Jungle";
import FactoryTestArena from "./Gamemodes/Misc/FactoryTest";
import BallArena from "./Gamemodes/Misc/Ball";
import MazeArena from "./Gamemodes/Maze";
import TagArena from "./Gamemodes/Tag";
import SurvivalArena from "./Gamemodes/Survival";

/**
 * WriterStream that broadcasts to all of the game's WebSockets.
 */
class WSSWriterStream extends Writer {
    private game: GameServer;

    public constructor(game: GameServer) {
        super();
        this.game = game;
    }

    public send() {
        const bytes = this.write();

        for (let client of this.game.clients) {
            client.send(bytes);
        }
    }
}


/** @deprecated */
type DiepGamemodeID = "ffa" | "sandbox" | "teams" | "4teams" | "mot" | "dom" | "maze" | "tag" | "survival";
const GamemodeToArenaClass: Record<DiepGamemodeID, (typeof ArenaEntity) | null> = {
    "ffa": FFAArena,
    "teams": Teams2Arena,
    "4teams": Teams4Arena,
    "sandbox": SandboxArena,
    "dom": DominationArena,
    "survival": SurvivalArena,
    "tag": TagArena,
    "mot": MothershipArena,
    "maze": MazeArena
}

/**
 * Used for determining which endpoints go to the default.
 */
export default class GameServer {
    /** Stores total player count. */
    public static globalPlayerCount = 0;
    /** Whether or not the game server is running. */
    public running = true;
    /** The gamemode the game is running. */
    public gamemode: string;
    /** The arena's display name. */
    public name: string;
    /** Whether or not to put players on the map. */
    public playersOnMap: boolean = false;
    /** All clients connected. */
    public clients: Set<Client>;
    /** All clients and usernames waiting to spawn while a countdown is active. */
    public clientsAwaitingSpawn: Map<Client, string> = new Map();
    /** Entity manager of the game. */
    public entities: EntityManager;
    /** The current game tick. */
    public tick: number;
    /** The game's arena entity. */
    public arena: ArenaEntity;
    /** The interval timer of the tick loop. */
    private _tickInterval: NodeJS.Timeout;
    /** The Arena instantiator */
    private _arenaClass: typeof ArenaEntity;

    public constructor(ArenaClass: DiepGamemodeID | typeof ArenaEntity, name: string) {
        if (typeof ArenaClass === "string") {
            this.gamemode = ArenaClass;
            ArenaClass = GamemodeToArenaClass[ArenaClass] ?? SandboxArena;
        } else if (!ArenaClass.GAMEMODE_ID) {
            const defaultArenaId = ArenaClass.name.toLowerCase().replace("arena", "");
            util.warn(`Missing gamemode ID for arena class, defaulting to '${defaultArenaId}'`);
            this.gamemode = defaultArenaId;
        } else {
            this.gamemode = ArenaClass.GAMEMODE_ID;
        }

        this.name = name;

        this.clients = new Set();
        // Keeps player count updating per addition
        const _add = this.clients.add;
        this.clients.add = (client: Client) => {
            GameServer.globalPlayerCount += 1;
            this.broadcastPlayerCount();
            
            return _add.call(this.clients, client);
        }
        const _delete = this.clients.delete;
        this.clients.delete = (client: Client) => {
            let success = _delete.call(this.clients, client);
            if (success) {
                GameServer.globalPlayerCount -= 1;
                this.broadcastPlayerCount();
                this.clientsAwaitingSpawn.delete(client);
            }

            return success;
        }
        const _clear = this.clients.clear;
        this.clients.clear = () => {
            GameServer.globalPlayerCount -= this.clients.size;
            this.broadcastPlayerCount();
            this.clientsAwaitingSpawn.clear();

            return _clear.call(this.clients);
        }

        this.entities = new EntityManager(this);
        this.tick = 0;

        this._arenaClass = ArenaClass;
        this.arena = new ArenaClass(this);

        this._tickInterval = setInterval(() => {
            if (this.clients.size) this.tickLoop();
        }, config.mspt);
    }

    /** Returns a WebSocketServer Writer Broadcast Stream. */
    public broadcast() {
        return new WSSWriterStream(this);
    }
    /** Broadcasts a player count packet. */
    public broadcastPlayerCount() {
        this.broadcast().vu(ClientBound.PlayerCount).vu(GameServer.globalPlayerCount).send();
    }

    /** Ends the game instance. */
    public end() {
        util.saveToLog("Game Instance Ending", "Game running " + this.gamemode + " at `" + this.gamemode + "` is now closing.", 0xEE4132);
        util.log("Ending Game instance");

        clearInterval(this._tickInterval);

        /*
        for (const client of this.clients) {
            client.terminate()
        }
        */

        this.tick = 0;
        //this.clients.clear();
        this.entities.clear();

        this.running = false;
        this.onEnd();
    }

    /** Can be overwritten to call things when the game is over */
    public onEnd() {
        util.log("Game instance is now over");
        this.start();
    }

    /** Reinitializes a game instance */
    public start() {
        if (this.running) return;

        util.log("New game instance booting up")

        //this.clients.clear();

        this.entities = new EntityManager(this);
        this.tick = 0;

        const ArenaClass = this._arenaClass;
        this.arena = new ArenaClass(this);

        for (const client of this.clients) {
            client.acceptClient();
        }

        this._tickInterval = setInterval(() => {
            if (this.clients.size) this.tickLoop();
        }, config.mspt);
    }

    /** Ticks the game. */
    private tickLoop() {
        this.tick += 1;

        this.entities.collisionManager.preTick(this.tick);

        // process inputs before ticking entities for lower input latency
        for (const client of this.clients) client.tick(this.tick);

        this.entities.tick(this.tick);

        this.entities.collisionManager.postTick(this.tick);
    }
}
