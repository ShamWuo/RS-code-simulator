import * as assert from 'assert';
import { RobloxSimulator } from '../runtime/simulator';

suite('Roblox simulator runtime', () => {
	test('executes simple script and captures output', () => {
		const simulator = new RobloxSimulator();
		const result = simulator.run({
			chunk: {
				code: 'print("hello", "world")',
				chunkName: 'test-output'
			}
		});
		assert.strictEqual(result.success, true);
		assert.deepStrictEqual(result.errors, []);
		assert.ok(result.output.some((line) => line.includes('hello')));
	});

	test('reports runtime errors with line information', () => {
		const simulator = new RobloxSimulator();
		const result = simulator.run({
			chunk: {
				code: 'local x = nil\nprint(x.y)',
				chunkName: 'test-error'
			}
		});
		assert.strictEqual(result.success, false);
		assert.ok(result.errors.length > 0);
		const [error] = result.errors;
		assert.strictEqual(error.chunkName.includes('test-error'), true);
		assert.strictEqual(typeof error.line, 'number');
	});
});
