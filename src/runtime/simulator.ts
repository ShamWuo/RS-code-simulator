import { performance } from 'node:perf_hooks';
import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari';
import { buildPrelude, DEFAULT_STUBBED_SERVICES } from './prelude';

export interface SimulationChunk {
	code: string;
	chunkName: string;
}

export interface SimulationError {
	message: string;
	chunkName: string;
	line?: number;
	column?: number;
	stack?: string;
	severity: 'error' | 'warning';
}

export interface SimulationResult {
	success: boolean;
	durationMs: number;
	errors: SimulationError[];
	output: string[];
}

export interface SimulationOptions {
	chunk: SimulationChunk;
	prelude?: SimulationChunk;
	preloads?: SimulationChunk[];
	stubbedServices?: readonly string[];
}

function extractErrors(rawMessage: string, fallbackChunk: string): SimulationError[] {
	const trimmed = rawMessage.trim();
	if (!trimmed) {
		return [
			{
				message: 'Unknown error raised by Roblox simulator runtime.',
				chunkName: fallbackChunk,
				severity: 'error'
			}
		];
	}

	const lines = trimmed.split(/\r?\n/);
	const headline = lines[0];
	const stack = lines.slice(1).join('\n');
	const pattern = /^(?:\[string "(?<chunk>[^"]+)"\]|(?<direct>[^:]+)):(?<line>\d+):\s*(?<message>[\s\S]*)$/;
	const match = pattern.exec(headline);

	if (!match || !match.groups) {
		return [
			{
				message: headline,
				stack: stack || undefined,
				chunkName: fallbackChunk,
				severity: 'error'
			}
		];
	}

	const chunkName = (match.groups.chunk ?? match.groups.direct ?? fallbackChunk).replace(/^@/, '');
	const line = Number.parseInt(match.groups.line ?? '1', 10);
	const message = (match.groups.message ?? '').trim() || 'Runtime error';

	return [
		{
			message,
			stack: stack || undefined,
			chunkName,
			line: Number.isNaN(line) ? undefined : line,
			severity: 'error'
		}
	];
}


export class RobloxSimulator {
	public run(options: SimulationOptions): SimulationResult {
		const { chunk, prelude, preloads, stubbedServices } = options;
		const L = lauxlib.luaL_newstate();
		lualib.luaL_openlibs(L);
		const output: string[] = [];

		this.registerLoggingFunction(L, 'print', output);
		this.registerLoggingFunction(L, 'warn', output, '[warn] ');

		const runStart = performance.now();
		const errors: SimulationError[] = [];

		try {
			const preludeError = this.initializePrelude(L, stubbedServices);
			if (preludeError) {
				errors.push(preludeError);
				return {
					success: false,
					durationMs: performance.now() - runStart,
					errors,
					output
				};
			}
			if (prelude) {
				this.executeChunk(L, prelude, errors);
				if (errors.length) {
					return {
						success: false,
						durationMs: performance.now() - runStart,
						errors,
						output
					};
				}
			}

			for (const preload of preloads ?? []) {
				this.executeChunk(L, preload, errors);
				if (errors.length) {
					return {
						success: false,
						durationMs: performance.now() - runStart,
						errors,
						output
					};
				}
			}

			this.executeChunk(L, chunk, errors);

			return {
				success: errors.length === 0,
				durationMs: performance.now() - runStart,
				errors,
				output
			};
		} finally {
			if (typeof lua.lua_close === 'function') {
				lua.lua_close(L);
			}
		}
	}

	private initializePrelude(luaState: any, extraServices: readonly string[] | undefined): SimulationError | undefined {
		const preludeChunk: SimulationChunk = {
			code: buildPrelude(extraServices ?? DEFAULT_STUBBED_SERVICES),
			chunkName: '@roblox-prelude'
		};
		const status = lauxlib.luaL_loadbuffer(luaState, to_luastring(preludeChunk.code), preludeChunk.code.length, to_luastring(preludeChunk.chunkName));
		if (status !== lua.LUA_OK) {
			const message = to_jsstring(lua.lua_tostring(luaState, -1));
			return extractErrors(message, preludeChunk.chunkName)[0];
		}
		const callStatus = lua.lua_pcall(luaState, 0, lua.LUA_MULTRET, 0);
		if (callStatus !== lua.LUA_OK) {
			const message = to_jsstring(lua.lua_tostring(luaState, -1));
			return extractErrors(message, preludeChunk.chunkName)[0];
		}
		return undefined;
	}

	private executeChunk(luaState: any, chunk: SimulationChunk, errors: SimulationError[]): void {
		const status = lauxlib.luaL_loadbuffer(luaState, to_luastring(chunk.code), chunk.code.length, to_luastring(`@${chunk.chunkName}`));
		if (status !== lua.LUA_OK) {
			const message = to_jsstring(lua.lua_tostring(luaState, -1));
			errors.push(...extractErrors(message, chunk.chunkName));
			lua.lua_pop(luaState, 1);
			return;
		}

		const callStatus = lua.lua_pcall(luaState, 0, lua.LUA_MULTRET, 0);
		if (callStatus !== lua.LUA_OK) {
			const message = to_jsstring(lua.lua_tostring(luaState, -1));
			errors.push(...extractErrors(message, chunk.chunkName));
			lua.lua_pop(luaState, 1);
		}
	}

	private registerLoggingFunction(luaState: any, functionName: string, output: string[], prefix = ''): void {
		const logger = (L: any): number => {
			const top = lua.lua_gettop(L);
			const buffer: string[] = [];
			for (let index = 1; index <= top; index += 1) {
				lauxlib.luaL_tolstring(L, index);
				buffer.push(to_jsstring(lua.lua_tostring(L, -1)));
				lua.lua_pop(L, 1);
			}
			output.push(`${prefix}${buffer.join('\t')}`);
			return 0;
		};
		lua.lua_pushcfunction(luaState, logger);
		lua.lua_setglobal(luaState, to_luastring(functionName));
	}
}
