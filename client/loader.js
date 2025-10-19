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

// make module globally accessable
window.Module = {};

// todolist
Module.todo = [];

// todo status
Module.status = null;

// is the todo list done?
Module.isRunning = false;

// has the module been aborted?
Module.isAborted = false;

// exception name
Module.exception = null;

// function index for dynamic calling of the main func
Module.mainFunc = null;

// content contexts
Module.cp5 = null;

// client input
window.input = null;

// arenas
Module.servers = null;

// colors
Module.colors = null;

// tanks
Module.tankDefinitions = null;
Module.tankDefinitionsTable = null;

// commands
Module.executeCommandFunctionIndex = null;
Module.executionCallbackMap = {};
Module.commandDefinitions = null;

// name input
Module.textInput = document.getElementById("textInput");
Module.textInputContainer = document.getElementById("textInputContainer");

// permission level is sent to client in the accept packet
Module.permissionLevel = -1;

// (polling) intervals, can be a number (ms), -1 aka never or -2 aka whenever a new connection is initiated  
Module.reloadServersInterval = -2;
Module.reloadTanksInterval = -2;
Module.reloadCommandsInterval = -2;
Module.reloadColorsInterval = -2;

// Run frames via requestAnimationFrame or setTimeout
Module.scheduler = window.requestAnimationFrame;

// abort client
Module.abort = cause => {
    Module.isAborted = true;
    Module.isRunning = false;
    throw new WebAssembly.RuntimeError(`abort(${cause})`);
};

// run ASMConst method, basically replaces a lot of "real wasm imports"
Module.runASMConst = (code, sigPtr, argbuf) => {
    const args = [];
    let char;
    argbuf >>= 2;
    while(char = Module.HEAPU8[sigPtr++]) {
        const double = char < 105;
        if(double && argbuf & 1) argbuf++;
        args.push(double ? Module.HEAPF64[argbuf++ >> 1] : Module.HEAP32[argbuf])
        ++argbuf;
    }
    return ASMConsts[ASM_CONSTS[code]].apply(null, args);
};

// initializing the looper
Module.setLoop = func => {
    if(!Module.isRunning || Module.isAborted || Module.exception === "quit") return;
    Module.mainFunc = func;
    Module.scheduler.apply(null, [Module.loop]);
};

// process todo
Module.run = async () => {
    let args = [];
    while(Module.todo.length) {
        const [func, isAsync] = Module.todo.shift();
        if(isAsync) args = await Promise.all(func(...args));
        else args = func(...args);
        console.log(`Running stage ${Module.status} done`);
    }
};

// looper, 1 animation frame = 1 main call, except for stack unwinds
Module.loop = () => {
    if(!Module.isRunning || Module.isAborted || Module.exception === "quit") return;
    switch(Module.exception) {
        case null:
            Module.exports.dynCallV(Module.mainFunc);
            return Module.scheduler.apply(null, [Module.loop]);
        case "quit":
            return;
        case "unwind":
            Module.exception = null;
            return Module.scheduler.apply(null, [Module.loop]);
    }
};

// exit runtime (no unwind, originally unwind would be catched here)
Module.exit = status => {
    Module.exception = "quit";
    Module.isRunning = false;
    throw `Stopped runtime with status ${status}`;
};

// read utf8 from memory
Module.UTF8ToString = ptr => ptr ? Decoder.decode(Module.HEAPU8.subarray(ptr, Module.HEAPU8.indexOf(0, ptr))) : "";

// i/o write used for console, not fully understood
Module.fdWrite = (stream, ptr, count, res) => {
    let out = 0;
    for(let i = 0; i < count; i++) out += Module.HEAP32[(ptr + (i * 8 + 4)) >> 2];
    Module.HEAP32[res >> 2] = out;
};

// write utf8 to memory
Module.allocateUTF8 = str => {
    if(!str) return 0;
    const encoded = Encoder.encode(str);
    const ptr = Module.exports.malloc(encoded.byteLength + 1); // stringNT aka *char[]
    if(!ptr) return;
    Module.HEAPU8.set(encoded, ptr);
    Module.HEAPU8[ptr + encoded.byteLength] = 0;
    return ptr;
};

// Refreshes UI Components
Module.loadGamemodeButtons = () => {
    const vec = new $Vector(MOD_CONFIG.memory.gamemodeButtons, "struct", 28);
    if(vec.start) vec.destroy(); // remove old arenas
    // map server response to memory struct
    vec.push(...Module.servers.map(server => ([
        { offset: 0, type: "cstr", value: server.gamemode }, 
        { offset: 12, type: "cstr", value: server.name }, 
        { offset: 24, type: "i32", value: 0 }
    ])));
    Module.rawExports.loadVectorDone(MOD_CONFIG.memory.gamemodeButtons + 12); // toggle vector memory guard
};

// Refreshes UI Components
Module.loadChangelog = (changelog) => {
    const vec = new $Vector(MOD_CONFIG.memory.changelog, "cstr", 12);
    if(vec.start) vec.destroy(); // remove old changelog
    vec.push(...(changelog || CHANGELOG)); // either load custom or default
    $(MOD_CONFIG.memory.changelogLoaded).i8 = 1; // not understood
};

// Replaces current colors with serverside ones
Module.loadColors = () => {
    if(!window.input || !Module.colors) return;
    for(const [idx, color] of Object.entries(Module.colors)) {
        window.input.execute(`net_replace_color ${idx} ${color}`);
    }
};

// Ignore Hashtable, instead read from custom table
Module.getTankDefinition = tankId => {
    if(!Module.tankDefinitions) return 0;
    if(!Module.tankDefinitionsTable) Module.loadTankDefinitions(); // load tankdefs dynmically when requested
    if(!Module.tankDefinitionsTable[tankId]) return 0;
    return Module.tankDefinitionsTable[tankId] + 12; // 12 bytes for tankIds
};

Module.getCommand = cmdIdPtr => COMMANDS_LOOKUP[$(cmdIdPtr).cstr] || 0;

