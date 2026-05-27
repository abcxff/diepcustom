# TypeScript to C++ Migration Status

This document is the durable handoff for future engineers and agents working on the headless C++ migration. The current goal is a deterministic, faster C++ core for RL-agent training while the TypeScript server remains the reference implementation until parity is proven.

## Current migration contract

- Preserve external behavior first; do not replace production TypeScript runtime until C++ passes the same conformance suite.
- Maintain full-world/global deterministic parity before adding per-agent/localized RL observation grids.
- Keep camera/update serialization minimal and compatibility-focused; rich browser/view snapshots are not a goal for the headless RL server.
- Add or expand TypeScript golden fixtures before each C++ port slice, then make C++ output match byte-for-byte JSON parity.
- Do not add new third-party C++ dependencies for the current skeleton.

## What now exists

### Conformance harness

The `conformance/` tree contains TypeScript reference reports, golden fixtures, and parity comparators for these areas:

- `protocol`: packet reader/writer compatibility fixtures.
- `physics`: deterministic vector/hash-grid/packed-set style primitives.
- `entity-core`: manager/entity/full-world state snapshots and minimal compatibility packet/camera serialization.
- `gameplay`: deterministic headless gameplay slices and TS-vs-C++ report parity.

Useful commands:

```bash
npm run test:conformance   # TS golden fixtures
npm run test:cpp           # CMake configure/build + C++ smoke tests
npm run test:parity        # C++ reports compared with TS references
npm run bench:gameplay     # gameplay report runtime signal, TS vs C++
npm run test:all           # full baseline: build, unit, e2e, conformance, audit
```

### C++ skeleton

The C++ tree is CMake-based and currently exposes small report/test binaries, not a replacement server:

- `cpp/include/diepcustom/*.hpp` and `cpp/src/*.cpp` implement protocol, physics, entity-core, and gameplay report surfaces.
- `cpp/tests/*_report.cpp` prints JSON reports consumed by parity comparators.
- Build outputs are under `build/cpp/` and should stay out of source control.

### Phase C: entity/core parity completed to current scope

The entity-core parity layer now proves:

- Real manager-backed entity ID/hash lifecycle.
- Field group mutation/wipe behavior.
- Full-world snapshots as the first snapshot shape.
- Minimal C++ compatibility packets generated from C++ state mutations.
- Minimal camera/update compatibility retained only where needed for server/update behavior.

### Phase D: gameplay parity slices completed so far

The gameplay parity report currently covers these deterministic headless scenarios:

1. `overlapping-living-entities-damage` — overlapping living entities exchange deterministic collision damage.
2. `score-on-kill-and-death-removal` — lethal collision awards score, starts deletion animation, and removes after animation.
3. `owner-propagated-projectile-kill-score` — projectile kills award score to the owning entity.
4. `projectile-movement-and-lifetime` — projectile spawn speed, acceleration, lifetime expiry, and deletion start.
5. `camera-player-score-integration` — minimal camera score mutation mirrors onto focused player score data.
6. `arena-bounds-clamp-and-can-escape` — ordinary bodies clamp to arena bounds + padding; `canEscapeArena` bodies do not.
7. `team-owner-collision-rules` — `noOwnTeamCollision` and `onlySameOwnerCollision` gates.
8. `collision-eligibility-filters` — zero-sided, nonphysical, and deleting entities skip collision resolution.
9. `solid-wall-projectile-contact` — owned projectile touching enemy solid wall enters deletion animation and wall response matches TS.

Recent verified commits for these slices:

- `46caa57` Lock the first gameplay parity baseline
- `e9704e5` Prove the first gameplay fixture against C++
- `30edcbc` Gate gameplay migration on a measured C++ speed signal
- `2ab7c8c` Extend gameplay parity through death rewards
- `3a81d48` Carry projectile kills back to their owner
- `d78aadf` Lock projectile motion and lifetime parity
- `95bdd65` Tie camera score changes to focused players
- `5fdb41f` Preserve arena boundary behavior in gameplay parity
- `be8576a` Keep team owner collision gates deterministic
- `3cf528b` Filter ineligible bodies before collision parity
- `1c154e5` Preserve solid-wall projectile contact parity

