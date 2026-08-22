# Nuitool Architecture

## Goal

Keep the creator experience independent from any single engine or library.

```text
┌─────────────────────────────────────┐
│            Mobile Creator           │
│  World · Add · Logic · Play         │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│        Nuitool Project Schema       │
│ World · Entities · Behaviors · Data │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│          Nuitool Runtime            │
│ State · Simulation · Interaction    │
└──────────────────┬──────────────────┘
                   │
              Adapter boundary
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    Renderer    Physics    Navigation
    PlayCanvas   Rapier      Recast
```

## v0.1 implementation

The first prototype deliberately keeps the dependency surface small:

- PlayCanvas: rendering and scene primitives
- Vite: development/build pipeline
- Local storage: project persistence
- Procedural assets: zero external asset dependency for the first test

Physics and navigation are not yet required for the first creation loop. Their future integrations must sit behind Nuitool-owned adapters.

## Project Schema

The Project Schema is more important than the renderer. A project is data:

```json
{
  "schemaVersion": 1,
  "world": {
    "ground": "meadow",
    "sky": "day"
  },
  "entities": [
    {
      "id": "mia",
      "type": "npc",
      "position": [3, 0, 2],
      "behavior": "wander",
      "interaction": {
        "type": "talk",
        "text": "Hello"
      }
    }
  ]
}
```

The runtime interprets that data. The editor should never need to generate game-specific source code for normal creator actions.

## State and future time-travel debugging

Future snapshot/replay/debugging features depend on a critical rule:

> The renderer is not the source of truth for game state.

Nuitool should evolve toward an explicit simulation state that can be serialized, restored and replayed independently from rendering.

Planned evolution:

```text
v0.1  Project state + edit history
v0.2  Explicit simulation tick + runtime state
v0.3  Snapshot + input recording
v0.4  Replay + step debugging
v1.x  Rewind / Time Travel Monitor
```

## Future adapter candidates

- Physics: Rapier
- Navigation: recast-navigation-js
- Project validation: Zod / JSON Schema
- Offline structured storage: Dexie / IndexedDB
- Asset Doctor: glTF Validator + glTF Transform + meshoptimizer + KTX2/Basis
- Monitoring: stats-gl / OpenTelemetry-derived instrumentation
- Collaboration: Yjs

No future library should become part of the public Project Schema unless there is a strong portability reason.

## UX boundary

Technical concept → Creator language examples:

| Internal | Creator-facing |
|---|---|
| Collider | Can the player walk through this? |
| NavMesh agent | Walk around / Follow |
| Animation clip | Action: Sit / Run / Talk |
| Draw calls / GPU cost | This area is heavy on mid-range phones |
| State machine | What should this character do? |
| Event graph | WHEN → IF → DO |

This translation layer is a core Nuitool product asset, not cosmetic UI.