Module.loadTankDefinitions = () => {
    const writeTankDef = (ptr, tank) => {
        // Please note that this is not the full tank/barrel struct but just the portion needed for the client to function properly
        const barrels = tank.barrels ? tank.barrels.map(barrel => { // barrel fields
            return [
                { offset: 0, type: "f32", value: barrel.angle },
                { offset: 4, type: "f32", value: barrel.delay },
                { offset: 8, type: "f32", value: barrel.size },
                { offset: 12, type: "f32", value: barrel.offset },
                { offset: 16, type: "u8", value: Number(barrel.isTrapezoid) },
                { offset: 24, type: "f32", value: barrel.width / 42 },
                { offset: 56, type: "f32", value: barrel.bullet.sizeRatio },
                { offset: 60, type: "f32", value: barrel.trapezoidDirection },
                { offset: 64, type: "f32", value: barrel.reload },
                { offset: 96, type: "u32", value: ADDON_MAP[barrel.addon] || 0 }
            ];
        }) : [];

        const fields = [ // tankdef fields
            { offset: 4, type: "u32", value: tank.id },
            { offset: 8, type: "u32", value: tank.id },
            { offset: 12, type: "u32", value: tank.id },
            { offset: 16, type: "cstr", value: tank.name.toString() || "" },
            { offset: 28, type: "cstr", value: tank.upgradeMessage.toString() || "" },
            { offset: 40, type: "vector", value: { type: "u32", typeSize: 4, entries: tank.upgrades || [] } },
            { offset: 52, type: "vector", value: { type: "struct", typeSize: 100, entries: barrels } },
            { offset: 64, type: "u32", value: tank.levelRequirement || 0 },
            { offset: 76, type: "u8", value: Number(tank.sides === 4) },
            { offset: 93, type: "u8", value: Number(tank.sides === 16) },
            { offset: 96, type: "u32", value: ADDON_MAP[tank.preAddon] || 0 },
            { offset: 100, type: "u32", value: ADDON_MAP[tank.postAddon] || 0 },
        ];

        $.writeStruct(ptr, fields);
    };

    // TODO Rewrite with new $LinkedList datastructure
    Module.tankDefinitionsTable = new Array(Module.tankDefinitions.length).fill(0); // clear memory
    let lastPtr = MOD_CONFIG.memory.tankDefinitions;
    for(const tank of Module.tankDefinitions) {
        if(!tank) continue;
        const ptr = Module.exports.malloc(244); // length of a tankdef
        Module.HEAPU8.subarray(ptr, ptr + 244).fill(0);
        $(lastPtr).i32 = ptr;
        writeTankDef(ptr, tank);
        Module.tankDefinitionsTable[tank.id] = ptr;
        lastPtr = ptr;
    }

    $(MOD_CONFIG.memory.tankDefinitionsCount).i32 = Module.tankDefinitions.filter(e => Boolean(e)).length; // tankId xor based off this
};

// Executes a command callback from a command context
Module.executeCommand = execCtx => {
    const cmd = $(execCtx)[0].cstr;
    const tokens = $(execCtx)[12].vector("cstr", 12);
    
    if(!cmd || !tokens.length) throw `Invalid execution context (ptr: ${execCtx}) received`;
    if(typeof Module.executionCallbackMap[tokens[0]] !== "function") {
        if(!Module.commandDefinitions.find(({ id }) => id === tokens[0])) {
            throw `${Module.executionCallbackMap[tokens]} for command ${cmd} is an invalid callback`;
        }
        return Game.socket.send(new Uint8Array([
            6,
            ...Encoder.encode(tokens[0]), 0,
            tokens.slice(1).length,
            ...tokens.slice(1).flatMap(token => [...Encoder.encode(token), 0])
        ]));
    }

    // [id, ...args], we only need args
    Module.executionCallbackMap[tokens[0]](tokens.slice(1));
};

/*
    Command object: { id, usage, description, callback }
    The execute command function will not check for validity of arguments, you need to do that on your own
*/
Module.loadCommands = (commands = CUSTOM_COMMANDS) => {
    const cmdList = new $LinkedList(MOD_CONFIG.memory.commandList, "struct", 24);
    for(let { id, usage, description, callback, permissionLevel } of commands) {
        if(COMMANDS_LOOKUP[id] || permissionLevel > Module.permissionLevel) continue; // ignore duplicates

        // allocate Command
        const cmdPtr = Module.exports.malloc(40);
        $.writeStruct(cmdPtr, [
            { offset: 0, type: "cstr", value: id },
            { offset: 12, type: "cstr", value: usage || "" },
            { offset: 24, type: "cstr", value: description || "" },
            { offset: 36, type: "u32", value: Module.executeCommandFunctionIndex } // we handle every custom command with the same function
        ]);

        COMMANDS_LOOKUP[id] = cmdPtr;
        if(callback) Module.executionCallbackMap[id] = callback;

        // allocate HashNode
        cmdList.push([
            { offset: 0, type: "u32", value: 0 }, // next node
            { offset: 4, type: "u32", value: 0 }, // hash
            { offset: 8, type: "cstr", value: id }, // command id
            { offset: 20, type: "$", value: cmdPtr } // command def ptr
        ]);
    }
};

const wasmImports = {
    assertFail: (condition, filename, line, func) => Module.abort("Assertion failed: " + Module.UTF8ToString(condition) + ", at: " + [filename ? Module.UTF8ToString(filename) : "unknown filename", line, func ? Module.UTF8ToString(func) : "unknown function"]),
    mapFile: () => -1, // unused
    sysMunmap: (addr, len) => addr === -1 || !len ? -28 : 0, // not really used
    abort: Module.abort,
    asmConstsDII: Module.runASMConst,
    asmConstsIII: Module.runASMConst,
    exitLive: () => Module.exception = "unwind", // unwind stack
    exitForce: () => Module.exit(1), // exit / quit
    getNow: () => performance.now(),
    memCopyBig: (dest, src, num) => { Module.HEAPU8.copyWithin(dest, src, src + num) }, // for large packets
    random: () => Math.random(),
    resizeHeap: () => Module.abort("OOM"), // unable to resize wasm memory
    setMainLoop: Module.setLoop,
    envGet: () => 0, // unused
    envSize: () => 0, // unused
    fdWrite: Module.fdWrite, // used for diep client console
    roundF: d => d >= 0 ? Math.floor(d + 0.5) : Math.ceil(d - 0.5), // no, default Math.round doesn't work :D
    timeString: () => 0, // unused
    wasmMemory: new WebAssembly.Memory(WASM_MEMORY),
    wasmTable: new WebAssembly.Table(WASM_TABLE)
};

