import * as path from 'node:path';
import * as vscode from 'vscode';
import { RobloxSimulator, SimulationResult, SimulationChunk } from './runtime/simulator';
import { DEFAULT_STUBBED_SERVICES } from './runtime/prelude';

const simulator = new RobloxSimulator();
let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
	output = vscode.window.createOutputChannel('Roblox Headless Runner');
	const diagnostics = vscode.languages.createDiagnosticCollection('rs-code-simulator');
	context.subscriptions.push(output, diagnostics);

	context.subscriptions.push(
		vscode.commands.registerCommand('rs-code-simulator.runCurrentFile', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				void vscode.window.showWarningMessage('Open a Luau file before running the Roblox simulator.');
				return;
			}
			if (!isLuauDocument(editor.document)) {
				void vscode.window.showWarningMessage('The Roblox simulator only runs on Luau or Lua files.');
				return;
			}
			await simulateDocument(editor.document, diagnostics, 'single');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rs-code-simulator.runWorkspace', async () => {
			const candidateFiles = await vscode.workspace.findFiles('**/*.{lua,luau}', '**/{node_modules,dist,out,build}/**');
			if (candidateFiles.length === 0) {
				void vscode.window.showInformationMessage('No Luau files found to execute.');
				return;
			}
			let failed = 0;
			diagnostics.clear();
			for (const uri of candidateFiles) {
				const document = await vscode.workspace.openTextDocument(uri);
				const result = await simulateDocument(document, diagnostics, 'batch');
				if (!result.success) {
					failed += 1;
				}
			}
			const summary = failed === 0
				? 'Roblox workspace simulation completed without runtime errors.'
				: `Roblox workspace simulation found issues in ${failed} file${failed === 1 ? '' : 's'}.`;
			output.appendLine(summary);
			if (failed === 0) {
				vscode.window.setStatusBarMessage(summary, 4000);
			} else {
				void vscode.window.showErrorMessage(summary);
				output.show(true);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(async (doc) => {
			if (!isLuauDocument(doc)) {
				return;
			}
			const config = vscode.workspace.getConfiguration('rs-code-simulator', doc.uri);
			const runOnSave = config.get<boolean>('runtime.runOnSave', false);
			if (!runOnSave) {
				return;
			}
			await simulateDocument(doc, diagnostics, 'save');
		})
	);
}

export function deactivate(): void {
	// Resources are disposed by VS Code subscription lifecycle.
}

type SimulationMode = 'single' | 'batch' | 'save';

