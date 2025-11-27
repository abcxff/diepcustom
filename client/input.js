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

window.setupInput = () => {
    window.input = {
        mouse: Module.exports.mouse,
        keyDown: Module.exports.keyDown,
        keyUp: Module.exports.keyUp,
        blur: Module.exports.resetKeys,
        wheel: Module.exports.mouseWheel,
        prevent_right_click: Module.exports.preventRightClick,
        flushInputHooks: Module.exports.flushInputHooks,
        print_convar_help: Module.exports.printConsoleHelp,
        should_prevent_unload: Module.exports.hasTank,
        get_convar: key => {
            const keyPtr = Module.allocateUTF8(key.toString());
            const res = Module.exports.getConvar(keyPtr);
            Module.exports.free(keyPtr);
            return res ? Module.UTF8ToString(res) : null;
        },
        set_convar: (key, val) => {
            const keyPtr = Module.allocateUTF8(key.toString());
            const valPtr = Module.allocateUTF8(val.toString());
            const res = Boolean(Module.exports.setConvar(keyPtr, valPtr));
            Module.exports.free(keyPtr);
            Module.exports.free(valPtr);
            return res;
        },
        execute: cmd => {
            const cmdPtr = Module.allocateUTF8(cmd.toString());
            Module.exports.execute(cmdPtr);
            Module.exports.free(cmdPtr);
        }
    };

    const onMouseWheel = e => window.input.wheel(e.wheelDelta / -120);

    /firefox/i.test(navigator.userAgent) ? document.addEventListener("DOMMouseScroll", onMouseWheel) : document.body.onmousewheel = onMouseWheel;

    let isTyping = false;

    const scale = window.localStorage.getItem("no_retina") ? 1 : window.devicePixelRatio;
    const canvas = document.getElementById("canvas");
    const loading = document.getElementById('loading');

    canvas.onmousemove = e => window.input.mouse(e.clientX * scale, e.clientY * scale);
    
    canvas.onmousedown = e => {
        window.input.flushInputHooks();
        window.input.keyDown(e.button + 1);
    }

    canvas.onmouseup = e => {
        window.input.flushInputHooks();
        window.input.keyUp(e.button + 1);
    }

    window.onkeydown = e => {
        if (e.repeat) return;
        window.input.flushInputHooks();
        if(e.keyCode >= 112 && e.keyCode <= 130 && e.keyCode !== 113) return;
        window.input.keyDown(e.keyCode);
        if(e.keyCode === 9 || !isTyping && e.ctrlKey && e.metaKey) e.preventDefault();
    }

    window.onkeyup = e => {
        window.input.flushInputHooks();
        if(e.keyCode >= 112 && e.keyCode <= 130 && e.keyCode !== 113) return;
        window.input.keyUp(e.keyCode);
        if(e.keyCode === 9 || !isTyping && e.ctrlKey && e.metaKey) e.preventDefault();
    }

    canvas.onclick = window.onclick = () => window.input.flushInputHooks();

    canvas.ondragstart = e => e.preventDefault();

    canvas.oncontextmenu = e => window.input.prevent_right_click() ? e.preventDefault() : null;
    
    window.setLoadingStatus = str => loading.innerText = str;

    window.setTyping = val => isTyping = val;

    window.unscale = val => val / scale;

    window.onresize = () => {
        canvas.width = window.innerWidth * scale;
        canvas.height = window.innerHeight * scale;
    }

    window.onresize()
}
