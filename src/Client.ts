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
import { createHash } from "crypto";
import { WebSocket } from "uWebSockets.js";
import Reader from "./Coder/Reader";
import Writer from "./Coder/Writer";
import GameServer from "./Game";
import ClientCamera from "./Native/Camera";
import { ArenaState } from "./Native/Arena";
import ObjectEntity from "./Entity/Object";
import TankDefinitions, { getTankById, TankCount } from "./Const/TankDefinitions";
import DevTankDefinitions, { DevTank } from "./Const/DevTankDefinitions";
import TankBody from "./Entity/Tank/TankBody";
import Vector, { VectorAbstract } from "./Physics/Vector";
import { Entity, EntityStateFlags } from "./Native/Entity";
import { CameraFlags, ClientBound, ArenaFlags, InputFlags, NameFlags, ServerBound, Stat, StatCount, Tank, Color } from "./Const/Enums";
import { AI, AIState, Inputs } from "./Entity/AI";
import AbstractBoss from "./Entity/Boss/AbstractBoss";
import { executeCommand } from "./Const/Commands";
import { bannedClients } from ".";

/** XORed onto the tank id in the Tank Upgrade packet. */
const TANK_XOR = config.magicNum % TankCount;
/** XORed onto the stat id in the Stat Upgrade packet. */
const STAT_XOR = config.magicNum % StatCount;
/** Cached ping packet */
const PING_PACKET = new Uint8Array([ClientBound.Ping]);

/** Used to write data in Writer class form to the socket. */
class WSWriterStream extends Writer {
    private client: Client;

    public constructor(client: Client) {
        super();

        this.client = client;
    }

    public send() {
        this.client.send(this.write());
    }
}

/** Used to store flags and apply once a tick. */
export class ClientInputs extends Inputs {
    /** Used to store flags and apply once a tick. */
    public cachedFlags = 0;

    /** Just a place to store whether or not the client is possessing an AI. */
    public isPossessing = false;

    /** The Client owner */
    public client: Client;

    public constructor(client: Client) {
        super();
        this.client = client;
    }
}

export interface ClientWrapper {
    client: Client | null;
    ipAddress: string;
    gamemode: string;
}

export default class Client {
    /** Set to true if the client socket has been terminated. */
    public terminated = false;
    /** The game tick at which the client connected. */
    private connectTick: number;
    /** The last tick that the client received a ping. */
    private lastPingTick: number;
    /** The client's access level. */
    public accessLevel: config.AccessLevel = config.AccessLevel.NoAccess;

    /** Cache of all incoming packets of the current tick. */
    private incomingCache: Uint8Array[][] = [];
    /** The parsed input data from the socket. */
    public inputs: ClientInputs = new ClientInputs(this);

    /** Current game server. */
    public game: GameServer;
    /** Inner websocket connection. */
    public ws: WebSocket<ClientWrapper> | null;
    /** Client's camera entity. */
    public camera: ClientCamera | null = null;

    /** Whether or not the player has used in game dev cheats before (such as level up or godmode). */
    private devCheatsUsed: boolean = false;
    /** Wether or not the player is in godmode. */
    public isInvulnerable: boolean = false;

    /** Returns a new writer stream connected to the socket. */
    public write() {
        return new WSWriterStream(this);
    }

    public constructor(ws: WebSocket<ClientWrapper>, game: GameServer) {
        this.game = game;
        this.game.clients.add(this);
        this.ws = ws;
        this.lastPingTick = this.connectTick = game.tick;
    }

    /** Accepts the client and creates a camera for it. */
    public acceptClient() {
        this.write().u8(ClientBound.ServerInfo).stringNT(this.game.gamemode).stringNT(config.host).send();
        this.write().u8(ClientBound.PlayerCount).vu(GameServer.globalPlayerCount).send();
        this.write().u8(ClientBound.Accept).vi(this.accessLevel).send();
        this.camera = new ClientCamera(this.game, this);
    }

