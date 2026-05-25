# Phase C entity-core map

TypeScript remains the source of truth. Phase C should port only the deterministic entity/state core first, before gameplay simulation.

## Initial port surface

- `src/Native/Entity.ts`
  - `Entity.exists`, `entityState`, `id`, `hash`, `preservedHash`, `wipeState`, `delete`, `toString`, numeric primitive identity.
- `src/Native/Manager.ts`
  - ID allocation/reuse, `hashTable` increments, `inner` slot deletion, `cameras`/`otherEntities` classification, `clear` behavior.
- `src/Native/FieldGroups.ts`
  - field default values, state-bit mutation on value changes, no-op assignment behavior, `wipe` behavior, table state for scoreboard/camera stat arrays.
- `src/Entity/Object.ts`
  - always-present relations/physics/position/style groups, default z-index assignment, basic position/physics/style update state.
- `src/Native/Camera.ts`
  - `CameraEntity` default groups, camera coordinate following from player/root parent, fallback to camera-coordinate flag when player is missing.
- `src/Native/UpcreateCompiler.ts`
  - creation/update byte snapshots for deterministic, fixture-sized entity state.

## TS golden scope added first

The initial golden report intentionally avoids full gameplay classes and client/network state. It covers:

1. Entity manager allocation/delete/reuse/hash lifecycle.
2. Field group state transitions and wipe behavior.
3. Object entity default groups and camera following behavior.
4. Creation/update packet bytes for a deterministic object fixture.

