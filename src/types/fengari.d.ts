declare module 'fengari' {
	const lua: any;
	const lauxlib: any;
	const lualib: any;
	const to_luastring: (input: string, encoding?: string) => any;
	const to_jsstring: (input: any) => string;
	export { lua, lauxlib, lualib, to_luastring, to_jsstring };
}