Latest measured gameplay report signal at `1c154e5`:

- TypeScript median: `921.592ms`
- C++ median: `4.337ms`
- Median speedup: `212.50x`

This benchmark includes process/startup overhead and is a migration signal only, not the final in-engine tick benchmark.

## Implementation pattern to keep using

For every future slice:

1. Add a deterministic TypeScript scenario to the relevant `conformance/**/report-ts.js`.
2. Regenerate/update the matching golden fixture under `conformance/fixtures/`.
3. Verify the TS fixture is deterministic with the relevant `golden.test.js`.
4. Implement the matching C++ report behavior.
5. Run `npm run test:cpp` and the specific comparator.
6. Run `npm run test:parity`, `npm run bench:gameplay` when gameplay changed, and `npm run test:all`.
7. Commit with a Lore-style message that records constraints, rejected alternatives, confidence, risk, directives, and tested commands.

## Important caveats and gotchas

- The gameplay C++ code is still a parity report model, not a full engine/server. Do not route production traffic to it yet.
- `conformance/gameplay/report-ts.js` uses a deliberately headless fake game and minimal arena object to avoid shape/boss/countdown randomness.
- Full-world snapshots are the ground truth. Local RL observation grids should be derived only after global parity is stable.
- Keep synthetic fixtures deterministic: avoid same-position collisions that trigger random knockback unless randomness is explicitly controlled.
- `PhysicsFlags.canEscapeArena` is `1 << 8` (`256`). An older projectile movement fixture uses flag value `16` only as a stable legacy fixture value while remaining inside bounds; do not copy that as `canEscapeArena`.
- Solid-wall behavior depends on owner/team checks inside `ObjectEntity.receiveKnockback`; preserve that ordering when broadening projectile and wall ports.

## Recommended next work

Move from synthetic `LivingEntity` fixtures toward actual gameplay construction while preserving the same parity pattern:

1. Add a TS fixture for actual `TankBody`/basic tank construction in a headless game.
2. Port only the minimal C++ tank/body data needed to match the full-world snapshot.
3. Add actual `Bullet` construction and firing/lifetime parity after tank construction is stable.
4. Add shape construction/spawn behavior only after RNG seeding/control is explicit.
5. Leave WebSocket/HTTP server replacement until deterministic headless gameplay parity is much broader.
## Headless RL simulator layer

The C++ migration now includes a first reusable headless simulator layer for RL-oriented tick throughput. It is intentionally separate from the WebSocket/HTTP/browser server path.

Current entry points:
- `diepcustom::headless::Simulation` in `cpp/include/diepcustom/headless.hpp` exposes `reset(seed)`, `step(actions)`, and `fullWorldSnapshotJson()`.
- `build/cpp/headless_sim` runs scripted native simulations with `--seed`, `--agents`, `--ticks`, `--scenario`, and optional `--snapshot-json`.
- `npm run test:headless` builds C++ and verifies same-seed deterministic snapshots.
- `npm run bench:headless` measures in-engine tick throughput without JSON in the hot loop.

Determinism policy:
- Tick stepping is fixed and synchronous; no wall-clock, socket, or client state participates in `Simulation::step`.
- RNG is standard-library-only and seeded; snapshots include RNG state and draw count.
- Collision pairs are sorted by stable entity IDs before resolution.
- Training rewards are emitted separately from legacy score while legacy score/reward state remains present in snapshots.

Current limitations:
- The headless API is C++ only; Python/Node trainer bindings are intentionally deferred.
- Local RL observation grids are still deferred until full-world global parity is stable.
- Real tank/shape/AI constructors are not fully ported into this layer yet; scenarios are deterministic smoke/throughput fixtures.

