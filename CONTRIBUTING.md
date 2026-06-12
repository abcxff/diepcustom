<br><br>
<div align="center">
    <img src="./icon.png" width="20%" />
    <h3> diep custom </h3>
    <p>Contribution Guide</p>
</div>
<br>

First off, thanks for taking the time to contribute. ❤️

This repository currently spans three closely related areas:

- the TypeScript game server and client-hosting path
- conformance + parity tooling
- the C++ headless / RL training track

Please keep contributions small, factual, and easy to verify.

## Before you open a PR

- Make sure you are working from the current code, not only older docs or assumptions.
- Prefer targeted fixes over broad rewrites.
- If you change behavior, add or update tests first when possible.
- If you change docs, verify them against the live code paths, scripts, or test output.

## Questions and bug reports

Before opening a new issue:

- search existing GitHub issues
- collect reproduction steps, environment details, and relevant logs
- include exact commands you ran when reporting test/build failures

Helpful details include:

- OS and architecture
- Node/npm/Python/CMake versions when relevant
- expected vs actual behavior
- stack traces or failing test output

## Local verification commands

Use the smallest command set that proves your change.

Common commands:

```bash
npm run check
npm run build
npm run test:unit
npm run test:e2e
npm run test:conformance
npm run test:cpp
npm run test:parity
npm run test:headless
npm run test:all
```

Guidance:

- **Docs-only changes**: verify every changed statement against current code or tests.
- **TypeScript gameplay/server changes**: usually run `npm run check`, targeted tests, then `npm test`.
- **C++ parity/headless changes**: usually run `npm run test:cpp` and the relevant parity/headless commands.
- **Cross-cutting behavior changes**: prefer `npm run test:all`.

## Documentation changes

When updating docs:

1. Verify the claim against code, scripts, config, or test output.
2. Prefer concrete routes, filenames, and commands over generic descriptions.
3. Remove stale guidance instead of layering new text on top of it.
4. Keep migration/handoff docs explicit about what is production vs parity/experimental.

## Code changes

Please keep code changes:

- small and reviewable
- behavior-preserving unless the change intentionally fixes behavior
- free of unnecessary abstractions or new dependencies unless justified

If behavior is already protected by tests, keep those tests green. If it is not, add the narrowest regression coverage that locks the intended behavior.

## Commit protocol

This repo uses the **Lore commit protocol**.

Each commit message should explain **why** the change was made, not just what changed, and should include useful trailers when relevant.

Preferred format:

```text
<intent line: why the change was made>

<optional concise body with context and rationale>

Constraint: <external constraint>
Rejected: <alternative> | <reason>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Directive: <future warning>
Tested: <what you verified>
Not-tested: <known gaps>
```

Use the trailers that add real value; omit the ones that do not.

## Pull request expectations

A good PR description should usually include:

- **Why** the change was needed
- **What** changed at a high level
- **How it was verified**
- **Remaining risks or deferred follow-ups**

If your change touches docs, mention which claims were re-verified.
If your change touches parity or RL surfaces, mention whether the TypeScript runtime, C++ headless layer, or both were affected.