    /** Sends data to client. */
    public send(data: Uint8Array) {
        const ws = this.ws;
        if (!ws) throw new Error("Can't write to a closed websocket - shouldn't be referencing a closed client");
        ws.send(data, true, true);
    }

    /** Handles close event. */
    public onClose(code: number, message: ArrayBuffer) {
        this.ws = null;

        this.terminate();
    }

    /** Terminates the connection and related things. */
    public terminate() {
        // if there's still a ws connected, close it - onclose handler will then terminate for us
        if (this.terminated) return;
        if (this.ws) return this.ws.close();

        this.terminated = true;
        this.game.clients.delete(this);

        this.inputs.deleted = true;
        this.inputs.movement.magnitude = 0;

        if (Entity.exists(this.camera)) this.camera.delete();
    }

    /** Handles to incoming messages. */
    public onMessage(buffer: ArrayBuffer, isBinary: boolean) {
        if (!isBinary) return this.terminate();
        const data = new Uint8Array(buffer).slice();
        if (data[0] === 0x00 && data.byteLength === 1) return this.terminate(); // We do not host ping servers.
        const header = data[0];
        if (header === ServerBound.Ping) {
            this.lastPingTick = this.game.tick;
            this.send(PING_PACKET);
        } else {
            if(!this.incomingCache[header]) this.incomingCache[header] = [];
            if (this.incomingCache[header].length) {
                if (header === ServerBound.Input) {
                    // Otherwise store the flags
                    const r = new Reader(data);
                    r.at = 1;

                    const flags = r.vu();
                    this.inputs.cachedFlags |= flags & 0b110111100001; // WASD and gamepad are not stored.
                } else if (header === ServerBound.StatUpgrade) {
                    this.incomingCache[header].push(data);
                }
                return;
            }
            this.incomingCache[header][0] = data;
        }
    }