Module.todo.push([() => {
    Module.status = "PREPARE";
    // map imports to config
    Module.imports = { a: Object.fromEntries(Object.entries(WASM_IMPORTS).map(([key, name]) => [key, wasmImports[name]])) };
    return [];
}, false]);

Module.todo.push([() => {
    Module.status = "FETCH";
    // fetch necessary info and build
    return [
        fetch(`${CDN}build_${BUILD}.wasm.wasm`).then(res => res.arrayBuffer()),
        fetch(`${API_URL}servers`).then(res => res.json()),
        fetch(`${API_URL}tanks`).then(res => res.json())
    ];
}, true]);

Module.todo.push([(dependency, servers, tanks) => {
    Module.status = "INSTANTIATE";
    Module.servers = servers;
    Module.tankDefinitions = tanks;
    
    const parser = new WailParser(new Uint8Array(dependency));
    
    // original function, we want to modify these
    const originalVectorDone = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.loadVectorDone);
    const originalLoadChangelog = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.loadChangelog);
    const originalLoadGamemodeButtons = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.loadGamemodeButtons);
    const originalLoadTankDefs = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.loadTankDefinitions);
    const originalGetTankDef = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.getTankDefinition);
    const originalFindCommand = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.findCommand);
    const originalDecodeComponentList = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.decodeComponentList);
    const originalCreateEntityAtIndex = parser.getFunctionIndex(MOD_CONFIG.wasmFunctions.createEntityAtIndex);

    // function types
    const types = {
        // void []
        vn: parser.addTypeEntry({
            form: "func",
            params: [],
            returnType: null
        }),
        // void [int]
        vi: parser.addTypeEntry({
            form: "func",
            params: ["i32"],
            returnType: null
        }),
        // int [int]
        ii: parser.addTypeEntry({
            form: "func",
            params: ["i32"],
            returnType: "i32"
        })
    }

    // custom imports
    const imports = {
        loadGamemodeButtons: parser.addImportEntry({
            moduleStr: "mods",
            fieldStr: "loadGamemodeButtons",
            kind: "func",
            type: types.vn 
        }),
        loadChangelog: parser.addImportEntry({
            moduleStr: "mods",
            fieldStr: "loadChangelog",
            kind: "func",
            type: types.vn
        }),
        getTankDefinition: parser.addImportEntry({
            moduleStr: "mods",
            fieldStr: "getTankDefinition",
            kind: "func",
            type: types.ii
        }),
        findCommand: parser.addImportEntry({
            moduleStr: "mods",
            fieldStr: "findCommand",
            kind: "func",
            type: types.ii
        }),
        executeCommand: parser.addImportEntry({
            moduleStr: "mods",
            fieldStr: "executeCommand",
            kind: "func",
            type: types.vi
        })
    };

    Module.imports.mods = {
        loadGamemodeButtons: Module.loadGamemodeButtons,
        loadChangelog: Module.loadChangelog,
        getTankDefinition: Module.getTankDefinition,
        findCommand: Module.getCommand,
        executeCommand: Module.executeCommand
    };

    for(const addonId of Object.keys(CUSTOM_ADDONS)) {
        imports["_addon_" + addonId] = parser.addImportEntry({
            moduleStr: "mods",
            fieldStr: "_addon_" + addonId,
            kind: "func",
            type: types.vi
        });

        parser.addExportEntry(imports["_addon_" + addonId], {
            fieldStr: "_addon_" + addonId,
            kind: "func"
        });

        Module.imports.mods["_addon_" + addonId] = (ptr) => {
            const input = $(ptr);
            if(!ptr || !input.i32) throw "Invalid pointer received on addon callback";
            CUSTOM_ADDONS[addonId](new $Entity(input.i32 !== ptr ? input.$ : input));
        };
    }

    parser.addExportEntry(imports.executeCommand, {
        fieldStr: "executeCommand",
        kind: "func"
    });

    parser.addExportEntry(originalVectorDone, {
        fieldStr: "loadVectorDone",
        kind: "func"
    });
    
    parser.addExportEntry(originalCreateEntityAtIndex, {
        fieldStr: "createEntityAtIndex",
        kind: "func"
    });

    parser.addExportEntry(originalDecodeComponentList, {
        fieldStr: "decodeComponentList",
        kind: "func"
    });

    const findConsecutiveSequenceIndex = (array, sequence) => {
        const indexes = [];
        for(let i = 0; i < array.length - sequence.length + 1; i++) {
            let found = true;
            for(let j = 0; j < sequence.length; j++) {
                if(array[i + j] !== sequence[j]) {
                    found = false;
                    break;
                }
            }
            if(found) {
                indexes.push(i);
            }
        }
        return indexes;
    }
    
    // parses & modifies code function by function
    parser.addCodeElementParser(null, function({ index, bytes }) {
        const ptrPattern = VarUint32ToArray(MOD_CONFIG.memory.netColorTable);
        const geuPattern = [OP_I32_CONST, 19, OP_I32_GE_U];
        const ltuPattern = [OP_I32_CONST, 19, OP_I32_LT_U];
        for(const idx of findConsecutiveSequenceIndex(bytes, ptrPattern)) {
            const arr = Array.from(bytes); // convert to normal array for splicing
            arr.splice(idx, ptrPattern.length, ...VarUint32ToArray(DYNAMIC_TOP_PTR + 4)); // using "empty" space
            bytes = new Uint8Array(arr); // convert back to u8[]
            let check = findConsecutiveSequenceIndex(bytes, geuPattern); // <= kMaxColors
            if(!check.length) {
                check = findConsecutiveSequenceIndex(bytes, ltuPattern); // invert, > kMaxColors
                for(const idx of check) {
                    const arr = Array.from(bytes);
                    arr.splice(idx, ltuPattern.length, OP_I32_CONST, ...VarSint32ToArray(-2), OP_I32_NE); // color code -2 = kMaxColors
                    bytes = new Uint8Array(arr);
                }
            } else {
                for(const idx of check) {
                    const arr = Array.from(bytes);
                    arr.splice(idx, geuPattern.length, OP_I32_CONST, ...VarSint32ToArray(-2), OP_I32_EQ); // color code -2 = kMaxColors
                    bytes = new Uint8Array(arr);
                }
            }
        }
        
        switch(index) {
            // modify load changelog function
            case originalLoadChangelog.i32(): // we only need the part where it checks if the changelog is already loaded to avoid too many import calls
                return new Uint8Array([
                    ...bytes.subarray(0, MOD_CONFIG.wasmFunctionHookOffset.changelog),
                    OP_CALL, ...VarUint32ToArray(imports.loadChangelog.i32()),
                    OP_RETURN,
                    ...bytes.subarray(MOD_CONFIG.wasmFunctionHookOffset.changelog)
                ]);
            // modify load gamemode buttons function
            case originalLoadGamemodeButtons.i32(): // we only need the part where it checks if the buttons are already loaded to avoid too many import calls
                return new Uint8Array([
                    ...bytes.subarray(0, MOD_CONFIG.wasmFunctionHookOffset.gamemodeButtons),
                    OP_CALL, ...VarUint32ToArray(imports.loadGamemodeButtons.i32()),
                    OP_RETURN,
                    ...bytes.subarray(MOD_CONFIG.wasmFunctionHookOffset.gamemodeButtons)
                ]);
            // overwrite get tankdef function
            case originalGetTankDef.i32(): // we modify this to call a js function which then returns the tank def ptr from a table
                return new Uint8Array([
                    OP_GET_LOCAL, 0,
                    OP_CALL, ...VarUint32ToArray(imports.getTankDefinition.i32()),
                    OP_RETURN,
                    OP_END
                ]);
            // overwrite find command function
            case originalFindCommand.i32():
                return new Uint8Array([
                    OP_GET_LOCAL, 0,
                    OP_CALL, ...VarUint32ToArray(imports.findCommand.i32()),
                    OP_RETURN,
                    OP_END
                ]);
            // delete tankdefs loading function
            case originalLoadTankDefs.i32(): // we dont want this to run anymore because it will call the original tank wrapper function
                return new Uint8Array([
                    OP_END
                ]);
            // no interesting index
            default:
                return bytes;
        }
    });

    // parse modded wasm
    parser.parse();
    // instantiate
    return [new Promise(resolve => WebAssembly.instantiate(parser.write(), Module.imports).then(res => resolve(res.instance), reason => Module.abort(reason)))];
}, true]);

