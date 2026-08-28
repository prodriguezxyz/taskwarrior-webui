import assert from 'assert';
import moment from 'moment';
import {
	combineDateTime,
	parseDateInput,
	parseDateTimeInput,
	parseDateToken
} from '../utils/dateParse';
import {
	applyQuickAddOverrides,
	durationIsoToMinutes,
	durationMinutesToIso,
	parseQuickAdd
} from '../utils/quickAddParse';

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

const validPartialNumericDates: Array<[string, string]> = [
	['29/8', '2026-08-29'],
	['29-8', '2026-08-29'],
	['21/7', '2026-07-21'],
	['1/2', '2027-02-01'],
	['29/2', '2028-02-29']
];

for (const [input, expected] of validPartialNumericDates) {
	assert.strictEqual(parseDateToken(input), expected, input);
	assert.strictEqual(parseDateInput(input), expected, input);
}

const invalidNumericDates = [
	'00/01/2027',
	'01/00/2027',
	'29/02/2027',
	'31/04/2027',
	'12/31/2027',
	'31/4',
	'12/31',
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
assert.deepStrictEqual(parseQuickAdd('Preparar informe #trabajo +pedro mañana'), {
	description: 'Preparar informe',
	project: 'trabajo',
	assignee: 'pedro',
	tags: [],
	due: '2026-07-22'
});
assert.deepStrictEqual(parseQuickAdd('Revisar contrato +pedro@example.com @legal p1'), {
	description: 'Revisar contrato',
	assignee: 'pedro@example.com',
	tags: ['legal'],
	priority: 'H'
});
assert.deepStrictEqual(parseQuickAdd('Revisar contrato +ana+tasks@example.com'), {
	description: 'Revisar contrato',
	assignee: 'ana+tasks@example.com',
	tags: []
});
assert.deepStrictEqual(parseQuickAdd('Revisar estimación +3d'), {
	description: 'Revisar estimación',
	tags: [],
	due: '2026-07-24'
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
assert.deepStrictEqual(parseQuickAdd('Revisar informe 29/8'), {
	description: 'Revisar informe',
	tags: [],
	due: '2026-08-29'
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
assert.deepStrictEqual(parseQuickAdd('Enviar parte cada lunes a las 9'), {
	description: 'Enviar parte',
	tags: [],
	due: '2026-07-27T09:00:00+02:00',
	recur: 'weekly'
});
assert.deepStrictEqual(parseQuickAdd('Revisar objetivos cada dos semanas %trabajo'), {
	description: 'Revisar objetivos',
	tags: ['trabajo'],
	due: '2026-07-21',
	recur: '2weeks'
});
const weekdayNow = moment.now;
moment.now = () => Date.UTC(2026, 6, 25, 12, 0, 0);
assert.deepStrictEqual(parseQuickAdd('Procesar bandeja cada laborable'), {
	description: 'Procesar bandeja',
	tags: [],
	due: '2026-07-27',
	recur: 'weekdays'
});
moment.now = weekdayNow;
assert.deepStrictEqual(parseQuickAdd('Preparar informe mensual'), {
	description: 'Preparar informe',
	tags: [],
	due: '2026-07-21',
	recur: 'monthly'
});
assert.deepStrictEqual(parseQuickAdd('Preparar informe mensual', {
	parseDates: false,
	parseRecurrences: false
}), {
	description: 'Preparar informe mensual',
	tags: []
});
assert.deepStrictEqual(parseQuickAdd('Tarea cada fin de semana'), {
	description: 'Tarea',
	tags: [],
	due: '2026-07-25',
	recur: 'weekly'
});
assert.deepStrictEqual(parseQuickAdd('Tarea cada fin de semana', { parseRecurrences: false }), {
	description: 'Tarea cada fin de semana',
	tags: []
});
assert.deepStrictEqual(parseQuickAdd('Tarea cada trimestre'), {
	description: 'Tarea',
	tags: [],
	due: '2026-07-21',
	recur: 'quarterly'
});
assert.deepStrictEqual(parseQuickAdd('Tarea quincenal'), {
	description: 'Tarea',
	tags: [],
	due: '2026-07-21',
	recur: 'biweekly'
});
assert.deepStrictEqual(parseQuickAdd('Tarea cada semana empezando 29/8 hasta 31/12'), {
	description: 'Tarea',
	tags: [],
	due: '2026-08-29',
	until: '2026-12-31',
	recur: 'weekly'
});
assert.deepStrictEqual(parseQuickAdd('Tarea mensual hasta 31/12'), {
	description: 'Tarea',
	tags: [],
	due: '2026-07-21',
	until: '2026-12-31',
	recur: 'monthly'
});
assert.deepStrictEqual(parseQuickAdd('Tarea cada semana empezando 31/12 hasta 29/8'), {
	description: 'Tarea cada semana empezando 31/12 hasta 29/8',
	tags: [],
	recurrenceError: 'unsupported'
});
for (const ambiguous of [
	'cada semana empezando 29/8 empezando 30/8',
	'mensual hasta 31/12 hasta 30/11'
]) {
	assert.deepStrictEqual(parseQuickAdd(`Tarea ${ambiguous}`), {
		description: `Tarea ${ambiguous}`,
		tags: [],
		recurrenceError: 'unsupported'
	}, ambiguous);
}
for (const unsupported of [
	'every other Tuesday',
	'every last Friday',
	'cada próximo lunes',
	'cada primer miércoles',
	'every 2nd Monday'
]) {
	assert.deepStrictEqual(parseQuickAdd(`Tarea ${unsupported}`), {
		description: `Tarea ${unsupported}`,
		tags: [],
		recurrenceError: 'unsupported'
	}, unsupported);
}
assert.deepStrictEqual(parseQuickAdd('Tarea every day every week'), {
	description: 'Tarea',
	tags: [],
	due: '2026-07-21',
	recur: 'daily',
	recurrenceError: 'ambiguous'
});
assert.deepStrictEqual(parseQuickAdd('Tarea every day every week', { parseRecurrences: false }), {
	description: 'Tarea every day every week',
	tags: []
});
assert.deepStrictEqual(parseQuickAdd('Tarea mañana cada lunes', { parseDates: false }), {
	description: 'Tarea mañana',
	tags: [],
	due: '2026-07-27',
	recur: 'weekly'
});
assert.deepStrictEqual(parseQuickAdd('Tarea every day tomorrow', { parseRecurrences: false }), {
	description: 'Tarea every day',
	tags: [],
	due: '2026-07-22'
});
assert.deepStrictEqual(parseQuickAdd('Añadir 1/2 taza de agua'), {
	description: 'Añadir 1/2 taza de agua',
	tags: []
});
assert.deepStrictEqual(parseQuickAdd('Preparar reunión 1/2'), {
	description: 'Preparar reunión',
	tags: [],
	due: '2027-02-01'
});
assert.deepStrictEqual(parseQuickAdd('Preparar reunión 1/2 #trabajo %agenda p2'), {
	description: 'Preparar reunión',
	project: 'trabajo',
	tags: ['agenda'],
	priority: 'M',
	due: '2027-02-01'
});
assert.deepStrictEqual(parseQuickAdd('Presentar informe {29/8}'), {
	description: 'Presentar informe',
	tags: [],
	due: '2026-08-29'
});
assert.deepStrictEqual(parseQuickAdd('Presentar informe mañana {29/8}'), {
	description: 'Presentar informe',
	tags: [],
	dateError: 'ambiguous'
});
assert.deepStrictEqual(parseQuickAdd('Reunión mañana 10:00 !30mb durante 1h15m'), {
	description: 'Reunión',
	tags: [],
	due: '2026-07-22T10:00:00+02:00',
	reminder: '2026-07-22T09:30:00+02:00',
	durationMinutes: 75
});
assert.deepStrictEqual(parseQuickAdd('Llamar !3pm'), {
	description: 'Llamar',
	tags: [],
	reminder: '2026-07-21T15:00:00+02:00'
});
assert.deepStrictEqual(parseQuickAdd('Descansar !2h'), {
	description: 'Descansar',
	tags: [],
	reminder: '2026-07-21T16:00:00+02:00'
});
assert.deepStrictEqual(parseQuickAdd('Tarea !30mb'), {
	description: 'Tarea',
	tags: [],
	_reminderBeforeMinutes: 30,
	reminderError: 'unsupported'
});
assert.deepStrictEqual(
	applyQuickAddOverrides(parseQuickAdd('Tarea !30mb'), {
		scheduled: '2026-07-22T10:00:00+02:00'
	}),
	{
		description: 'Tarea',
		tags: [],
		scheduled: '2026-07-22T10:00:00+02:00',
		reminder: '2026-07-22T09:30:00+02:00'
	}
);
assert.deepStrictEqual(
	applyQuickAddOverrides(parseQuickAdd('Tarea mañana 10:00 !30mb'), {
		scheduled: '2026-07-22'
	}),
	{
		description: 'Tarea',
		tags: [],
		due: '2026-07-22T10:00:00+02:00',
		scheduled: '2026-07-22',
		reminder: '2026-07-22T09:30:00+02:00'
	}
);
assert.deepStrictEqual(parseQuickAdd('Tarea !algo'), {
	description: 'Tarea !algo',
	tags: [],
	reminderError: 'unsupported'
});
assert.deepStrictEqual(parseQuickAdd('Tarea durante 20 minutos for 1h'), {
	description: 'Tarea',
	tags: [],
	durationMinutes: 20,
	durationError: 'ambiguous'
});
assert.strictEqual(durationMinutesToIso(75), 'PT1H15M');
assert.strictEqual(durationMinutesToIso(120), 'PT2H');
assert.throws(() => durationMinutesToIso(-1), /between 1 and 1440/);
assert.throws(() => durationMinutesToIso(1441), /between 1 and 1440/);
assert.throws(() => durationMinutesToIso(1.5), /whole number/);
assert.strictEqual(durationIsoToMinutes('PT1H15M'), 75);
assert.strictEqual(durationIsoToMinutes(4500), 75);
assert.deepStrictEqual(
	applyQuickAddOverrides(parseQuickAdd('Tarea today tomorrow p1'), {
		due: '2026-07-24',
		priority: null
	}),
	{
		description: 'Tarea',
		tags: [],
		due: '2026-07-24'
	}
);
assert.deepStrictEqual(
	applyQuickAddOverrides(parseQuickAdd('Tarea every day every week'), {
		recurrence: { recur: 'monthly', due: '2026-08-01' }
	}),
	{
		description: 'Tarea',
		tags: [],
		due: '2026-08-01',
		recur: 'monthly'
	}
);
assert.deepStrictEqual(
	applyQuickAddOverrides(parseQuickAdd('Tarea mañana', { parseDates: false }), {
		due: '2026-07-24',
		scheduled: '2026-07-23'
	}),
	{
		description: 'Tarea mañana',
		tags: [],
		due: '2026-07-24',
		scheduled: '2026-07-23'
	}
);
assert.deepStrictEqual(
	applyQuickAddOverrides(parseQuickAdd('Tarea every day', { parseRecurrences: false }), {
		recurrence: { recur: 'monthly', due: '2026-08-01' }
	}),
	{
		description: 'Tarea every day',
		tags: [],
		due: '2026-08-01',
		recur: 'monthly'
	}
);

console.log('date parser tests passed');