    /** Parses incoming packets. */
    private handleIncoming(header: number, data: Uint8Array): void {
        if (this.terminated) return;

        const r = new Reader(data);
        r.at = 1;

        const camera = this.camera;

        if (header === ServerBound.Init) {
            if (camera) return this.terminate(); // only one connection;

            const buildHash = r.stringNT();
            const pw = r.stringNT();
            // const party = r.stringNT();
            // const debugId = r.vu();

            if (buildHash !== config.buildHash) {

                util.log("Kicking client. Invalid build hash " + JSON.stringify(buildHash));
                util.saveToVLog(this.toString() + " being kicked, wrong version hash " + JSON.stringify(buildHash));

                this.write().u8(ClientBound.OutdatedClient).stringNT(config.buildHash).send();
                setTimeout(() => this.terminate(), 100);
                return;
            }

            // Hardcoded dev password
            if (config.devPasswordHash && createHash("sha256").update(pw).digest("hex") === config.devPasswordHash) {
                this.accessLevel = config.AccessLevel.FullAccess;
                util.saveToLog("Developer Connected", "A client connected to the server (`" + this.game.gamemode + "`) with `full` access.", 0x5A65EA);
            } else {
                this.accessLevel = config.defaultAccessLevel;
            }

            if (this.accessLevel === config.AccessLevel.NoAccess) {
                util.saveToVLog("Possibly unknown, client terminated due to lack of authentication:: " + this.toString());
                return this.terminate();
            }

            this.acceptClient();

            return;
        }

        if (!Entity.exists(camera)) return;

        switch (header) {
            case ServerBound.Input: {
                // Beware, this code gets less readable as you scroll
                const previousFlags = this.inputs.flags;
                const flags = this.inputs.flags = r.vu() | this.inputs.cachedFlags;
                this.inputs.cachedFlags = 0;

                const fov = camera.cameraData.values.FOV;
                const width = (1920 / fov) / 2;
                const height = (1080 / fov) / 2;

                const minX = camera.cameraData.values.cameraX - width;
                const maxX = camera.cameraData.values.cameraX + width;
                const minY = camera.cameraData.values.cameraY - height;
                const maxY = camera.cameraData.values.cameraY + height;

                const mouseX = r.vf();
                const mouseY = r.vf();

                if (!Number.isFinite(mouseX) || !Number.isFinite(mouseY)) break; // Fix NaN recoil exploit
                
                this.inputs.mouse.x = util.constrain(mouseX, minX, maxX);
                this.inputs.mouse.y = util.constrain(mouseY, minY, maxY);

                const player = camera.cameraData.values.player;
                if (!Entity.exists(player) || !(player instanceof TankBody)) return;

                // No AI
                if (this.inputs.isPossessing && this.accessLevel !== config.AccessLevel.FullAccess) return;
                
                if ((flags & InputFlags.godmode)) {
                    if (this.accessLevel >= config.AccessLevel.BetaAccess) {
                        this.setHasCheated(true);
                        player.setTank(player.currentTank < 0 ? Tank.Basic : DevTank.Developer);
                    } else if (this.game.arena.arenaData.values.flags & ArenaFlags.canUseCheats) {
                        if (this.game.clients.size === 1 && this.game.arena.isOpen()) {
                            this.setHasCheated(true);

                            player.setInvulnerability(!player.isInvulnerable);

                            this.notify(`God mode: ${player.isInvulnerable ? "ON" : "OFF"}`, 0x000000, 5000, "godmode_toggle");
                        }
                    }
                }

                if ((flags & InputFlags.rightclick) && !(previousFlags & InputFlags.rightclick) && (player.currentTank === DevTank.Developer || player.currentTank === DevTank.Spectator)) {
                    player.positionData.x = this.inputs.mouse.x;
                    player.positionData.y = this.inputs.mouse.y;
                    player.setVelocity(0, 0);
                    player.entityState |= EntityStateFlags.needsCreate | EntityStateFlags.needsDelete;
                }

                if ((flags & InputFlags.switchtank) && !(previousFlags & InputFlags.switchtank)) {
                    if (this.accessLevel >= config.AccessLevel.BetaAccess || (this.game.arena.arenaData.values.flags & ArenaFlags.canUseCheats)) {
                        this.setHasCheated(true);
                        
                        let tank = player.currentTank;
                        if (tank >= 0) {
                            tank = (tank + TankDefinitions.length - 1) % TankDefinitions.length;

                            while (!TankDefinitions[tank] || (TankDefinitions[tank]?.flags.devOnly && this.accessLevel < config.AccessLevel.FullAccess)) {
                                tank = (tank + TankDefinitions.length - 1) % TankDefinitions.length;
                            }
                        } else {
                            const isDeveloper = this.accessLevel === config.AccessLevel.FullAccess;
                            tank = ~tank;
                            
                            tank = (tank + 1) % DevTankDefinitions.length;
                            while (!DevTankDefinitions[tank] || DevTankDefinitions[tank].flags.devOnly === true && !isDeveloper) {
                                tank = (tank + 1) % DevTankDefinitions.length;
                            }
                            tank = ~tank;
                        }

                        player.setTank(tank);
                    }
                }

                if (flags & InputFlags.levelup) {
                    // If full access, or if the game allows cheating and lvl is < maxLevel, or if the player is a BT access level and lvl is < maxLevel
                    if ((this.accessLevel === config.AccessLevel.FullAccess) || (camera.cameraData.values.level < config.maxPlayerLevel && ((this.game.arena.arenaData.values.flags & ArenaFlags.canUseCheats) || (this.accessLevel === config.AccessLevel.BetaAccess)))) {
                        this.setHasCheated(true);
                        
                        camera.setLevel(camera.cameraData.values.level + 1);
                    }
                }

                if ((flags & InputFlags.suicide) && (!player.deletionAnimation)) {
                    if (this.accessLevel >= config.AccessLevel.BetaAccess || (this.game.arena.arenaData.values.flags & ArenaFlags.canUseCheats)) {
                        this.setHasCheated(true);

                        player.destroy();
                        player.onKill(player);
                        player.onDeath(player);
                    }
                }
                
                return;
            }
            case ServerBound.Spawn: {
                util.log("Client wants to spawn");
                if (this.game.arena.arenaData.values.flags & ArenaFlags.noJoining) return;
                if (Entity.exists(camera.cameraData.values.player)) return;

                const name = r.stringNT().slice(0, 16);
                this.game.clientsAwaitingSpawn.set(this, name);

                return;
            }
            case ServerBound.StatUpgrade: {
                if (camera.cameraData.statsAvailable <= 0) return;

                const player = camera.cameraData.values.player;
                if (!Entity.exists(player) || !(player instanceof TankBody)) return;

                const definition = getTankById(player.currentTank);
                if (!definition || !definition.stats.length) return;

                const statId: Stat = r.vi() ^ STAT_XOR;

                if (statId < 0 || statId >= StatCount) return;

                const statLimit = camera.cameraData.values.statLimits.values[statId];

                if (camera.cameraData.values.statLevels.values[statId] >= statLimit) return;

                camera.cameraData.statLevels[statId] += 1;
                camera.cameraData.statsAvailable -= 1;

                return;
            }
            case ServerBound.TankUpgrade: {
                const player = camera.cameraData.values.player;
                if (!Entity.exists(player) || !(player instanceof TankBody)) return;

                const definition = getTankById(player.currentTank);
                const tankId: Tank = r.vi() ^ TANK_XOR;
                const tankDefinition = getTankById(tankId);
                if (!definition || !definition.upgrades.includes(tankId) || !tankDefinition || tankDefinition.levelRequirement > camera.cameraData.values.level) return;

                player.setTank(tankId);

                return;
            }
            case ServerBound.ExtensionFound: {
                util.log("Someone is cheating");
                this.ban();

                return;
            }
            case ServerBound.ToRespawn: {
                // Doesn't matter if the player is alive or not in real diep.
                camera.cameraData.flags &= ~CameraFlags.showingDeathStats;

                return;
            }
            case ServerBound.TakeTank: {
                if (!Entity.exists(camera.cameraData.player)) return;
                if (!this.game.entities.AIs.length) return this.notify("Someone has already taken this tank", 0x000000, 5000, "cant_claim_info");
                if (!this.inputs.isPossessing) {
                    const x = camera.cameraData.player.positionData?.values.x || 0;
                    const y = camera.cameraData.player.positionData?.values.y || 0;
                    const AIs = Array.from(this.game.entities.AIs);
                    AIs.sort((a: AI, b: AI) => {
                        const {x: x1, y: y1} = a.owner.getWorldPosition();
                        const {x: x2, y: y2} = b.owner.getWorldPosition();

                        return ((x1 - x) ** 2 + (y1 - y) ** 2) - ((x2 - x) ** 2 + (y2 - y) ** 2);
                    });

                    for (let i = 0; i < AIs.length; ++i) {
                        if ((AIs[i].state !== AIState.possessed) && ((AIs[i].owner.relationsData.values.team === camera.relationsData.values.team && AIs[i].isClaimable) || this.accessLevel === config.AccessLevel.FullAccess)) {
                            if(!this.possess(AIs[i])) continue;
                            return;
                        }
                    }

                    this.notify("Someone has already taken that tank", 0x000000, 5000, "cant_claim_info");
                } else {
                    camera.cameraData.FOV = 0.35;
                    this.inputs.deleted = true;
                }

                return;
            }
            case ServerBound.TCPInit:
                if(!config.enableCommands) return;
                const cmd = r.stringNT();
                const argsLength = r.u8();
                const args: string[] = [];
                for(let i = 0; i < argsLength; ++i) {
                    args.push(r.stringNT());
                }
                executeCommand(this, cmd, args);
                return;
            default:
                util.log("Suspicious activies have been evaded")
                return this.ban();
        }
    }