Module.todo.push([instance => {
    Module.status = "INITIALIZE";
    // Exports
    Module.exports = Object.fromEntries(Object.entries(instance.exports).map(([key, func]) => [WASM_EXPORTS[key], func]));    
    Module.rawExports = instance.exports;
    // Memory
    Module.memBuf = wasmImports.wasmMemory.buffer,
    Module.HEAPU8 = new Uint8Array(Module.memBuf);
    Module.HEAP8 = new Int8Array(Module.memBuf);
    Module.HEAPU16 = new Uint16Array(Module.memBuf);
    Module.HEAP16 = new Int16Array(Module.memBuf);
    Module.HEAPU32 = new Uint32Array(Module.memBuf);
    Module.HEAP32 = new Int32Array(Module.memBuf);
    Module.HEAPF32 = new Float32Array(Module.memBuf);
    Module.HEAPF64 = new Float64Array(Module.memBuf);
    Module.HEAPU64 = new BigUint64Array(Module.memBuf);
    Module.HEAP64 = new BigInt64Array(Module.memBuf);
    // Cp5 Contexts
    Module.cp5 = {
        contexts: [],
        images: [],
        sockets: [],
        patterns: []
    };
    // window.input & misc, see input.js
    window.setupInput();
    return [];
}, false]);

Module.todo.push([() => {
    window.Game = {
        reloadColors: async () => {
            Module.colors = await fetch(`${API_URL}colors`).then(res => res.json());
            Module.loadColors();
        },
        // refetches servers & resets gamemode buttons
        reloadServers: async () => {
            Module.servers = await fetch(`${API_URL}servers`).then(res => res.json());
            Module.loadGamemodeButtons();
        },
        // refetches tankdefs & resets them
        reloadTanks: async () => {
            Module.tankDefinitions = await fetch(`${API_URL}tanks`).then(res => res.json());
            if(Module.tankDefinitionsTable) {
                for(const tankDef of Module.tankDefinitionsTable) {
                    if(tankDef) Module.exports.free(tankDef);
                }
            }
            Module.loadTankDefinitions();
        },
        reloadCommands: async () => {
            Module.commandDefinitions = await fetch(`${API_URL}commands`).then(res => res.json());
            Module.loadCommands(Module.commandDefinitions); // remote
            Module.loadCommands(); // local
        },
        // sets changelog (input: [...""])
        changeChangelog: (lines) => Module.loadChangelog(lines),
        // main socket, see also Module.cp5.sockets[0]
        get socket() {
            return Module.cp5.sockets[0];
        },
        // executes spawn command
        spawn: name => window.input.execute(`game_spawn ${name}`),
        // executes reconnect command
        reconnect: () => window.input.execute(`lb_reconnect`)
    };

    // custom commands
    Module.executeCommandFunctionIndex = Module.imports.a.table.grow(1);
    Module.imports.a.table.set(Module.executeCommandFunctionIndex, Module.rawExports.executeCommand);

    // custom addons
    for(const addonId of Object.keys(CUSTOM_ADDONS)) {
        ADDON_MAP[addonId] = Module.imports.a.table.grow(1);
        Module.imports.a.table.set(ADDON_MAP[addonId],  Module.rawExports["_addon_" + addonId]);
    }

    Module.status = "START";
    // emscripten requirements
    Module.HEAP32[DYNAMIC_TOP_PTR >> 2] = DYNAMIC_BASE;
    Module.isRunning = true;
    Module.exports.wasmCallCtors();
    Module.exports.main();


    const reloadServersInterval = () => setTimeout(() => {
        reloadServersInterval();
        if(Module.reloadServersInterval < 0) return;
        Game.reloadServers(); 
    }, Module.reloadServersInterval);
    reloadServersInterval();

    const reloadTanksInterval = () => setTimeout(() => {
        reloadTanksInterval();
        if(Module.reloadTanksInterval < 0) return;
        Game.reloadTanks();
    }, Module.reloadTanksInterval);
    reloadTanksInterval();

    const reloadCommandsInterval = () => setTimeout(() => {
        reloadCommandsInterval();
        if(Module.reloadCommandsInterval < 0) return;
        Game.reloadCommands();
    }, Module.reloadCommandsInterval);
    reloadCommandsInterval();
    
    const reloadColorsInterval = () => setTimeout(() => {
        reloadColorsInterval();
        if(Module.reloadColorsInterval < 0) return;
        Game.reloadColors();
    }, Module.reloadColorsInterval);
    reloadColorsInterval();
}, false]);


