# Forking and local development

Forks are welcome under the Hippocratic License 3.0 core. This project is not accepting upstream contributions or pull requests at this time. Maintain modifications in your own fork.

## The short version

If you only want to use Enchanter, choose **Code → Download ZIP** on GitHub, unzip it, and open `enchanter.html` in the top-level folder. Open it in a browser; the file contains the app and runs without Node.js, npm, a server, or internet access.

If you want to change Enchanter, use the standalone source repository. Open a terminal in the folder containing `package.json` and `package-lock.json`. Install the locked build tools once with `npm ci`, then run `npm run build` after each edit. Open `enchanter.html` in a browser and reopen it after every rebuild to see changes. The browser does not watch source files or reload automatically. The [first-change guide](first-change.md) walks through this with the Grimoire's Earth palette.

Node.js and esbuild are used only on your computer while building. They bundle the source app, styles, fonts, and Echo data into the single HTML file. After that file opens, the browser runs the JavaScript and Canvas 2D animation; it does not start a Node process or fetch app code from the internet.

## Where to make changes

- **Generative engine:** edit TypeScript modules in `packages/core/src/`, such as the grid, evolution algorithms, color, effects, timing, and PAL runtime modules. Check `packages/core/src/index.ts` for current exports.
- **Standalone app and controls:** edit the shell and app orchestration in `apps/standalone/src/`, plus `apps/standalone/runtime.html` and `apps/standalone/runtime.css` for document structure and presentation.
- **Echoes:** edit the eight JSON Echo files in `apps/standalone/src/presets/stable-b8871c4/`. The selector names and order are in `apps/standalone/src/utils/spellCatalog.ts`; the Echo data is imported in `apps/standalone/src/data.ts`.
- **Elements and palettes:** edit the files in `apps/standalone/src/GRIMOIRE/REAGENTS/`. Their `palette.colors` values are the HSB swatches used for color. The `apps/standalone/src/GRIMOIRE/SPELLS/` files link Elements to Reagents through their `reagent` field.
- **Translations:** edit `apps/standalone/src/locales/en.json` first when changing copy shape, then keep `translations.json` compatible. See [Localization](localization.md).

Echo selection currently uses the selector list and preset files. Spell files also contain `preset`, `placeholderPreset`, and `reagent` fields, but the current runtime reads the `reagent` field to connect an Element to its palette; it does not use `preset` or `placeholderPreset` to choose the Echo. Do not expect edits to those two fields to change the selected Echo.

The `packages/core/` entry point exposes namespaces for existing engine modules. It does not provide a single engine factory or a separately versioned API. Review current exports before adding an integration that depends on a specific symbol.

## Scope and notices

Retain the Hippocratic License and bundled font notices in redistributed copies. The fonts have separate SIL Open Font License terms; see the repository root `THIRD_PARTY_NOTICES.md` and `fonts/` directory.