    /** Defines whether the player used cheats or not. This also defines whether the name is highlighted or not. */
    public setHasCheated(value: boolean) {
        const player = this.camera?.cameraData.values.player;
        if (player && player.nameData) {
            if (value) player.nameData.flags |= NameFlags.highlightedName;
            else player.nameData.flags &= ~NameFlags.highlightedName;
        }

        this.devCheatsUsed = value;
    }

    /** Exposes devCheatsUsed */
    public hasCheated(): boolean {
        return this.devCheatsUsed;
    }

    /** Attempts possession of an AI */
    public possess(ai: AI) {
        if (!this.camera?.cameraData || ai.state === AIState.possessed) return false;

        this.inputs.deleted = true;
        ai.inputs = this.inputs = new ClientInputs(this);
        this.inputs.isPossessing = true;
        ai.state = AIState.possessed;

        // Silly workaround to change color of player when needed
        if (this.camera?.cameraData.values.player instanceof ObjectEntity) {
            const color = this.camera.cameraData.values.player.styleData.values.color;
            this.camera.cameraData.values.player.styleData.values.color = -1 as Color;
            this.camera.cameraData.values.player.styleData.color = color;
        }

        this.camera.cameraData.tankOverride = ai.owner.nameData?.values.name || "";
        
        this.camera.cameraData.tank = 53 as Tank;
        
        // AI stats, confirmed by Mounted Turret videos
        for (let i = 0; i < StatCount; ++i) this.camera.cameraData.statLevels[i as Stat] = 0;
        for (let i = 0; i < StatCount; ++i) this.camera.cameraData.statLimits[i as Stat] = 7;
        for (let i = 0; i < StatCount; ++i) this.camera.cameraData.statNames[i as Stat] = "";


        this.camera.cameraData.killedBy = "";
        this.camera.cameraData.player = ai.owner;
        this.camera.cameraData.movementSpeed = ai.movementSpeed;

        if (ai.owner instanceof TankBody) {
            // If its a TankBody, set the stats, level, and tank to that of the TankBody
            this.camera.cameraData.tank = ai.owner.cameraEntity.cameraData.values.tank;
            this.camera.setLevel(ai.owner.cameraEntity.cameraData.values.level);
            
            for (let i = 0; i < StatCount; ++i) this.camera.cameraData.statLevels[i as Stat] = ai.owner.cameraEntity.cameraData.statLevels.values[i];
            for (let i = 0; i < StatCount; ++i) this.camera.cameraData.statLimits[i as Stat] = ai.owner.cameraEntity.cameraData.statLimits.values[i];
            for (let i = 0; i < StatCount; ++i) this.camera.cameraData.statNames[i as Stat] = ai.owner.cameraEntity.cameraData.statNames.values[i];

            this.camera.cameraData.FOV = ai.owner.cameraEntity.cameraData.FOV;
        } else if (ai.owner instanceof AbstractBoss) {
            this.camera.setLevel(75);
            this.camera.cameraData.FOV = 0.35;
        } else {
            this.camera.setLevel(30);
        }
        
        this.camera.cameraData.statsAvailable = 0;
        this.camera.cameraData.score = 0;
        this.camera.entityState = EntityStateFlags.needsCreate | EntityStateFlags.needsDelete;
        this.notify("Press H to surrender control of the tank", 0x000000, 15000);
        return true;
    }

