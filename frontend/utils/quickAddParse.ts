import moment from 'moment';
import {
	applyDayPart,
	combineDateTime,
	dayPartOf,
	deaccent,
	isTimeLike,
	mergeDateTimePhrases,
	parseBareHour,
	parseDateInput,
	parseDateToken,
	parseRecurrencePhrase,
	parseTimeToken,
	trimTokenPunctuation
} from './dateParse';

const PRIORITY_MAP: Record<string, 'H' | 'M' | 'L' | undefined> = {
	'1': 'H',
	'2': 'M',
	'3': 'L',
	'4': undefined
};

export interface ParsedQuickAdd {
	description: string;
	project?: string;
	assignee?: string;
	tags: string[];
	priority?: 'H' | 'M' | 'L';
	due?: string;
	scheduled?: string;
	until?: string;
	recur?: string;
	reminder?: string;
	_reminderBeforeMinutes?: number;
	durationMinutes?: number;
	dateError?: 'ambiguous';
	recurrenceError?: 'ambiguous' | 'unsupported';
	reminderError?: 'ambiguous' | 'unsupported';
	durationError?: 'ambiguous';
}

export interface QuickAddParseOptions {
	parseDates?: boolean;
	parseRecurrences?: boolean;
}

export interface QuickAddOverrides {
	priority?: 'H' | 'M' | 'L' | null;
	due?: string;
	scheduled?: string;
	recurrence?: { recur: string, due: string, until?: string };
}

export function applyQuickAddOverrides(
	parsed: ParsedQuickAdd,
	overrides: QuickAddOverrides
): ParsedQuickAdd {
	const result: ParsedQuickAdd = { ...parsed, tags: [...parsed.tags] };
	if (Object.prototype.hasOwnProperty.call(overrides, 'priority')) {
		if (overrides.priority === null) delete result.priority;
		else result.priority = overrides.priority;
	}
	if (overrides.recurrence) {
		result.recur = overrides.recurrence.recur;
		result.due = overrides.recurrence.due;
		if (overrides.recurrence.until) result.until = overrides.recurrence.until;
		delete result.dateError;
		delete result.recurrenceError;
	}
	if (overrides.due) {
		result.due = overrides.due;
		delete result.dateError;
	}
	if (overrides.scheduled) result.scheduled = overrides.scheduled;
	if (result._reminderBeforeMinutes) {
		const reminderBase = [result.scheduled, result.due]
			.find(value => value && /T\d{2}:\d{2}/.test(value));
		if (reminderBase) {
			result.reminder = moment(reminderBase)
				.subtract(result._reminderBeforeMinutes, 'minutes')
				.format('YYYY-MM-DDTHH:mm:ssZ');
			delete result.reminderError;
			delete result._reminderBeforeMinutes;
		}
	}
	return result;
}

function unsupportedRecurrenceLength(tokens: string[], index: number): number {
	const prefix = deaccent(trimTokenPunctuation(tokens[index] ?? '').toLowerCase());
	if (prefix !== 'cada' && prefix !== 'every') return 0;
	const first = deaccent(trimTokenPunctuation(tokens[index + 1] ?? '').toLowerCase());
	// Keep common Todoist-style recurrence variants intact when we cannot map
	// them safely to Taskwarrior yet. Otherwise the weekday at the end would be
	// consumed as a one-off date and the task title would be silently altered.
	const modifiers = new Set([
		'other', 'otro', 'otra',
		'last', 'ultimo', 'ultima',
		'first', 'primer', 'primero', 'primera',
		'next', 'proximo', 'proxima'
	]);
	const second = deaccent(trimTokenPunctuation(tokens[index + 2] ?? '').toLowerCase());
	if (modifiers.has(first) && second) return 3;
	if (/^(?:\d+(?:st|nd|rd|th)?|segundo|segunda|tercer|tercero|tercera|cuarto|cuarta)$/.test(first) && second) {
		return 3;
	}
	return 0;
}

