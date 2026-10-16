# Your first Enchanter change

This short lesson follows the Grimoire: an Element's Reagent provides its paint, while the selected Echo provides the moving pattern. Try the palette edit first. The function step builds on that same palette path.

## 1. Open the source folder

Open the standalone source repository in your editor. Its top folder contains `package.json` and `package-lock.json`. Follow [Build and run from source](build.md) to open a terminal there, install dependencies once with `npm ci`, and build with `npm run build`.

## 2. Change one Earth color

Open `apps/standalone/src/GRIMOIRE/REAGENTS/EARTH.json`. Find the `"colors"` list inside `"palette"`. Each item has three numbers: `h` chooses the hue, or color (0–360); `s` sets how colorful it is rather than gray (0–100); and `b` sets how bright it is (0–100).

In your own fork, change the first swatch's hue from `11.3` to `280`, leaving its saturation and brightness as they are. Save the file. This is a personal experiment; it does not change the approved source palette.

Build again from the repository root:

```sh
npm run build
```

Close and reopen `enchanter.html`. Choose the Folsom Echo, select Earth (not Auto), and begin. The first authored Earth swatch is now purple, so the evolving pattern can use that color. The selected Echo and its motion have not changed.

The Grimoire connection is in `apps/standalone/src/GRIMOIRE/SPELLS/EARTH.json`: its `reagent` value is `EARTH`. The Reagent's `colors` list supplies the swatches. When that list has at least one color, it takes precedence over the Reagent's single `baseH`, `baseS`, and `baseB` fallback values.

## 3. Add a small function

The app turns Reagent swatches into HSB color values in `apps/standalone/src/app.ts`, inside `paletteToHsbList`. This function is already used when an Element palette is applied. In your fork, add this helper immediately above `paletteToHsbList`:

```ts
function brightenSwatch(color: HSB): HSB {
  return { ...color, b: Math.min(color.b + 10, 100) };
}
```

Then, inside `paletteToHsbList`, change the existing return line in the `palette.colors` branch from:

```ts
return palette.colors.map((c) => ({ h: c.h, s: c.s, b: c.b }));
```

to:

```ts
return palette.colors.map(brightenSwatch);
```

`brightenSwatch` receives one color and returns a new color with its brightness raised by 10 points, capped at 100. The `...color` part keeps the original hue and saturation. Rebuild, close and reopen the output HTML, then select Earth and begin again. The Earth swatches should look brighter. This helper only changes swatches loaded from a Reagent's `colors` list.

To undo either experiment, restore the original `11.3` value and the original `palette.colors.map(...)` line, remove the helper, save, rebuild, and reopen the output HTML. The source files are the instructions for the next build; changing them does not edit an HTML file that is already open.

## If something goes wrong

- **The color did not change:** confirm that you selected Earth rather than Auto, then rebuild and reopen `enchanter.html` in the top-level folder.
- **The build says a package is missing:** run `npm ci` once from the folder containing the standalone repository's `package.json` and `package-lock.json`.
- **The build says `HSB` is unknown:** check that the helper is in `apps/standalone/src/app.ts`, where `HSB` is already imported.
- **You edited `runtime.html`:** that file is the page shell. This lesson changes the Grimoire data and the app's existing palette function instead.

If you want to learn more about Echo files and app boundaries, see [Package and architecture](package-and-architecture.md).
