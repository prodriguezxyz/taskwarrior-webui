import assert from 'assert';
import {
	composeQuickAddBatch,
	composeQuickAddSingle,
	quickAddBatchUuid,
	quickAddPasteLines
} from '../utils/quickAddBatch';

assert.strictEqual(
	quickAddBatchUuid(new Uint8Array(16)),
	'00000000-0000-4000-8000-000000000000'
);
assert.throws(() => quickAddBatchUuid(new Uint8Array(15)), /exactly 16 bytes/);

const lines = quickAddPasteLines('- Comprar leche\r\n2. Llamar al banco\n\n• Preparar informe');
assert.deepStrictEqual(lines, ['Comprar leche', 'Llamar al banco', 'Preparar informe']);
assert.deepStrictEqual(composeQuickAddBatch('#Casa ', 6, 6, lines), [
	'#Casa Comprar leche',
	'#Casa Llamar al banco',
	'#Casa Preparar informe'
]);
assert.deepStrictEqual(composeQuickAddBatch('Antes seleccionado después', 6, 18, ['uno', 'dos']), [
	'Antes uno después',
	'Antes dos después'
]);
assert.strictEqual(
	composeQuickAddSingle('Antes seleccionado después', 6, 18, ['uno', 'dos']),
	'Antes uno; dos después'
);

console.log('quick add batch tests passed');
