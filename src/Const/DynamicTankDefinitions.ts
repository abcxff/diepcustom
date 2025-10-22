import Client from "../Client";
import { Inputs } from "../Entity/AI";
import AbstractShape from "../Entity/Shape/AbstractShape";
import ShapeManager from "../Entity/Shape/Manager";
import Pentagon from "../Entity/Shape/Pentagon";
import Square from "../Entity/Shape/Square";
import Barrel from "../Entity/Tank/Barrel";
import TankBody from "../Entity/Tank/TankBody";
import GameServer from "../Game";
import ArenaEntity from "../Native/Arena";
import ClientCamera, { CameraEntity } from "../Native/Camera";
import EntityManager from "../Native/Manager";
import { warn } from "../util";
import DevTankDefinitions, { DevTank } from "./DevTankDefinitions";
import { Tank } from "./Enums";
import TankDefinitions, { getTankById, getTankByName, TankDefinition } from "./TankDefinitions";

class EmptyShapeManager extends ShapeManager {
    public get wantedShapes() {
        return 0;
    }
}

// Create an Empty Arena with no shapes
class DummyArena extends ArenaEntity {
    public static override GAMEMODE_ID: string = "dummy";

    public constructor(game: GameServer) {
        super(game);
        this.updateBounds(0, 0);
        this.shapes = new EmptyShapeManager(this);
    }
}

// Create an Empty Game and disable ticks
class DummyGame {
    public clients: Set<Client>;
    public entities: EntityManager;
    public tick: number;
    public arena: ArenaEntity;
    public constructor() {
        this.clients = new Set();
        this.entities = new EntityManager(this as any);
        this.fillEntitiesArray();
        this.arena = new DummyArena(this as any);
        this.tick = 1;
    }

    public fillEntitiesArray() {
        for (let i = 0; i < this.entities.inner.length - 100; ++i) {
            this.entities.inner[i] = true as any;
        }
        this.entities.lastId = this.entities.inner.length - 101;
    }

    public clearEntitiesArray() {
        for (let i = 0; i < this.entities.inner.length - 100; ++i) {
            this.entities.inner[i] = null;
        }
        this.entities.lastId = 0;
    }
}

// Create a Client that doesn't send packets, but lets us save them
class DummyClient extends Client {
    public sentPacket: Uint8Array = new Uint8Array([0x05]);
    public constructor(game: GameServer) {
        super(null as any, game);
    }

    public override send(data: Uint8Array | string, isBinary: boolean = true): void {
        if (data instanceof Uint8Array) {
            this.sentPacket = data;
        }
    }
}

// Disable the first setTank call (creates entities- we don't want side effects like that)
class DummyTankBody extends TankBody {
    public constructor(game: GameServer, camera: CameraEntity, inputs: Inputs) {
        super(game, camera, inputs);
        this.setTank = TankBody.prototype.setTank.bind(this);
    }

    public override setTank(tank: Tank | DevTank): void {
        return;
    }
}

// Copy the replication packet for changing to the tank from the Ball tank
function serializeTankDefinition(definition: TankDefinition): Uint8Array {
    const _game = new DummyGame();
    const game = _game as unknown as GameServer;
    const client = new DummyClient(game);
    const camera = new ClientCamera(game, client);

    _game.clearEntitiesArray();
    const tank = new DummyTankBody(game, camera, client.inputs);
    camera.cameraData.player = camera.relationsData.owner = camera.relationsData.parent = tank;
    // First, set to Ball to initialize the tank properly
    {
        _game.tick = 0;
        tank.setTank(53 as Tank);
        _game.entities.collisionManager.preTick(_game.tick);
        camera["updateView"](_game.tick);
        _game.entities.collisionManager.postTick(_game.tick);
    }
    
    // Then, set to the desired tank to capture changes
    {
        _game.tick = 1;
        _game.entities.collisionManager.preTick(_game.tick);
        // tank.setTank(definition.id);
        tank.styleData.color = 3;
        if (definition.id === Tank.Basic) {
            new Pentagon(game, true).setParent(tank);
            // new Barrel(tank, getTankByName("Overlord")!.barrels[0]);
        }
        
        camera.wipeState();
        _game.arena.wipeState();
        camera["updateView"](_game.tick);
        _game.entities.collisionManager.postTick(_game.tick);
    }

    const packet = new Uint8Array(client.sentPacket);
    console.log(packet.slice(0, 50).join(",")); // Debug output
    return packet;
}

function serializeTankDefinitions(definitions: TankDefinition[]): Map<number, Uint8Array> {
    const serializedDefinitions = new Map<number, Uint8Array>();
    for (const definition of definitions) {
        const serialized = serializeTankDefinition(definition);
        serializedDefinitions.set(definition.id, serialized);
    }
    return serializedDefinitions;
}

const TankDefinitionsSerializations = serializeTankDefinitions([
    ...TankDefinitions,
    ...DevTankDefinitions,
].filter((def) => def !== null));

type DynamicDefinition = TankDefinition & { serialized: string };
const DynamicTankDefinitions: DynamicDefinition[] = [];
for (const [id, serialization] of TankDefinitionsSerializations) {
    const def = id < 0 ? DevTankDefinitions[~id] : TankDefinitions[id];
    if (!def) {
        warn(`Tank definition for ID ${id} lost during serialization.`);
        continue;
    }

    // Deep clone the definition (it's json serializable)
    const dynamicDef = JSON.parse(JSON.stringify(def)) as DynamicDefinition;
    // Get rid of attachments
    dynamicDef.barrels = [];
    dynamicDef.postAddon = null;
    dynamicDef.preAddon = null;

    // Then append serialization
    dynamicDef.serialized = Buffer.from(serialization).toString("base64");

    DynamicTankDefinitions.push(dynamicDef);
}
export default DynamicTankDefinitions;