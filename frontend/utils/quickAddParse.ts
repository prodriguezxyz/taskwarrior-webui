import moment from 'moment';
import {
	applyDayPart,
	combineDateTime,
	dayPartOf,
	deaccent,
	isTimeLike,
	mergeDateTimePhrases,
	parseBareHour,
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
	recur?: string;
	dateError?: 'ambiguous';
	recurrenceError?: 'ambiguous' | 'unsupported';
}

export interface QuickAddParseOptions {
	parseDates?: boolean;
	parseRecurrences?: boolean;
}

export interface QuickAddOverrides {
	priority?: 'H' | 'M' | 'L' | null;
	due?: string;
	recurrence?: { recur: string, due: string };
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
		delete result.dateError;
		delete result.recurrenceError;
	}
	if (overrides.due) {
		result.due = overrides.due;
		delete result.dateError;
	}
	return result;
}

function unsupportedRecurrenceLength(tokens: string[], index: number): number {
	const prefix = deaccent(trimTokenPunctuation(tokens[index] ?? '').toLowerCase());
	if (prefix !== 'cada' && prefix !== 'every') return 0;
	const first = deaccent(trimTokenPunctuation(tokens[index + 1] ?? '').toLowerCase());
	if (first === 'weekend' || first === 'finde') return 2;
	if (
		first === 'fin'
		&& deaccent(trimTokenPunctuation(tokens[index + 2] ?? '').toLowerCase()) === 'de'
		&& deaccent(trimTokenPunctuation(tokens[index + 3] ?? '').toLowerCase()) === 'semana'
	) return 4;

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

export function parseQuickAdd(input: string, options: QuickAddParseOptions = {}): ParsedQuickAdd {
	const out: ParsedQuickAdd = { description: '', tags: [] };
	const parseDates = options.parseDates !== false;
	const parseRecurrences = options.parseRecurrences !== false;
	const rawTokens = input.split(/\s+/).filter(Boolean);
	const hasUnsupportedRecurrence = rawTokens.some((_, index) =>
		unsupportedRecurrenceLength(rawTokens, index) > 0
	);
	const tokens = parseDates && !hasUnsupportedRecurrence
		? mergeDateTimePhrases(rawTokens)
		: rawTokens;
	const remaining: string[] = [];
	const matchedDates = new Set<string>();
	let dueDate: string | undefined;
	let dueTime: { hours: number; minutes: number } | undefined;
	let recurrenceCount = 0;

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
			recurrenceCount++;
			if (recurrenceCount > 1) out.recurrenceError = 'ambiguous';
			else {
				out.recur = recurrence.recur;
				dueDate = recurrence.due;
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

	out.description = remaining.join(' ').trim();
	return out;
}