const PING_PACKET = new Uint8Array([5]);
function sendThrottledPing(socket) {
    const now = performance.now();
    const socketPtr = Module.HEAPU32[SOCKET_PTR >> 2];
    const lastPingTimePtr = socketPtr + LAST_PING_TIME_OFFSET;

    const timeSinceLastPing = now - Module.HEAPF64[lastPingTimePtr >> 3];
    if (timeSinceLastPing >= PING_THROTTLE_MS) {
        return socket.send(PING_PACKET);
    }

    // This is okay as this function won't be called again until
    // after the pong is received from the server.
    setTimeout(() => requestAnimationFrame(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        Module.HEAPF64[lastPingTimePtr >> 3] = Module.HEAPF64[TIME_NOW_PTR >> 3];
        socket.send(PING_PACKET);
    }), PING_THROTTLE_MS - timeSinceLastPing);
}

// Part of the original emscripten bootstrap
class ASMConsts {
    static createCanvasCtxWithAlpha(canvasId, alpha) {
        const canvas = document.getElementById(Module.UTF8ToString(canvasId));
        if(!canvas) return -1;
        const ctx = canvas.getContext("2d", {
            alpha: Boolean(alpha)
        });
        for (let i = 0; i < Module.cp5.contexts.length; ++i) {
            if (Module.cp5.contexts[i] !== null) continue;
            Module.cp5.contexts[i] = ctx;
            return i;
        }
        Module.cp5.contexts.push(ctx);
        return Module.cp5.contexts.length - 1;
    }

    static createImage(src) {
        const img = new Image;
        img.isLoaded = false;
        img.onload = () => img.isLoaded = true;
        img.src = `${CDN}${Module.UTF8ToString(src)}`;
        for (let i = 0; i < Module.cp5.images.length; ++i) {
            if (Module.cp5.images[i] !== null) continue;
            Module.cp5.images[i] = img;
            return i;
        }
        Module.cp5.images.push(img);
        return Module.cp5.images.length - 1;
    }

    static websocketSend(socketId, packetStart, packetLength) {
        const socket = Module.cp5.sockets[socketId];
        if(!socket || socket.readyState !== 1) return 0;
        const packetId = Module.HEAPU8[packetStart];
        if (packetId === 5) {
            sendThrottledPing(socket);
            return 1;
        }
        try {
            socket.send(Module.HEAP8.subarray(packetStart, packetStart + packetLength));
        } catch(e) {}
        return 1;
    }

    static wipeContext(index) {
        Module.cp5.contexts[index] = null;
    }

    static modulo(a, b) {
        return a % b;
    }

    static wipeSocket(index) {
        const socket = Module.cp5.sockets[index];
        socket.onopen = socket.onclose = socket.onmessage = socket.onerror = function() {};
        for(let i = 0; i < socket.events.length; ++i) Module.exports.free(socket.events[i][1]);
        socket.events = null;
        try {
            socket.close();
        } catch(e) {}
        Module.cp5.sockets[index] = null;
    }

    static setTextInput(value) {
        Module.textInput.value = Module.UTF8ToString(value);
    }

    static wipeImage(index) {
        Module.cp5.images[index] = null;
    }

    static reloadWindowTimeout() {
        //setTimeout(() => window.location.reload(), 100);
    }

    static existsInWindowObject(key) {
        return Boolean(window[Module.UTF8ToString(key)]);
    }

    // 6 (ads)

    static getQueries() {
        const queryString = window.location.href.split("?")[0];
        return Module.allocateUTF8(queryString.slice(0, queryString.lastIndexOf("/")));
    }

    // 2 (ads)

    static getLocalStorage(key, length) {
        const keyStr = Module.UTF8ToString(key);
        let str = window.localStorage[keyStr] || "";
        if(
            keyStr === "gamemode"
            && Module.servers
            && Module.servers.length
            && !Module.servers.find(({ gamemode }) => window.localStorage[keyStr] === gamemode)
        ) str = Module.servers[0].gamemode;
        Module.HEAPU32[length >> 2] = str.length;
        return Module.allocateUTF8(str);
    }

    static deleteLocalStorage(key) {
        delete window.localStorage[Module.UTF8ToString(key)];
    }

    static removeChildNode(nodeId) {
        const node = document.getElementById(Module.UTF8ToString(nodeId));
        if(node && node.parentNode) node.parentNode.removeChild(node);
    }

    static checkElementProperty(elementId, propertyKey, propertyIndex, value) {
        const element = document.getElementById(Module.UTF8ToString(elementId));
        const key = Module.UTF8ToString(propertyKey);
        if(!element || !element[key]) return true;
        return element[key][Module.UTF8ToString(propertyIndex)] === Module.UTF8ToString(value);
    }

    static existsQueryOrIsBlank(query) {
        const elements = document.querySelectorAll(Module.UTF8ToString(query));
        for(let i = 0; i < elements.length; ++i)
            if(elements[i].src === "about:blank") return true;
        return elements.length === 0;
    }