    /** Sends a notification packet to the client. */
    public notify(text: string, color = 0x000000, time = 5000, id = "") {
        const ws = this.ws;
        if(!ws) return; // Prevent server crash due to disconnected players    
        this.write().u8(ClientBound.Notification).stringNT(text).u32(color).float(time).stringNT(id).send();
    }

    /** Bans the ip from all servers until restart. */
    public ban() {
        const ws = this.ws;
        if(!ws) return;

        util.saveToLog("IP Banned", "Banned " + ws.getUserData().ipAddress + this.toString(true), 0xEE326A);
        if (this.accessLevel >= config.unbannableLevelMinimum) {
            util.saveToLog("IP Ban Cancelled", "Cancelled ban on " + ws.getUserData().ipAddress + this.toString(true), 0x6A32EE);
            return;
        }

        bannedClients.add(ws.getUserData().ipAddress)

        for (const client of this.game.clients) {
            if(client.ws?.getUserData().ipAddress === ws.getUserData().ipAddress) client.terminate();
        }
    }
    
    public createAndSpawnPlayer(name: string) {
        const camera = this.camera;
        if (!Entity.exists(camera)) return;

        camera.cameraData.values.statsAvailable = 0;
        camera.cameraData.values.level = 1;

        for (let i = 0; i < StatCount; ++i) {
            camera.cameraData.values.statLevels.values[i] = 0;
        }

        const tank = camera.cameraData.player = camera.relationsData.owner = camera.relationsData.parent = new TankBody(this.game, camera, this.inputs);
        tank.setTank(Tank.Basic);
        this.game.arena.spawnPlayer(tank, this);
        camera.setLevel(camera.cameraData.values.respawnLevel);
        tank.nameData.values.name = name;

        if (this.hasCheated()) this.setHasCheated(true);

        // Force-send a creation to the client - Only if it is not new
        camera.entityState = EntityStateFlags.needsCreate | EntityStateFlags.needsDelete;
        camera.spectatee = null;
        this.inputs.isPossessing = false;
        this.inputs.movement.magnitude = 0;
  
        if (camera.cameraData.values.flags & CameraFlags.gameWaitingStart) camera.cameraData.values.flags &= ~CameraFlags.gameWaitingStart;
    }

