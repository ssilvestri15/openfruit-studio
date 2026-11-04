# OpenFruit Studio development

OpenFruit Studio is an Electron IDE for iOS projects on Windows.

## Workspaces and Xcode projects

- The filesystem bridge authorizes paths per window. Select folders through the native dialog. Git, OpenFruit, and the shell run with the user's permissions.
- Saves verify the file revision on disk. If another application changes the file, Studio preserves the editor buffer and offers a comparison, merge, or recovery copy.
- The interactive terminal uses ConPTY. The Windows package unpacks `node-pty` from ASAR so Electron can load the native module.
- The navigator shows each `.xcodeproj` as one entry. The Xcode editor saves changes to the original `project.pbxproj` and manages configurations, targets, dependencies, and build phases. For projects without an Xcode project, Studio stores build preferences in `.openfruit-studio.json`.

## OpenFruit integration

Studio looks for the CLI in `OPENFRUIT_BIN`, then in `OPENFRUIT_HOME/bin/openfruit.exe`, and finally in `%LOCALAPPDATA%/OPENFRUIT/bin/openfruit.exe`.

- **Discovery.** The `capabilities` command returns a schema 2 snapshot. Its `implemented`, `unavailable`, and `unsupported` values describe the available prerequisites. The engine validates each project's build separately.
- **Devices.** The `devices --json` command lists devices. Studio preserves the selection by UDID across scans and leaves the iOS version unspecified when it is unavailable.
- **Build and deployment.** Studio saves modified files and invokes `build <projectPath> --configuration <configuration> --diagnostics=json`. For a selected device with deployment support, Studio adds `--deploy --udid <udid>`. OpenFruit uses its native installation service, as it does for `openfruit device install`.
- **Progress and diagnostics.** The CLI emits JSON Lines using a schema 1 envelope. The Build button reflects `build.progress` and `deploy.progress` events. The Output panel displays the final IPA and bundle ID from `task.completed`, expandable JSON details, and text output. File diagnostics appear in Problems alongside diagnostics from SourceKit-LSP.
- **Exit and cancellation.** The process exit code determines the result. Deployment installs the app on the device. Each Studio window receives its own command output. On Windows, Stop terminates the process tree with `taskkill /T /F`.
- **Live preview.** The canvas requires a connected iPhone and a build with the preview agent. See [OpenFruit integration in the README](../README.md#how-it-talks-to-openfruit).

Studio uses the CLI for engine operations. The current engine contract marks `ide_operation_adapter` as unsupported, and IDE debugging is unavailable.

## Develop and test

```powershell
npm ci
npm run build
npm start
```

- `npm run lint` checks TypeScript without emitting files.
- `npm test` runs the test suite. `npm run test:local` runs service and contract tests without downloading SDKs or building iOS apps.
- `npm run test:media-ui` checks Git commit comparisons, images, and SVG in an isolated offscreen Electron window served by Vite.
- `npm run test:desktop` requires a build and an OpenFruit installation. It checks the renderer, preload, IPC, and CLI integration in a temporary session. Protocol tests also cover compiler proxy diagnostics when Clang is installed.
- `npm run test:packaged` verifies that the packaged app matches the current build and that Electron can load the packaged ConPTY dependencies.

See the [Windows release instructions](../README.md#publish-a-windows-release) for packaging and publishing.