function shouldParsePartialNumericDate(tokens: string[], index: number, token: string): boolean {
	const match = /^(\d{1,2})[\/-](\d{1,2})$/.exec(token);
	if (!match) return true;
	const day = Number(match[1]);
	if (day > 12 || match[1].length === 2 || match[2].length === 2) return true;
	// Ambiguous forms such as "1/2" are dates at the end of Quick Add, but stay
	// prose in "add 1/2 cup". Metadata after the date does not make it prose.
	return tokens.slice(index + 1).every(next =>
		/^(?:[#@%+][\p{L}\p{N}_.@+-]*|p[1-4])$/iu.test(trimTokenPunctuation(next))
	);
}

type ReminderSpec =
	| { kind: 'absolute', value: string }
	| { kind: 'relative', minutes: number }
	| { kind: 'before', minutes: number };

function parseReminderToken(token: string): ReminderSpec | undefined {
	if (!token.startsWith('!') || token.length === 1) return undefined;
	const value = deaccent(trimTokenPunctuation(token.slice(1)).toLowerCase());
	if (value === 'later') return { kind: 'relative', minutes: 240 };
	if (value === 'tomorrow' || value === 'manana') {
		const date = parseDateToken(value);
		return date
			? { kind: 'absolute', value: combineDateTime(date, { hours: 9, minutes: 0 }) }
			: undefined;
	}
	const before = /^(\d+)(m|min|h)b$/.exec(value);
	if (before) {
		return {
			kind: 'before',
			minutes: Number(before[1]) * (before[2] === 'h' ? 60 : 1)
		};
	}
	const relative = /^(\d+)(m|min|h)$/.exec(value);
	if (relative) {
		return {
			kind: 'relative',
			minutes: Number(relative[1]) * (relative[2] === 'h' ? 60 : 1)
		};
	}
	const time = parseTimeToken(value);
	if (!time) return undefined;
	let reminder = moment(combineDateTime(moment().format('YYYY-MM-DD'), time));
	if (!reminder.isAfter(moment())) reminder = reminder.add(1, 'day');
	return { kind: 'absolute', value: reminder.format('YYYY-MM-DDTHH:mm:ssZ') };
}

function parseDurationPhrase(tokens: string[], index: number): { minutes: number, consumed: number } | undefined {
	const prefix = deaccent(trimTokenPunctuation(tokens[index] ?? '').toLowerCase());
	if (prefix !== 'for' && prefix !== 'durante') return undefined;
	const value = deaccent(trimTokenPunctuation(tokens[index + 1] ?? '').toLowerCase());
	const compact = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(value);
	if (compact && (compact[1] || compact[2])) {
		const minutes = Number(compact[1] || 0) * 60 + Number(compact[2] || 0);
		return minutes > 0 && minutes <= 1440 ? { minutes, consumed: 2 } : undefined;
	}
	if (!/^\d+$/.test(value)) return undefined;
	const amount = Number(value);
	const unit = deaccent(trimTokenPunctuation(tokens[index + 2] ?? '').toLowerCase());
	const multiplier = ['h', 'hour', 'hours', 'hora', 'horas'].includes(unit) ? 60
		: ['m', 'min', 'minute', 'minutes', 'minuto', 'minutos'].includes(unit) ? 1
			: 0;
	const minutes = amount * multiplier;
	return minutes > 0 && minutes <= 1440 ? { minutes, consumed: 3 } : undefined;
}

export function durationMinutesToIso(minutes: number): string {
	if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
		throw new RangeError('Duration must be a whole number between 1 and 1440 minutes');
	}
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	return `PT${hours ? `${hours}H` : ''}${remainder ? `${remainder}M` : ''}`;
}

export function durationIsoToMinutes(value: string | number | undefined): number | undefined {
	if (typeof value === 'number') {
		return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value / 60)) : undefined;
	}
	if (!value) return undefined;
	const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(value);
	if (!match) return undefined;
	const minutes = Number(match[1] || 0) * 1440
		+ Number(match[2] || 0) * 60
		+ Number(match[3] || 0)
		+ Number(match[4] || 0) / 60;
	return minutes > 0 ? Math.max(1, Math.round(minutes)) : undefined;
}

