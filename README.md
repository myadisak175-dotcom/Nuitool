# Nuitool

**Touch-first mobile game creator.**

Nuitool explores one simple promise: **you should be able to start making a playable 3D game from a phone without first learning a desktop game engine.**

## Creator Core v0.1

This first milestone is intentionally small but playable:

- Mobile-first 3D editor
- Four primary actions: **World / Add / Logic / Play**
- Touch orbit + pinch zoom
- Tap-to-place procedural starter assets
- Tap-to-select objects
- Move / rotate / resize / duplicate / delete
- Starter NPC behaviors: Stay / Walk Around / Follow
- Starter interactions: Talk / Collect
- Immediate Play mode with virtual joystick
- Local autosave
- Undo / redo
- Project JSON export
- Basic Game Health monitor
- Installable PWA shell
- GitHub Pages deployment workflow

## Built-in starter assets

No external art download is required for the first prototype. The starter library is procedural and includes:

- Round Tree
- Pine
- Moss Rock
- Flowers
- Village House
- Cottage
- Door
- Crate
- Lamp
- NPC
- Slime
- Coin
- Player

These are intentionally lightweight placeholders for testing the creator workflow. Later asset packs can plug into the same Project Schema.

## Architecture principle

```text
Mobile Creator UI
        ↓
Nuitool Project Schema
        ↓
Nuitool Runtime
        ↓
Adapter / Open-source foundation
        ↓
Browser / Mobile
```

The editor is not meant to expose engine terminology to beginners. Technical systems should be translated into creator language and contextual actions.

## Development

Requirements: Node.js 22+

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Current foundation

- PlayCanvas Engine 2.21.4
- Vite 7.3.5
- Browser local storage for v0.1 persistence

The architecture is intentionally prepared for future adapters and services such as physics, navigation, asset validation/optimization, monitoring, replay/snapshots and cloud collaboration.

## Product rule

> Easy first. Powerful later. Never desktop-first.

See `docs/VISION.md` and `docs/ARCHITECTURE.md`.
