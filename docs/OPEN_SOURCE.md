# Open-source foundation policy

Nuitool should use mature open-source components as replaceable infrastructure, not as the product identity.

## Included in v0.1

### PlayCanvas Engine
- Role: 3D rendering and scene primitives
- Package: `playcanvas`
- Version pinned in v0.1: `2.21.4`
- License: MIT

### Vite
- Role: development server and production build
- Package: `vite`
- Version pinned in v0.1: `7.3.5`
- License: MIT

## Planned candidates

These are architectural candidates, not v0.1 dependencies:

- Rapier — physics
- recast-navigation-js — navigation/pathfinding
- glTF Validator — model conformance checks
- glTF Transform — asset transformation/optimization
- meshoptimizer — geometry optimization
- Basis Universal / KTX2 — texture pipeline
- Zod — project validation
- Dexie — IndexedDB storage
- Comlink — worker RPC
- stats-gl / OpenTelemetry instrumentation — monitoring
- Yjs — collaboration/local-first sync

## Integration rule

Every substantial external system should sit behind a Nuitool-owned boundary when practical:

```text
Creator → Nuitool API → Adapter → External library
```

The Project Schema must describe game intent rather than library-specific implementation details. This keeps projects portable if an underlying library is changed later.

## Product value

Open source supplies infrastructure. Nuitool's differentiating work lives in:

- Mobile-native creator UX
- Project Schema
- Behavior and rule language
- Runtime semantics
- Human-readable monitoring and diagnosis
- Mobile optimization policy
- Asset compatibility rules
- Future creator/plugin ecosystem
