import assert from 'assert';
import moment from 'moment';
import {
	combineDateTime,
	parseDateInput,
	parseDateTimeInput,
	parseDateToken
} from '../utils/dateParse';
import { parseQuickAdd } from '../utils/quickAddParse';

moment.now = () => Date.UTC(2026, 6, 21, 12, 0, 0);

const validNumericDates: Array<[string, string]> = [
	['1/2/2027', '2027-02-01'],
	['01/02/2027', '2027-02-01'],
	['1-2-2027', '2027-02-01'],
	['01-02-2027', '2027-02-01'],
	['29/02/2028', '2028-02-29'],
	['31-12-2027', '2027-12-31'],
	['2027-02-01', '2027-02-01']
];

for (const [input, expected] of validNumericDates) {
	assert.strictEqual(parseDateToken(input), expected, input);
	assert.strictEqual(parseDateInput(input), expected, input);
}

const invalidNumericDates = [
	'00/01/2027',
	'01/00/2027',
	'29/02/2027',
	'31/04/2027',
	'12/31/2027',
	'01/02-2027',
	'01.02.2027',
	'01/02/27'
];

for (const input of invalidNumericDates) {
	assert.strictEqual(parseDateToken(input), undefined, input);
	assert.strictEqual(parseDateInput(input), undefined, input);
}

const relativeDates: Array<[string, string]> = [
	['en 2 semanas', '2026-08-04'],
	['dentro de dos semanas', '2026-08-04'],
	['in two weeks', '2026-08-04'],
	['in twenty-two days', '2026-08-12'],
	['en treinta y un días', '2026-08-21']
];

for (const [input, expected] of relativeDates) {
	assert.strictEqual(parseDateInput(input), expected, input);
}

const punctuatedDates: Array<[string, string]> = [
	['mañana,', '2026-07-22'],
	['tomorrow.', '2026-07-22'],
	['(21/07/2026)', '2026-07-21'],
	['en 2 semanas,', '2026-08-04']
];

for (const [input, expected] of punctuatedDates) {
	assert.strictEqual(parseDateInput(input), expected, input);
}

assert.strictEqual(parseDateInput('próximo lunes'), '2026-07-27');
assert.strictEqual(parseDateInput('next monday'), '2026-07-27');

for (const input of ['en -2 semanas', 'en +2 semanas', 'en 0 días', 'en 2.5 días', 'en dos cosas']) {
	assert.strictEqual(parseDateInput(input), undefined, input);
}

assert.strictEqual(parseDateToken('+2w'), '2026-08-04');
assert.strictEqual(parseDateToken('+0d'), undefined);
assert.strictEqual(parseDateToken('+999999999999999999999d'), undefined);

assert.strictEqual(
	parseDateTimeInput('01-02-2027', undefined, { hours: 15, minutes: 30 })?.due,
	'2027-02-01T15:30:00+01:00'
);
assert.strictEqual(
	parseDateTimeInput('01/02/2027 a las 9:05', undefined, { hours: 15, minutes: 30 })?.due,
	'2027-02-01T09:05:00+01:00'
);
assert.strictEqual(combineDateTime('2026-07-22', { hours: 9, minutes: 15 }), '2026-07-22T09:15:00+02:00');
assert.strictEqual(
	moment(combineDateTime('2026-07-22', { hours: 9, minutes: 15 })).utc().format('YYYYMMDD[T]HHmmss[Z]'),
	'20260722T071500Z'
);
assert.strictEqual(parseDateTimeInput('en -2 semanas'), undefined);
assert.strictEqual(parseDateInput('mañana viernes'), undefined);
assert.deepStrictEqual(parseDateTimeInput('21/07/2026 22/07/2026'), { error: 'ambiguous-date' });
assert.strictEqual(parseDateTimeInput('tomorrow mañana')?.due, '2026-07-22');

assert.deepStrictEqual(parseQuickAdd('Comprar pan mañana, #casa @recado p2'), {
	description: 'Comprar pan',
	project: 'casa',
	tags: ['recado'],
	priority: 'M',
	due: '2026-07-22'
});
assert.deepStrictEqual(parseQuickAdd('Llamar mañana a las 5 de la tarde.'), {
	description: 'Llamar',
	tags: [],
	due: '2026-07-22T17:00:00+02:00'
});
assert.deepStrictEqual(parseQuickAdd('Revisar 31/02/2027'), {
	description: 'Revisar 31/02/2027',
	tags: []
});
assert.deepStrictEqual(parseQuickAdd('Comprar por la mañana'), {
	description: 'Comprar por la mañana',
	tags: []
});
assert.deepStrictEqual(parseQuickAdd('Tarea mañana viernes'), {
	description: 'Tarea',
	tags: [],
	dateError: 'ambiguous'
});
assert.deepStrictEqual(parseQuickAdd('Tarea tomorrow mañana'), {
	description: 'Tarea',
	tags: [],
	due: '2026-07-22'
});

console.log('date parser tests passed');