    // 1 (ads)

    static setLocalStorage(key, valueStart, valueLength) {
        window.localStorage[Module.UTF8ToString(key)] = Decoder.decode(Module.HEAPU8.subarray(valueStart, valueStart + valueLength));
    }

    // 3 (ads)

    static getGamepad() {
        return window.navigator.getGamepads && window.navigator.getGamepads()[0]?.mapping === "standard";
    }

    static toggleFullscreen() {
        const requestMethod = document.body.requestFullScreen || document.body.webkitRequestFullScreen || document.body.mozRequestFullScreen || document.body.msRequestFullScreen;
        const cancelMethod = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if(!requestMethod && !cancelMethod) return;
        requestMethod ? requestMethod.call(document.body) : cancelMethod.call(document);
    }

    static getCanvasSize(ctxId, width, height) {
        const canvas = Module.cp5.contexts[ctxId].canvas;
        Module.HEAP32[width >> 2] = canvas.width;
        Module.HEAP32[height >> 2] = canvas.height;
    }

    static setCursorDefault() {
        document.getElementById("canvas").style.cursor = "default";
    }

    static setCursorPointer() {
        document.getElementById("canvas").style.cursor = "pointer";
    }

    static setCursorText() {
        document.getElementById("canvas").style.cursor = "text";
    }

    static getTextInput() {
        return Module.allocateUTF8(Module.textInput.value);
    }

    static enableTyping(left, top, width, height, enabled) {
        window.setTyping(true);
        Module.textInputContainer.style.display = "block";
        Module.textInputContainer.style.position = "absolute";
        Module.textInputContainer.style.left = window.unscale(left) + "px";
        Module.textInputContainer.style.top = window.unscale(top) + "px";
        Module.textInput.style.width = window.unscale(width * 0.96) + "px";
        Module.textInput.style.height = window.unscale(height) + "px";
        Module.textInput.style.lineHeight = window.unscale(height * 0.9) + "px";
        Module.textInput.style.fontSize = window.unscale(height * 0.9) + "px";
        Module.textInput.style.paddingLeft = "5px";
        Module.textInput.style.paddingRight = "5px";
        Module.textInput.disabled = !enabled;
        Module.textInput.focus();
    }

    static disableTyping() {
        window.setTyping(false);
        Module.textInput.blur();
        Module.textInput.value = "";
        Module.textInputContainer.style.display = "none";
    }

    static focusCanvas() {
        const canvas = document.getElementById("canvas");
        if(document.activeElement && document.activeElement !== canvas) document.activeElement.blur()
        canvas.focus();
    }

    static setCanvasSize(ctxId, width, height) {
        const canvas = Module.cp5.contexts[ctxId].canvas;
        canvas.width = width;
        canvas.height = height;
    }

    // 1 (ads)

    static copyUTF8(original) {
        return Module.allocateUTF8(Module.UTF8ToString(original));
    }

    static alert(text) {
        window.alert(Module.UTF8ToString(text));
    }

    static saveContext(ctxId) {
        Module.cp5.contexts[ctxId].save();
    }

    static restoreContext(ctxId) {
        Module.cp5.contexts[ctxId].restore();
    }

    static scaleContextAlpha(ctxId, alpha) {
        Module.cp5.contexts[ctxId].globalAlpha *= alpha;
    }

    // 5 (ads)

    static setContextFillStyle(ctxId, r, g, b) {
        Module.cp5.contexts[ctxId].fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    }

    static setContextTransform(ctxId, a, b, c, d, e, f) {
        Module.cp5.contexts[ctxId].setTransform(a, b, c, d, e, f);
    }

    static contextFillRect(ctxId) {
        Module.cp5.contexts[ctxId].fillRect(0, 0, 1, 1);
    }

    static contextBeginPath(ctxId) {
        Module.cp5.contexts[ctxId].beginPath();
    }

    static contextClip(ctxId) {
        Module.cp5.contexts[ctxId].clip();
    }

    static contextFill(ctxId) {
        Module.cp5.contexts[ctxId].fill();
    }

    static setContextLineJoinRound(ctxId) {
        Module.cp5.contexts[ctxId].lineJoin = "round";
    }

    static setContextLineJoinBevel(ctxId) {
        Module.cp5.contexts[ctxId].lineJoin = "bevel";
    }

    static setContextLineJoinMiter(ctxId) {
        Module.cp5.contexts[ctxId].lineJoin = "miter";
    }

    static setContextLineWidth(ctxId, width) {
        Module.cp5.contexts[ctxId].lineWidth = width;
    }

    static setContextStrokeStyle(ctxId, r, g, b) {
        Module.cp5.contexts[ctxId].strokeStyle = "rgb(" + r + "," + g + "," + b + ")";
    }

    static setContextTransformBounds(ctxId, a, b, c, d) {
        Module.cp5.contexts[ctxId].setTransform(a, b, c, d, 0, 0);
    }

    static contextStroke(ctxId) {
        Module.cp5.contexts[ctxId].stroke();
    }

    // draws one pixel
    static contextRect(ctxId) {
        Module.cp5.contexts[ctxId].rect(0, 0, 1, 1);
    }

    static getFontsLoaded() {
        return document.fonts.check("1px Ubuntu");
    }

    static setContextFont(ctxId, fontSize) {
        Module.cp5.contexts[ctxId].font = fontSize + "px Ubuntu";
    }

    static measureContextTextWidth(ctxId, text) {
        return Module.cp5.contexts[ctxId].measureText(Module.UTF8ToString(text)).width;
    }

    static setContextAlpha(ctxId, alpha) {
        Module.cp5.contexts[ctxId].globalAlpha = alpha;
    }

    static contextFillText(ctxId, text) {
        Module.cp5.contexts[ctxId].fillText(Module.UTF8ToString(text), 0, 0);
    }

    static contextStrokeText(ctxId, text) {
        Module.cp5.contexts[ctxId].strokeText(Module.UTF8ToString(text), 0, 0);
    }

    static setContextTextBaselineTop(ctxId) {
        Module.cp5.contexts[ctxId].textBaseline = "top";
    }

