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
	dateError?: 'ambiguous';
}

export function parseQuickAdd(input: string): ParsedQuickAdd {
	const out: ParsedQuickAdd = { description: '', tags: [] };
	const tokens = mergeDateTimePhrases(input.split(/\s+/).filter(Boolean));
	const remaining: string[] = [];
	const matchedDates = new Set<string>();
	let dueDate: string | undefined;
	let dueTime: { hours: number; minutes: number } | undefined;

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
		const tag = /^@([\p{L}\p{N}_-]+)$/u.exec(tok);
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

		const next = tokens[i + 1]
			? trimTokenPunctuation(tokens[i + 1]).toLowerCase()
			: undefined;
		if (lower === 'at' && isTimeLike(tokens[i + 1])) {
			dueTime = parseTimeToken(tokens[i + 1]) ?? parseBareHour(tokens[i + 1]);
			i += 2;
			continue;
		}
		if (lower === 'a' && (next === 'las' || next === 'la') && isTimeLike(tokens[i + 2])) {
			dueTime = parseTimeToken(tokens[i + 2]) ?? parseBareHour(tokens[i + 2]);
			i += 3;
			continue;
		}

		if ((plain === 'de' || plain === 'por') && deaccent(next ?? '') === 'la' && dayPartOf(tokens[i + 2])) {
			if (dueTime) dueTime = applyDayPart(dueTime, dayPartOf(tokens[i + 2])!);
			else remaining.push(tok, tokens[i + 1], tokens[i + 2]);
			i += 3;
			continue;
		}

		const date = parseDateToken(lower);
		if (date) {
			dueDate = date;
			matchedDates.add(date);
			i++;
			continue;
		}
		const time = parseTimeToken(lower);
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
