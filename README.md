# RS Code Simulator

Run Roblox Luau scripts without leaving VS Code. The RS Code Simulator extension spins up a lightweight headless runtime (powered by the Fengari Lua VM) with Roblox-flavoured service stubs so you can validate business logic, surface runtime errors, and keep continuous feedback while iterating on experiences.

## Features

- Run the active Luau file via the command palette (`Roblox: Run Current Script`).
- Execute every Luau file in the workspace (`Roblox: Run Workspace Scripts`) for quick regression checks.
- Capture `print`/`warn` output in a dedicated output channel with per-file headers and timing information.
- Emit diagnostics inside the editor with clickable locations for runtime and syntax errors.
- Stub common Roblox services (`game:GetService`) so scripts that depend on engine objects can execute without crashing.
- Optionally preload shared bootstrap scripts before running your code.
- Opt-in auto-run on save for instant feedback loops.

## Requirements

- Node.js 18 or later (required by VS Code extension tooling and Fengari).
- The project targets Luau syntax. Core Roblox APIs are mocked; engine-specific behaviour (physics, replication, rendering, etc.) is not simulated. For code that depends on these features, provide your own preload scripts with mocks.

## Usage

1. Open a folder that contains your Roblox project files (`*.lua`/`*.luau`).
2. Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Choose `Roblox: Run Current Script` to execute the active editor document.
4. Review diagnostics directly in the editor and inspect captured output in the **Roblox Headless Runner** output channel.
5. Use `Roblox: Run Workspace Scripts` to iterate across the entire project when you need broader coverage.

### Auto-run on Save

Enable `Roblox Simulator › Runtime: Run On Save` in Settings to automatically re-run the simulator whenever a Luau file is saved.

## Extension Settings

This extension contributes the following settings (command palette → `Preferences: Open Settings (UI)` and search for "Roblox Simulator"):

- `rs-code-simulator.runtime.stubbedServices`: List of Roblox services to expose as simple mock tables. Defaults to common services (
	`Players`, `ReplicatedStorage`, `ServerScriptService`, `StarterPlayer`, `Lighting`, `CollectionService`, `PathfindingService`, `RunService`).
- `rs-code-simulator.runtime.preloadScripts`: Array of Luau files that should run before each simulation. Paths may be absolute, workspace-relative, or relative to the active file.
- `rs-code-simulator.runtime.showOutputOnSuccess`: When **true**, the output channel is revealed after successful runs that produced output.
- `rs-code-simulator.runtime.runOnSave`: Execute the simulator automatically whenever a Luau file is saved.

## Limitations

- The simulator provides mocked Roblox services. Behaviour beyond what is defined in the mocks is a no-op, so engine-side features (e.g. physics or networking) will not execute.
- Infinite loops cannot be interrupted; make sure your code yields when necessary.
- Luau-specific type checking beyond what Fengari/Lua supports is not available. Consider combining this extension with Roblox's Luau type checker for static analysis.

## Release Notes

### 0.0.1

- Initial release with headless script execution, diagnostics, workspace runner, and configurable stubs.

---

Feedback and ideas to improve the simulation fidelity are always welcome.

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).
See `LICENSE` and `LICENSE_CC-BY-NC-4.0.txt` for details. The license allows sharing and adaptation for non-commercial purposes with attribution.

## Packaging & Publishing

1. Ensure you are signed in with a Visual Studio Marketplace publisher ID and have the `vsce` CLI installed (`npm install -g @vscode/vsce`).
2. Update `package.json` with your real `publisher`, `repository`, and `bugs` URLs.
3. Run `npm install`, then `npm run compile`, and confirm `npm run lint` succeeds.
4. Generate a `.vsix` bundle locally with `vsce package`.
5. Publish the extension using `vsce publish` (requires a Personal Access Token with Marketplace scopes) or upload the generated package through the Marketplace portal.