    static setContextTextBaselineHanging(ctxId) {
        Module.cp5.contexts[ctxId].textBaseline = "hanging";
    }

    static setContextTextBaselineMiddle(ctxId) {
        Module.cp5.contexts[ctxId].textBaseline = "middle";
    }

    static setContextTextBaselineAlphabetic(ctxId) {
        Module.cp5.contexts[ctxId].textBaseline = "alphabetic";
    }

    static setContextTextBaselineIdeographic(ctxId) {
        Module.cp5.contexts[ctxId].textBaseline = "ideographic";
    }

    static setContextTextBaselineBottom(ctxId) {
        Module.cp5.contexts[ctxId].textBaseline = "bottom";
    }

    static setContextTransformNormalize(ctxId) {
        Module.cp5.contexts[ctxId].setTransform(1, 0, 0, 1, 0, 0);
    }

    static contextMoveTo(ctxId, x, y) {
        Module.cp5.contexts[ctxId].moveTo(x, y);
    }

    static contextLineTo(ctxId, x, y) {
        Module.cp5.contexts[ctxId].lineTo(x, y);
    }

    static contextClosePath(ctxId) {
        Module.cp5.contexts[ctxId].closePath();
    }

    static contextArc(ctxId, startAngle, endAngle, counterclockwise) {
        Module.cp5.contexts[ctxId].arc(0, 0, 1, startAngle, endAngle, counterclockwise)
    } 

    static copyToKeyboard(text) {
        window?.navigator?.clipboard?.writeText(Module.UTF8ToString(text));
    }

    static setLocation(newLocation) {
        // open in new tab instead
        window.open(Module.UTF8ToString(newLocation));
    }

    static contextDrawImage(ctxId, imgId) {
        const img = Module.cp5.images[imgId];
        if(!img.isLoaded || img.width === 0 || img.height === 0) return;
        Module.cp5.contexts[ctxId].drawImage(img, 0, 0, img.width, img.height, 0, 0, 1, 1);
    }

    static getImage(imgId, isLoaded, width, height) {
        const img = Module.cp5.images[imgId];
        Module.HEAPU8[isLoaded >> 0] = img.isLoaded;
        Module.HEAP32[width >> 2] = img.width;
        Module.HEAP32[height >> 2] = img.height;
    }

    static contextDrawCanvas(ctxId, targetCtxId) {
        Module.cp5.contexts[ctxId].drawImage(Module.cp5.contexts[targetCtxId].canvas, 0, 0);
    }

    static setContextLineCapButt(ctxId) {
        Module.cp5.contexts[ctxId].lineCap = "butt";
    }

    static setContextLineCapRound(ctxId) {
        Module.cp5.contexts[ctxId].lineCap = "round";
    }

    static setContextLineCapSquare(ctxId) {
        Module.cp5.contexts[ctxId].lineCap = "square";
    }

    static contextStrokeRect(ctxId) {
        Module.cp5.contexts[ctxId].strokeRect(0, 0, 1, 1);
    }