export function parseQuickAdd(input: string, options: QuickAddParseOptions = {}): ParsedQuickAdd {
	const out: ParsedQuickAdd = { description: '', tags: [] };
	const parseDates = options.parseDates !== false;
	const parseRecurrences = options.parseRecurrences !== false;
	const explicitDueDates: string[] = [];
	const parseInput = parseDates
		? input.replace(/\{([^{}]+)\}/g, (phrase, inner: string) => {
			const date = parseDateInput(inner.trim());
			if (!date) return phrase;
			explicitDueDates.push(date);
			return ' ';
		})
		: input;
	const rawTokens = parseInput.split(/\s+/).filter(Boolean);
	const hasUnsupportedRecurrence = rawTokens.some((_, index) =>
		unsupportedRecurrenceLength(rawTokens, index) > 0
	);
	const hasMultiwordWeekendRecurrence = rawTokens.some((token, index) => {
		const prefix = deaccent(trimTokenPunctuation(token).toLowerCase());
		return (prefix === 'cada' || prefix === 'every')
			&& deaccent(trimTokenPunctuation(rawTokens[index + 1] ?? '').toLowerCase()) === 'fin'
			&& deaccent(trimTokenPunctuation(rawTokens[index + 2] ?? '').toLowerCase()) === 'de'
			&& deaccent(trimTokenPunctuation(rawTokens[index + 3] ?? '').toLowerCase()) === 'semana';
	});
	const tokens = parseDates && !hasUnsupportedRecurrence && !(hasMultiwordWeekendRecurrence && !parseRecurrences)
		? mergeDateTimePhrases(rawTokens)
		: rawTokens;
	const remaining: string[] = [];
	const matchedDates = new Set<string>();
	for (const date of explicitDueDates) matchedDates.add(date);
	let dueDate: string | undefined = explicitDueDates[0];
	let dueTime: { hours: number; minutes: number } | undefined;
	let recurrenceCount = 0;
	let reminderSpec: ReminderSpec | undefined;
	let reminderCount = 0;
	let durationCount = 0;

	let i = 0;
	while (i < tokens.length) {
		const tok = tokens[i];
		const lower = trimTokenPunctuation(tok).toLowerCase();
		const plain = deaccent(lower);

		const proj = /^#([\p{L}\p{N}_.-]+)$/u.exec(tok);
		if (proj) {
			out.project = proj[1];
			i++;
			continue;
		}
		const tag = /^[%@]([\p{L}\p{N}_-]+)$/u.exec(tok);
		if (tag) {
			if (!out.tags.includes(tag[1])) out.tags.push(tag[1]);
			i++;
			continue;
		}
		const pri = /^p([1-4])$/i.exec(tok);
		if (pri) {
			out.priority = PRIORITY_MAP[pri[1]];
			i++;
			continue;
		}
		if (tok.startsWith('!')) {
			const reminder = parseReminderToken(tok);
			if (!reminder) {
				remaining.push(tok);
				out.reminderError = 'unsupported';
			}
			else {
				reminderCount++;
				if (reminderCount > 1) out.reminderError = 'ambiguous';
				else reminderSpec = reminder;
			}
			i++;
			continue;
		}
		const duration = parseDurationPhrase(tokens, i);
		if (duration) {
			durationCount++;
			if (durationCount > 1) out.durationError = 'ambiguous';
			else out.durationMinutes = duration.minutes;
			i += duration.consumed;
			continue;
		}

		const unsupportedLength = unsupportedRecurrenceLength(tokens, i);
		if (unsupportedLength) {
			remaining.push(...tokens.slice(i, i + unsupportedLength));
			if (parseRecurrences) out.recurrenceError = 'unsupported';
			i += unsupportedLength;
			continue;
		}

		const recurrence = parseRecurrencePhrase(tokens, i);
		if (recurrence) {
			if (!parseRecurrences) {
				remaining.push(...tokens.slice(i, i + recurrence.consumed));
				i += recurrence.consumed;
				continue;
			}
			if (recurrence.error) {
				remaining.push(...tokens.slice(i, i + recurrence.consumed));
				out.recurrenceError = 'unsupported';
				i += recurrence.consumed;
				continue;
			}
			recurrenceCount++;
			if (recurrenceCount > 1) out.recurrenceError = 'ambiguous';
			else {
				out.recur = recurrence.recur;
				dueDate = recurrence.due;
				if (recurrence.until) out.until = recurrence.until;
			}
			matchedDates.add(recurrence.due);
			i += recurrence.consumed;
			continue;
		}

		const next = tokens[i + 1]
			? trimTokenPunctuation(tokens[i + 1]).toLowerCase()
			: undefined;
		if (parseDates && lower === 'at' && isTimeLike(tokens[i + 1])) {
			dueTime = parseTimeToken(tokens[i + 1]) ?? parseBareHour(tokens[i + 1]);
			i += 2;
			continue;
		}
		if (parseDates && lower === 'a' && (next === 'las' || next === 'la') && isTimeLike(tokens[i + 2])) {
			dueTime = parseTimeToken(tokens[i + 2]) ?? parseBareHour(tokens[i + 2]);
			i += 3;
			continue;
		}

		if (parseDates && (plain === 'de' || plain === 'por') && deaccent(next ?? '') === 'la' && dayPartOf(tokens[i + 2])) {
			if (dueTime) dueTime = applyDayPart(dueTime, dayPartOf(tokens[i + 2])!);
			else remaining.push(tok, tokens[i + 1], tokens[i + 2]);
			i += 3;
			continue;
		}

		const date = parseDates && shouldParsePartialNumericDate(tokens, i, lower)
			? parseDateToken(lower)
			: undefined;
		if (date) {
			dueDate = date;
			matchedDates.add(date);
			i++;
			continue;
		}
		const time = parseDates ? parseTimeToken(lower) : undefined;
		if (time) {
			dueTime = time;
			i++;
			continue;
		}
		const assignee = /^\+([\p{L}\p{N}_.@+-]+)$/u.exec(tok);
		if (assignee) {
			out.assignee = assignee[1];
			i++;
			continue;
		}

		remaining.push(tok);
		i++;
	}

	if (matchedDates.size > 1) out.dateError = 'ambiguous';
	else if (dueTime) out.due = combineDateTime(dueDate ?? moment().format('YYYY-MM-DD'), dueTime);
	else if (dueDate) out.due = dueDate;
	if (reminderSpec?.kind === 'absolute') out.reminder = reminderSpec.value;
	else if (reminderSpec?.kind === 'relative') {
		out.reminder = moment().add(reminderSpec.minutes, 'minutes').format('YYYY-MM-DDTHH:mm:ssZ');
	}
	else if (reminderSpec?.kind === 'before') {
		if (!out.due || !/T\d{2}:\d{2}/.test(out.due)) {
			out._reminderBeforeMinutes = reminderSpec.minutes;
			out.reminderError = 'unsupported';
		}
		else out.reminder = moment(out.due).subtract(reminderSpec.minutes, 'minutes').format('YYYY-MM-DDTHH:mm:ssZ');
	}

	out.description = remaining.join(' ').trim();
	return out;
}