async function simulateDocument(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, mode: SimulationMode): Promise<SimulationResult> {
	const configuration = vscode.workspace.getConfiguration('rs-code-simulator', document.uri);
	const stubbedServices = configuration.get<string[]>('runtime.stubbedServices') ?? DEFAULT_STUBBED_SERVICES;
	const preloadEntries = configuration.get<string[]>('runtime.preloadScripts') ?? [];
	const showOutputOnSuccess = configuration.get<boolean>('runtime.showOutputOnSuccess', mode === 'single');

	const { chunks: preloads, missing } = await resolvePreloadChunks(preloadEntries, document);
	if (missing.length > 0) {
		output.appendLine(`[${document.fileName}] Missing preload scripts: ${missing.join(', ')}`);
		if (mode === 'single') {
			void vscode.window.showWarningMessage(`Roblox simulator skipped missing preload scripts: ${missing.join(', ')}`);
		}
	}

	const chunk: SimulationChunk = {
		code: document.getText(),
		chunkName: getChunkName(document)
	};

	let result: SimulationResult;
	try {
		result = simulator.run({
			chunk,
			preloads,
			stubbedServices
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		result = {
			success: false,
			durationMs: 0,
			errors: [
				{
					message,
					chunkName: chunk.chunkName,
					severity: 'error'
				}
			],
			output: []
		};
	}

	applyDiagnostics(document, diagnostics, result);
	logResult(document, result, { mode, showOutputOnSuccess });
	return result;
}

function applyDiagnostics(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, result: SimulationResult): void {
	const relevantErrors = result.errors.filter((error) => equalsPath(error.chunkName, getChunkName(document)));
	if (relevantErrors.length === 0) {
		diagnostics.set(document.uri, []);
		return;
	}
	const mapped = relevantErrors.map((error) => {
		const zeroIndexedLine = clampToDocument(document, (error.line ?? 1) - 1);
		const line = document.lineAt(zeroIndexedLine);
		const range = new vscode.Range(zeroIndexedLine, 0, zeroIndexedLine, line.range.end.character);
		const severity = error.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
		const diagnostic = new vscode.Diagnostic(range, error.message, severity);
		diagnostic.source = 'Roblox simulator';
		return diagnostic;
	});
	diagnostics.set(document.uri, mapped);
}

function logResult(document: vscode.TextDocument, result: SimulationResult, options: { mode: SimulationMode; showOutputOnSuccess: boolean }): void {
	const header = `[${document.fileName}]`;
	const duration = `${Math.round(result.durationMs)}ms`;
	if (result.output.length > 0) {
		output.appendLine(`${header} Output (${duration}):`);
		for (const line of result.output) {
			output.appendLine(`  ${line}`);
		}
	}
	if (!result.success) {
		output.appendLine(`${header} Errors (${duration}):`);
		for (const error of result.errors) {
			output.appendLine(`  [${error.chunkName}] ${error.message}`);
			if (error.stack) {
				output.appendLine(`    ${error.stack}`);
			}
		}
		void vscode.window.showErrorMessage(`Roblox simulation failed for ${path.basename(document.fileName)}. See the output channel for details.`);
		output.show(true);
		return;
	}

	if (options.mode === 'single') {
		const message = `Roblox simulation succeeded for ${path.basename(document.fileName)} in ${duration}.`;
		vscode.window.setStatusBarMessage(message, 4000);
		if (options.showOutputOnSuccess && result.output.length > 0) {
			output.show(true);
		}
	}
}

function equalsPath(left: string, right: string): boolean {
	const normalLeft = normalizePath(left);
	const normalRight = normalizePath(right);
	return normalLeft === normalRight;
}

function normalizePath(value: string): string {
	const normalized = path.normalize(value);
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function clampToDocument(document: vscode.TextDocument, line: number): number {
	if (line < 0) {
		return 0;
	}
	if (line >= document.lineCount) {
		return document.lineCount - 1;
	}
	return line;
}

function isLuauDocument(document: vscode.TextDocument): boolean {
	const languageId = document.languageId.toLowerCase();
	return languageId === 'lua' || languageId === 'luau';
}

function getChunkName(document: vscode.TextDocument): string {
	if (document.uri.scheme === 'file') {
		return document.uri.fsPath;
	}
	return document.fileName;
}

async function resolvePreloadChunks(entries: readonly string[], document: vscode.TextDocument): Promise<{ chunks: SimulationChunk[]; missing: string[] }> {
	const chunks: SimulationChunk[] = [];
	const missing: string[] = [];
	const docFolder = document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : undefined;
	const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

	for (const rawEntry of entries) {
		const entry = rawEntry.trim();
		if (!entry) {
			continue;
		}
		const candidateUris: vscode.Uri[] = [];
		if (path.isAbsolute(entry)) {
			candidateUris.push(vscode.Uri.file(entry));
		} else {
			if (docFolder) {
				candidateUris.push(vscode.Uri.file(path.join(docFolder, entry)));
			}
			for (const folder of workspaceFolders) {
				candidateUris.push(vscode.Uri.joinPath(folder.uri, entry));
			}
		}
		let resolvedContent: Uint8Array | undefined;
		let resolvedUri: vscode.Uri | undefined;
		for (const candidate of candidateUris) {
			try {
				resolvedContent = await vscode.workspace.fs.readFile(candidate);
				resolvedUri = candidate;
				break;
			} catch (error) {
				// Ignore and try the next candidate source.
			}
		}
		if (!resolvedContent || !resolvedUri) {
			missing.push(entry);
			continue;
		}
		chunks.push({
			code: Buffer.from(resolvedContent).toString('utf8'),
			chunkName: resolvedUri.fsPath
		});
	}

	return { chunks, missing };
}
