import Client from "../Client"
import { AccessLevel, maxPlayerLevel } from "../config";
import AbstractBoss from "../Entity/Boss/AbstractBoss";
import Defender from "../Entity/Boss/Defender";
import FallenBooster from "../Entity/Boss/FallenBooster";
import FallenOverlord from "../Entity/Boss/FallenOverlord";
import Guardian from "../Entity/Boss/Guardian";
import Summoner from "../Entity/Boss/Summoner";
import LivingEntity from "../Entity/Live";
import ArenaCloser from "../Entity/Misc/ArenaCloser";
import FallenAC from "../Entity/Misc/Boss/FallenAC";
import Mothership from "../Entity/Misc/Mothership";
import FallenSpike from "../Entity/Misc/Boss/FallenSpike";
import FallenMegaTrapper from "../Entity/Misc/Boss/FallenMegaTrapper";
import Dominator from "../Entity/Misc/Dominator";
import ObjectEntity from "../Entity/Object";
import AbstractShape from "../Entity/Shape/AbstractShape";
import Crasher from "../Entity/Shape/Crasher";
import Pentagon from "../Entity/Shape/Pentagon";
import Square from "../Entity/Shape/Square";
import Triangle from "../Entity/Shape/Triangle";
import AutoTurret from "../Entity/Tank/AutoTurret";
import Bullet from "../Entity/Tank/Projectile/Bullet";
import TankBody from "../Entity/Tank/TankBody";
import { AIState } from "../Entity/AI";
import { Entity, EntityStateFlags } from "../Native/Entity";
import { saveToVLog } from "../util";
import { ClientBound, Stat, StatCount, PhysicsFlags, StyleFlags, Tank } from "./Enums";
import { getTankByName } from "./TankDefinitions";

const RELATIVE_POS_REGEX = new RegExp(/~(-?\d+)?/);

export const enum CommandID {
    gameSetTank = "game_set_tank",
    gameSetLevel = "game_set_level",
    gameSetScore = "game_set_score",
    gameSetStat = "game_set_stat",
    gameSetStatMax = "game_set_stat_max",
    gameAddUpgradePoints = "game_add_upgrade_points",
    gameTeleport = "game_teleport",
    gameClaim = "game_claim",
    gameGodmode = "game_godmode",
    gameAnnounce = "game_announce",
    gameGoldenName = "game_golden_name",
    adminSummon = "admin_summon",
    adminKillAll = "admin_kill_all",
    adminKillEntity = "admin_kill_entity",
    adminCloseArena = "admin_close_arena"
}

export interface CommandDefinition {
    id: CommandID,
    usage?: string,
    description?: string,
    permissionLevel: AccessLevel,
    isCheat: boolean
}

export interface CommandCallback {
    (client: Client, ...args: string[]): string | void 
}

export const commandDefinitions = {
    game_set_tank: {
        id: CommandID.gameSetTank,
        usage: "[tank]",
        description: "Changes your tank to the given class",
        permissionLevel: AccessLevel.BetaAccess,
        isCheat: true
    },
    game_set_level: {
        id: CommandID.gameSetLevel,
        usage: "[level]",
        description: "Changes your level to the given integer",
        permissionLevel: AccessLevel.BetaAccess,
        isCheat: true
    },
    game_set_score: {
        id: CommandID.gameSetScore,
        usage: "[score]",
        description: "Changes your score to the given integer",
        permissionLevel: AccessLevel.BetaAccess,
        isCheat: true
    },
    game_set_stat: {
        id: CommandID.gameSetStat,
        usage: "[stat num] [points]",
        description: "Set the value of the given attribute. Values can be greater than the maximum capacity. [stat num] is equivalent to the number that appears in the UI",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: true
    },
    game_set_stat_max: {
        id: CommandID.gameSetStatMax,
        usage: "[stat num] [max]",
        description: "Sets the max value of the given attribute. [stat num] is equivalent to the number that appears in the UI",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: true
    },
    game_add_upgrade_points: {
        id: CommandID.gameAddUpgradePoints,
        usage: "[points]",
        description: "Adds upgrade points",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: true
    },
    game_teleport: {
        id: CommandID.gameTeleport,
        usage: "[x] [y]",
        description: "Teleports you to the given position",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: true
    },
    game_claim: {
        id: CommandID.gameClaim,
        usage: "[entityName]",
        description: "Attempts claiming an entity of the given type",
        permissionLevel: AccessLevel.BetaAccess,
        isCheat: false
    },
    game_godmode: {
        id: CommandID.gameGodmode,
        usage: "[?value]",
        description: "Toggles godmode.",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: true
    },
    game_announce: {
        id: CommandID.gameAnnounce,
        usage: "[message] [?color] [?time] [?id]",
        description: "Announce a message to the current game server. Example usage: 'Hello World' 0xFF0000 3000 msgId",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: false
    },
    game_golden_name: {
        id: CommandID.gameGoldenName,
        description: "Toggles the golden nickname color that appears upon using cheats",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: false
    },
    admin_summon: {
        id: CommandID.adminSummon,
        usage: "[entityName] [?count] [?x] [?y]",
        description: "Spawns entities at the given coordinates",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: false
    },
    admin_kill_all: {
        id: CommandID.adminKillAll,
        description: "Kills all living entities in the arena",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: false
    },
    admin_kill_entity: {
        id: CommandID.adminKillEntity,
        usage: "[entityName]",
        description: "Kills all entities of the given type (might include self)",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: false
    },
    admin_close_arena: {
        id: CommandID.adminCloseArena,
        description: "Closes the current arena",
        permissionLevel: AccessLevel.FullAccess,
        isCheat: false
    }
} as Record<CommandID, CommandDefinition>

