import assert from 'assert';
import { buildQuickAddAnnotations } from '../utils/quickAddAnnotations';

const entry = '2026-07-25T15:30:00.000Z';

assert.deepStrictEqual(buildQuickAddAnnotations('', entry), []);
assert.deepStrictEqual(buildQuickAddAnnotations(' \n\t ', entry), []);
assert.deepStrictEqual(buildQuickAddAnnotations('  Contexto adicional  ', entry), [{
	entry,
	description: 'Contexto adicional'
}]);
assert.deepStrictEqual(buildQuickAddAnnotations('  Primera línea\nSegunda línea  ', entry), [{
	entry,
	description: 'Primera línea\nSegunda línea'
}]);

console.log('quick add annotation tests passed');
