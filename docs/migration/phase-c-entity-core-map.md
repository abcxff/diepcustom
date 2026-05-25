# Phase C entity-core map

TypeScript remains the source of truth. Phase C should port only the deterministic entity/state core first, before gameplay simulation.

## Initial port surface (corrected for headless RL)

- `src/Native/Entity.ts`
  - `Entity.exists`, `entityState`, `id`, `hash`, `preservedHash`, `wipeState`, `delete`, `toString`, numeric primitive identity.
- `src/Native/Manager.ts`
  - ID allocation/reuse, `hashTable` increments, `inner` slot deletion, `cameras`/`otherEntities` classification, `clear` behavior.
- `src/Native/FieldGroups.ts`
  - field default values, state-bit mutation on value changes, no-op assignment behavior, `wipe` behavior, table state for scoreboard/camera stat arrays.
- `src/Entity/Object.ts`
  - always-present relations/physics/position/style groups, default z-index assignment, basic position/physics/style update state.
- Full-world/entity snapshot conformance
  - primary Phase C acceptance target for headless RL training. Captures active entity IDs, hashes, manager metadata, and deterministic object field-group state before any per-agent filtering or spatial-grid quantization.
- `src/Native/Camera.ts`
  - minimal compatibility-only coverage for `CameraEntity` defaults/state where needed by legacy protocol fixtures. This is not the RL observation surface.
- `src/Native/UpcreateCompiler.ts`
  - minimal creation/update byte snapshots for deterministic, fixture-sized legacy protocol compatibility only.

## TS golden scope added first

The initial golden report intentionally avoids full gameplay classes and client/network state. It covers:

1. Entity manager allocation/delete/reuse/hash lifecycle.
2. Field group state transitions and wipe behavior.
3. Object entity default groups and deterministic full-world/entity snapshot parity.
4. Minimal camera following and creation/update packet bytes for legacy compatibility only.



## Headless RL scope correction

Phase C is now parity-first for headless RL training. The first RL-facing observation snapshot is the full world/entity state, not a per-agent filtered view. This deliberately avoids debugging C++ physics/entity desyncs through a quantized spatial-grid observation layer.

Camera/update serialization remains in the conformance suite only as a minimal compatibility guard for the existing TypeScript/client protocol. It must not expand into full browser view-snapshot parity during Phase C. Per-agent localized RL observations should be built after global full-world parity is locked.

Acceptance priority:

1. TypeScript full-world/entity snapshot is golden.
2. C++ full-world/entity snapshot matches TypeScript exactly for deterministic fixtures.
3. Minimal camera/update packet compatibility still passes.
4. Per-agent RL observation grids are deferred to a later phase.
