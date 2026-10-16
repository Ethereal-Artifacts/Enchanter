# Package and architecture

This repository is the standalone Enchanter workspace. It separates reusable generative modules from the browser app that composes them.

Node.js and esbuild are build tools: they run on your computer to turn the source files into `enchanter.html`. Open that file in a browser to run Enchanter. The browser runs the bundled JavaScript and Canvas 2D animation; it does not need Node.js, a web server, or network access. Rebuild after an edit and reopen the output HTML to see it.

## Workspace layout

```text
.
├── enchanter.html           ready-to-open app, included in Download ZIP
├── apps/standalone/
│   ├── src/                 app shell, orchestration, Echoes, palettes, locales
│   ├── runtime.html         standalone document shell
│   ├── runtime.css          standalone styles
│   ├── build.mjs            standalone HTML builder
│   └── output/              generated standalone HTML
├── packages/core/
│   └── src/                 generative runtime modules and shared types
├── docs/
├── fonts/                   bundled fonts and their license files
├── package.json             workspace and top-level build script
├── package-lock.json
├── README.md
├── LICENSE
└── THIRD_PARTY_NOTICES.md
```

`packages/core/` contains existing generative modules for grid and cell evolution, color, equilibrium, effects, timing, algorithms, shared configuration and types, and PAL geometry, solver, and animation. Its entry point exposes namespaces for those existing modules. It does not define a new engine factory or a separately versioned simulation API.

For example, a consumer can import a type and an existing color utility from the workspace package:

```ts
import { color, type RGB } from '@ethereal/enchanter-core';

const earthTone: RGB = color.hsbToRgb(11.3, 48.5, 55);
```

Other namespaces are listed in `packages/core/src/index.ts`; the available surface can change with the runtime source.

`apps/standalone/` contains Enchanter’s page shell, app coordination, authored Echo and palette data, localization, and controls. The standalone app uses TypeScript and native browser APIs. Its build bundles the runtime, styles, Echo data, and fonts into `enchanter.html`.

The selector's Echo names and order come from `apps/standalone/src/utils/spellCatalog.ts`; `apps/standalone/src/data.ts` imports the Echo JSON files and Grimoire data. The runtime uses each Spell's `reagent` field to connect an Element to its palette. Its current Echo selection comes from the selector and preset files, not from the Spell `preset` or `placeholderPreset` fields.

## Integration hooks

The standalone app exports a source-level integration surface from `apps/standalone/src/enchanter.ts`:

- `setRuntimeRoot(root)` selects the DOM root used by the runtime.
- `setButtonRenderer(renderer)` supplies host-owned controls for buttons, Echo selection, information UI, labels, and pressed state. Passing `null` uses the standalone controls.
- `prepareEnvironment()` loads authored data and builds the shell before reveal.
- `boot(signal?, beforeReveal?)` starts the experience; the optional abort signal cancels boot.
- `armEnchanterInteractions()` installs keyboard and pointer handling and returns a cleanup function.
- `resetEnchanterSession()` clears UI state for a later mount.

These hooks manage the app’s controls and lifecycle. They are not a stability or compatibility promise for downstream consumers. Review the exported surface before depending on particular methods.

## Browser behavior and limits

Enchanter renders with Canvas 2D. Fullscreen and PNG snapshots use browser APIs and depend on browser support and user gestures. Device performance varies with hardware and display size. The generated HTML is self-contained and can run locally after building.