    static contextDrawFullCanvas(ctxId, targetCtxId) {
        const canvas = Module.cp5.contexts[targetCtxId].canvas;
        Module.cp5.contexts[ctxId].drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 1, 1);
    }
    
    static isContextPatternAvailable() {
        return Boolean(CanvasRenderingContext2D.prototype.createPattern);
    }

    static createContextPattern(ctxId, targetCtxId) {
        const pattern = Module.cp5.contexts[ctxId].createPattern(Module.cp5.contexts[targetCtxId].canvas, null);
        for (let i = 0; i < Module.cp5.patterns.length; ++i) {
            if (Module.cp5.patterns[i] !== null) continue;
            Module.cp5.patterns[i] = pattern;
            return i;
        }
        Module.cp5.patterns.push(pattern);
        return Module.cp5.patterns.length - 1;
    }

    static contextGetPixelColor(ctxId, x, y) {
        const data = Module.cp5.contexts[ctxId].getImageData(x, y, 1, 1);
        return data.data[0] << 16 | data.data[1] << 8 | data.data[2];
    }

    static contextDrawCanvasSourceToPixel(ctxId, targetCtxId, x, y, w, h) {
        Module.cp5.contexts[ctxId].drawImage(Module.cp5.contexts[targetCtxId].canvas, x, y, w, h, 0, 0, 1, 1);
    }

    static contextFillRectWithPattern(ctxId, patternId, width, height) {
        Module.cp5.contexts[ctxId].fillStyle = Module.cp5.patterns[patternId];
        Module.cp5.contexts[ctxId].fillRect(0, 0, width, height);
    }

    static wipePattern(patternId) {
        Module.cp5.patterns[patternId] = null;
    }

    // 2 (verifying bootstrap integrity ?)

    static existsQuery(query) {
        return document.querySelector(Module.UTF8ToString(query)) !== null;
    }

    // 1 (anticheat)

    // used for shadow root
    static canvasHasSamePropertyAsDocumentBody(property) {
        const propertyKey = Module.UTF8ToString(property);
        return document.getElementById("canvas")[propertyKey] !== document.body[propertyKey];
    }

    // used for shadow root
    static existsDocumentBodyProperty(property) {
        return document.body[Module.UTF8ToString(property)] !== undefined;
    }

    // used for shadow root
    static existsDocumentBodyProperty2(property) {
        return Boolean(document.body[Module.UTF8ToString(property)]);
    }

    // used for shadow root
    static existsDivPropertyAndEqualsPropertyOnDocumentBody(propertyDiv, propertyBody) {
        const propertyDivKey = Module.UTF8ToString(propertyDiv);
        const div = document.createElement("div");
        if(!div[propertyDivKey]) return;
        return div[propertyDivKey]() === document.body[Module.UTF8ToString(propertyBody)];
    }

    // 3 (anticheat)

    // anticheat but need to be kept
    static acCheckWindow(property) {
        if(Module.UTF8ToString(property) === "navigator") return true;
    }

    static getDocumentBody() {
        return Module.allocateUTF8(document.body.innerHTML);
    }

    // 2 (anticheat)

    static getUserAgent() {
        return Module.allocateUTF8(window.navigator.userAgent);
    }

    // 1 (anticheat)

    static getQuerySelectorToString() {
        return Module.allocateUTF8("function querySelector() { [native code] }");
    }
    
    static getFillTextToString() {
        return Module.allocateUTF8("function fillText() { [native code] }");
    }

    static getStrokeRectToString() {
        return Module.allocateUTF8("function strokeRect() { [native code] }");
    }

    static getStrokeTextToString() {
        return Module.allocateUTF8("function strokeText() { [native code] }");
    }

    static getScaleToString() {
        return Module.allocateUTF8("function scale() { [native code] }");
    }

    static getTranslateToString() {
        return Module.allocateUTF8("function translate() { [native code] }");
    }

    static getFillRectToString() {
        return Module.allocateUTF8("function fillRect() { [native code] }");
    }

    static getRotateToString() {
        return Module.allocateUTF8("function rotate() { [native code] }");
    }

    static getGetImageDataToString() {
        return Module.allocateUTF8("function getImageData() { [native code] }");
    }

    // 1 (ads)

    static contextClearRect(ctxId) {
        const ctx = Module.cp5.contexts[ctxId];
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    static createCanvasCtx() {
        const ctx = document.createElement("canvas").getContext("2d");
        for(let i = 0; i < Module.cp5.contexts.length; ++i) {
            if(Module.cp5.contexts[i]) continue;
            Module.cp5.contexts[i] = ctx;
            return i; 
        }
        Module.cp5.contexts.push(ctx);
        return Module.cp5.contexts.length - 1;
    }

    static setContextMiterLimit(ctxId, miterLimit) {
        Module.cp5.contexts[ctxId].miterLimit = miterLimit;
    }

    static getWindowLocation() {
        return Module.allocateUTF8(window.location.hash);
    }

    static setLoadingStatus(status) {
        if(window.setLoadingStatus) window.setLoadingStatus(Module.UTF8ToString(status));
    }

    static m28nReply(requestId, endpoint) {
        if(!Module.servers || !Module.servers.length) return console.warn("No Servers Found");
        const server = Module.servers.find(({ gamemode }) => gamemode === Module.UTF8ToString(endpoint).slice(7)) || Module.servers[0];
        const id = Module.allocateUTF8(server.gamemode);
        const ipv4 = Module.allocateUTF8(server.gamemode);
        const ipv6 = Module.allocateUTF8(server.gamemode);
        Module.exports.restReply(requestId, id, ipv4, ipv6);
        Module.exports.free(id);
        Module.exports.free(ipv4);
        Module.exports.free(ipv6);
    }

    static isSSL() {
        return false;
    }

    static createWebSocket(urlPtr) {
        const url = Module.UTF8ToString(urlPtr);
        const ws = new WebSocket(`ws${location.protocol.slice(4)}//${location.host}/${url.slice(5, url.length - 4)}`);
        ws.binaryType = "arraybuffer";
        ws.events = [];
        ws.onopen = function() {
            ws.events.push([2, 0, 0]);
            Module.exports.checkWS();
        };
        ws.onerror = function() {
            ws.events.push([3, 0, 0]);
            Module.exports.checkWS();
        };
        ws.onclose = function({ reason }) {
            ws.events.push([4, 0, 0]);
            Module.exports.checkWS();
            if(reason) console.log("WebSocket closed due to:", reason);
        };
        ws.onmessage = function(e) {
            const view = new Uint8Array(e.data);
            if(view[0] === 7) {
                let out = 0, i = 0, at = 1;
                while(view[at] & 0x80) {
                    out |= (view[at++] & 0x7f) << i;
                    i += 7;
                }
                out |= (view[at++] & 0x7f) << i;
                Module.permissionLevel = (0 - (out & 1)) ^ (out >>> 1);
                window.Game.reloadCommands();
            }
            const ptr = Module.exports.malloc(view.length);
            Module.HEAP8.set(view, ptr);
            ws.events.push([1, ptr, view.length]);
            Module.exports.checkWS();
        };
        for (let i = 0; i < Module.cp5.sockets.length; ++i) {
            if (Module.cp5.sockets[i] != null)
                continue;
            Module.cp5.sockets[i] = ws;
            return i;
        }

        if(Module.reloadServersInterval === -2) Game.reloadServers();
        if(Module.reloadTanksInterval === -2) Game.reloadTanks(); 
        if(Module.reloadCommandsInterval === -2) Game.reloadCommands();
        if(Module.reloadColorsInterval === -2) Game.reloadColors();

        Module.cp5.sockets.push(ws);
        return Module.cp5.sockets.length - 1;
    }

    static findServerById(requestId, endpoint) {
        Module.exports.restReply(requestId, 0, 0, 0);
    }

    static invalidPartyId() {
        alert("Invalid party ID");
    }

    static wipeLocation() {
        window.location.hash = "";
    }

    static getGamepadAxe(axeId) {
        const axes = window.navigator.getGamepads()[0].axes;
        if(axeId >= axes.length) return;
        return axes[axeId];
    }

    static getGamepadButtonPressed(buttonId) {
        const buttons = window.navigator.getGamepads()[0].buttons;
        if(buttonId >= buttons.length) return;
        return buttons[buttonId].pressed;
    }

    static pollWebSocketEvent(socketId, msg, length) {
        const ws = Module.cp5.sockets[socketId];
        if(ws.events.length === 0) return null;
        const event = ws.events.shift();
        Module.HEAPU32[msg >> 2] = event[1]; // packet ptr
        Module.HEAP32[length >> 2] = event[2]; // packet length
        return event[0]; // type
    }

    static updateToNewVersion(version) {
        console.log(Module.UTF8ToString(version));
        setTimeout(() => window.location.reload());
    }

    // 1 (pow)

    static reloadWindow() {
        setTimeout(() => window.location.reload());
    }

    static getWindowLocationSearch() {
        return Module.allocateUTF8(window.location.search);
    }

    static getWindowReferrer() {
        return Module.allocateUTF8(window.document.referrer);
    }

    // 7 (fingerprinting)

    static empty() {}
}

Module.run();