    public tick(tick: number) {
        // Handle client inputs.
        const movement: VectorAbstract = { x: 0, y: 0 };

        if (this.inputs.flags & InputFlags.up) movement.y -= 1;
        if (this.inputs.flags & InputFlags.down) movement.y += 1;
        if (this.inputs.flags & InputFlags.right) movement.x += 1;
        if (this.inputs.flags & InputFlags.left) movement.x -= 1;
        if (movement.x || movement.y) {
            const angle = Math.atan2(movement.y, movement.x);

            const magnitude = util.constrain(Math.sqrt(movement.x ** 2 + movement.y ** 2), -1, 1);

            this.inputs.movement.magnitude = magnitude;
            this.inputs.movement.angle = angle;
        }

        for (let header = 0; header <= this.incomingCache.length; ++header) {
            if (header === ServerBound.Ping) continue;

            if (this.incomingCache[header]?.length === 1) this.handleIncoming(header, this.incomingCache[header][0]);
            else if (this.incomingCache[header]?.length > 1) {
                for (let i = 0, len = this.incomingCache[header].length; i < len; ++i) this.handleIncoming(header, this.incomingCache[header][i]);
            } else continue;
            this.incomingCache[header] = [];
        }
        if (!this.camera) {
            if (tick === this.connectTick + 300) {
                return this.terminate();
            }
        } else if (this.inputs.deleted) {
            this.inputs = new ClientInputs(this);
            this.camera.cameraData.player = null;
            this.camera.cameraData.respawnLevel = 0;
            this.camera.cameraData.cameraX = this.camera.cameraData.cameraY = 0;
            this.camera.cameraData.flags &= ~CameraFlags.showingDeathStats;
        }
        if (tick >= this.lastPingTick + 60 * config.tps) {
            return this.terminate();
        }
    }
    /** toString override from base Object. Adds debug info */
    public toString(verbose: boolean = false): string {
        const tokens: string[] = [];

        if (this.camera?.cameraData?.player?.nameData?.name) tokens.push("name=" + JSON.stringify(this.camera?.cameraData?.player?.nameData?.name));
        if (verbose) {
            if (this.ws) tokens.push("ip=" + this.ws.getUserData().ipAddress);
            if (this.game.gamemode) tokens.push("game.gamemode=" + this.game.gamemode);
        }
        if (this.terminated) tokens.push("(terminated)");
        if (!tokens.length) return `Client(${this.accessLevel}) {}`

        return `Client(${this.accessLevel}) { ${tokens.join(', ')} }`
    }
}