export const commandCallbacks = {
    game_set_tank: (client: Client, tankNameArg: string) => {
        const tankDef = getTankByName(tankNameArg);
        const player = client.camera?.cameraData.player;
        if (!tankDef || !Entity.exists(player) || !(player instanceof TankBody)) return;
        if (tankDef.flags.devOnly && client.accessLevel !== AccessLevel.FullAccess) return;
        player.setTank(tankDef.id);
    },
    game_set_level: (client: Client, levelArg: string) => {
        const level = parseInt(levelArg);
        const player = client.camera?.cameraData.player;
        if (isNaN(level) || !Entity.exists(player) || !(player instanceof TankBody)) return;
        const finalLevel = client.accessLevel == AccessLevel.FullAccess ? level : Math.min(maxPlayerLevel, level);
        client.camera?.setLevel(finalLevel);
    },
    game_set_score: (client: Client, scoreArg: string) => {
        const score = parseInt(scoreArg);
        const camera = client.camera?.cameraData;
        const player = client.camera?.cameraData.player;
        if (isNaN(score) || score > Number.MAX_SAFE_INTEGER || score < Number.MIN_SAFE_INTEGER || !Entity.exists(player) || !(player instanceof TankBody) || !camera) return;
        camera.score = score;
    },
    game_set_stat_max: (client: Client, statIdArg: string, statMaxArg: string) => {
        const statId = StatCount - parseInt(statIdArg);
        const statMax = parseInt(statMaxArg);
        const camera = client.camera?.cameraData;
        const player = client.camera?.cameraData.player;
        if (statId < 0 || statId >= StatCount || isNaN(statId) || isNaN(statMax) || !Entity.exists(player) || !(player instanceof TankBody) || !camera) return;
        const clampedStatMax = Math.max(statMax, 0);
        camera.statLimits[statId as Stat] = clampedStatMax;
        camera.statLevels[statId as Stat] = Math.min(camera.statLevels[statId as Stat], clampedStatMax);
    },
    game_set_stat: (client: Client, statIdArg: string, statPointsArg: string) => {
        const statId = StatCount - parseInt(statIdArg);
        const statPoints = parseInt(statPointsArg);
        const camera = client.camera?.cameraData;
        const player = client.camera?.cameraData.player;
        if (statId < 0 || statId >= StatCount || isNaN(statId) || isNaN(statPoints) || !Entity.exists(player) || !(player instanceof TankBody) || !camera) return;
        camera.statLevels[statId as Stat] = statPoints;
    },
    game_add_upgrade_points: (client: Client, pointsArg: string) => {
        const points = parseInt(pointsArg);
        const camera = client.camera?.cameraData;
        const player = client.camera?.cameraData.player;
        if (isNaN(points) || points > Number.MAX_SAFE_INTEGER || points < Number.MIN_SAFE_INTEGER || !Entity.exists(player) || !(player instanceof TankBody) || !camera) return;
        camera.statsAvailable += points;
    },
    game_teleport: (client: Client, xArg: string, yArg: string) => {
        const player = client.camera?.cameraData.player;
        if (!Entity.exists(player) || !(player instanceof ObjectEntity)) return;
        const x = xArg.match(RELATIVE_POS_REGEX) ? player.positionData.x + parseInt(xArg.slice(1) || "0", 10) : parseInt(xArg, 10);
        const y = yArg.match(RELATIVE_POS_REGEX) ? player.positionData.y + parseInt(yArg.slice(1) || "0", 10) : parseInt(yArg, 10);
        if (isNaN(x) || isNaN(y)) return;
        player.positionData.x = x;
        player.positionData.y = y;
        player.setVelocity(0, 0);
        player.entityState |= EntityStateFlags.needsCreate | EntityStateFlags.needsDelete;
    },
    game_claim: (client: Client, entityArg: string) => {
        const TEntity = new Map([
          ["ArenaCloser", ArenaCloser],
          ["Dominator", Dominator],
          ["Mothership", Mothership],
          ["Shape", AbstractShape],
          ["Boss", AbstractBoss],
          ["AutoTurret", AutoTurret]
        ] as [string, typeof ObjectEntity][]).get(entityArg)

        if (!TEntity || !client.camera?.game.entities.AIs.length) return;

        const AIs = Array.from(client.camera.game.entities.AIs);
        for (let i = 0; i < AIs.length; ++i) {
            if (!(AIs[i].owner instanceof TEntity) || AIs[i].state === AIState.possessed) continue;
            client.possess(AIs[i]);
            return;
        }
    },
    game_godmode: (client: Client, activeArg?: string) => {
        const player = client.camera?.cameraData.player;
        if (!Entity.exists(player) || !(player instanceof TankBody)) return;

        switch (activeArg) {
            case "on":
                player.setInvulnerability(true);
                break;
            case "off":
                player.setInvulnerability(false);
                break;
            default:
                player.setInvulnerability(!player.isInvulnerable);
                break;
        }

        const godmodeState = player.isInvulnerable ? "ON" : "OFF";
        return `God mode: ${godmodeState}`;
    },
    game_announce: (client: Client, message: string = "", color: string = "0x000000", time: string = "15000", id: string = "") => {
        const game = client.camera?.game
        if (!game) return;

        game.broadcast()
        .u8(ClientBound.Notification)
        .stringNT(message)
        .u32(parseInt(color))
        .float(parseInt(time))
        .stringNT(id).send();
    },
    game_golden_name: (client: Client, activeArg?: string) => {
        client.setHasCheated(!client.hasCheated());
    },
    admin_summon: (client: Client, entityArg: string, countArg?: string, xArg?: string, yArg?: string) => {
        const count = countArg ? parseInt(countArg) : 1;
        let x = parseInt(xArg || "0", 10);
        let y = parseInt(yArg || "0", 10);

        const player = client.camera?.cameraData.player;
        if (Entity.exists(player) && player instanceof ObjectEntity) {
            if (xArg && xArg.match(RELATIVE_POS_REGEX)) {
                x = player.positionData.x + parseInt(xArg.slice(1) || "0", 10);
            }
            if (yArg && yArg.match(RELATIVE_POS_REGEX)) {
                y = player.positionData.y + parseInt(yArg.slice(1) || "0", 10);
            }
        }

        const game = client.camera?.game;
        const TEntity = new Map([
            ["Defender", Defender],
            ["Summoner", Summoner],
            ["Guardian", Guardian],
            ["FallenOverlord", FallenOverlord],
            ["FallenBooster", FallenBooster],
            ["FallenAC", FallenAC],
            ["FallenSpike", FallenSpike],
            ["FallenMegaTrapper", FallenMegaTrapper],
            ["ArenaCloser", ArenaCloser],
            ["Mothership", Mothership],
            ["Crasher", Crasher],
            ["Pentagon", Pentagon],
            ["Square", Square],
            ["Triangle", Triangle]
        ] as [string, typeof ObjectEntity][]).get(entityArg);

        if (isNaN(count) || count < 0 || !game || !TEntity) return;

        for (let i = 0; i < count; ++i) {
            const boss = new TEntity(game);
            if (!isNaN(x) && !isNaN(y)) {
                boss.positionData.x = x;
                boss.positionData.y = y;
            }
        }
    },
    admin_kill_all: (client: Client) => {
        const game = client.camera?.game;
        if(!game) return;
        for (let id = 0; id <= game.entities.lastId; ++id) {
            const entity = game.entities.inner[id];
            if (
                Entity.exists(entity) &&
                entity instanceof LivingEntity &&
                entity !== client.camera?.cameraData.player && 
                !(entity.physicsData.values.flags & PhysicsFlags.showsOnMap)
            ) entity.destroy();
        }
    },
    admin_close_arena: (client: Client) => {
        client?.camera?.game.arena.close();
    },
    admin_kill_entity: (client: Client, entityArg: string) => {
        const TEntity = new Map([
          ["ArenaCloser", ArenaCloser],
          ["Dominator", Dominator],
          ["Bullet", Bullet],
          ["Tank", TankBody],
          ["Shape", AbstractShape],
          ["Boss", AbstractBoss]
        ] as [string, typeof LivingEntity][]).get(entityArg);
        const game = client.camera?.game;
        if (!TEntity || !game) return;

        for (let id = 0; id <= game.entities.lastId; ++id) {
            const entity = game.entities.inner[id];
            if (Entity.exists(entity) && entity instanceof TEntity) entity.destroy();
        }
    }
} as Record<CommandID, CommandCallback>

export const executeCommand = (client: Client, cmd: string, args: string[]) => {
    if (!commandDefinitions.hasOwnProperty(cmd) || !commandCallbacks.hasOwnProperty(cmd)) {
        return saveToVLog(`${client.toString()} tried to run the invalid command ${cmd}`);
    }

    if (client.accessLevel < commandDefinitions[cmd as CommandID].permissionLevel) {
        return saveToVLog(`${client.toString()} tried to run the command ${cmd} with a permission that was too low`);
    }

    const commandDefinition = commandDefinitions[cmd as CommandID];
    if (commandDefinition.isCheat) client.setHasCheated(true);

    const response = commandCallbacks[cmd as CommandID](client, ...args);
    if (response) {
        client.notify(response, 0x00FFA0, 5000, `cmd-callback${commandDefinition.id}`);
    }
}
