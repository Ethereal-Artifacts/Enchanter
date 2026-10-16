# Build your own Enchanter

You only need this guide if you want to change Enchanter. To use a finished copy, open `enchanter.html` in your browser.

The build needs Node.js 20.19 or newer and npm. You need an internet connection once to install the exact project dependencies. After that, you can rebuild without an internet connection.

1. Open the standalone source repository folder in your file browser. It is the folder containing `package.json` and `package-lock.json`.
2. Open a terminal in that folder. On macOS, open Terminal, type `cd ` (including the space), drag the repository folder from Finder into the Terminal window, then press Return. On Windows, open Windows Terminal and type `cd ` followed by the repository folder's path in quotes, then press Return. You can also use your editor's “Open in Terminal” command.
3. Check that Node.js and npm are available:

   ```sh
   node --version
   npm --version
   ```

   Node should report `v20.19.0` or newer. If the command is not found or the version is older, install a current Node.js release, then close and reopen the terminal.
4. Install dependencies once, while online:

   ```sh
   npm ci
   ```

5. Build the standalone page:

   ```sh
   npm run build
   ```

6. Open `enchanter.html` in the top-level repository folder in your browser. After you edit source later, run `npm run build` again, then close and reopen this output file to see the change. There is no automatic reload or background watcher.

Node.js runs the build tool on your computer. The build uses esbuild to combine the TypeScript app, Echo data, styles, and fonts into one HTML file. When you open that file, its JavaScript runs in your browser and draws the animation there; Node.js is no longer running or needed. The generated file is self-contained and can be copied to a USB drive.

If `npm ci` says it cannot find `package.json`, the terminal is in the wrong folder: use the standalone source repository folder that contains `package.json`. If `npm` is not found, install Node.js and reopen the terminal. If the output file is missing, run the build from the repository root and check that it completed. If your change does not appear, make sure you reopened `enchanter.html`, not the source template `apps/standalone/runtime.html`. The builder also writes an identical copy to `apps/standalone/output/enchanter.html`.


Ready to experiment? Follow [Your first Enchanter change](first-change.md).
