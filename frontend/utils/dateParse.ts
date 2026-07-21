import moment from 'moment';

const DAY_NAMES_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
// Spanish day names (deaccented — see deaccent()) so "miércoles" === "miercoles". Only the
// full forms: Spanish abbreviations like "mar" (martes) collide with common words (mar = sea),
// and "mon"/"tue" already cover the short case for anyone who wants it.
const DAY_ES_FULL = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

export interface TimeOfDay {
	hours: number;
	minutes: number;
}

export interface ParsedDateTimeInput {
	date?: string;
	time?: TimeOfDay;
	due?: string;
	error?: 'ambiguous-date';
}

// Strip diacritics so Spanish tokens compare the same with or without accents
// ("miércoles" === "miercoles", "mañana" === "manana").
export function deaccent(s: string): string {
	return s.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
}

// Ignore sentence punctuation only while recognizing date/time tokens. Callers
// keep the original token so unrecognized prose is never rewritten.
export function trimTokenPunctuation(tok: string): string {
	return tok
		.replace(/^[\(\[\{"'«¿¡“‘]+/u, '')
		.replace(/[\)\]\}"'».,;:!?…“”’]+$/u, '');
}

export function dayIndexOf(tok: string): number {
	const plain = deaccent(trimTokenPunctuation(tok).toLowerCase());
	for (const list of [DAY_NAMES_FULL, DAY_NAMES_SHORT, DAY_ES_FULL]) {
		const i = list.indexOf(plain);
		if (i !== -1) return i;
	}
	return -1;
}

// Date tokens are intentionally date-only (YYYY-MM-DD): the user typed a day,
// not a time, so we don't fabricate one. The list / today filters all treat
// midnight as "all-day"; see hasNoTime() in TaskList.vue.
export function dayOfWeekFrom(targetDow: number, weeksAhead = 0): string {
	const m = moment();
	const today = m.day();
	let diff = targetDow - today;
	if (diff <= 0) diff += 7;
	diff += 7 * weeksAhead;
	return m.add(diff, 'day').format('YYYY-MM-DD');
}

export function parseDateToken(tok: string): string | undefined {
	const lower = trimTokenPunctuation(tok).toLowerCase();
	const plain = deaccent(lower);

	if (lower === 'today' || plain === 'hoy') return moment().format('YYYY-MM-DD');
	if (lower === 'tomorrow' || plain === 'manana') return moment().add(1, 'day').format('YYYY-MM-DD');
	// "pasado mañana" arrives pre-merged as "pasadomanana" (see mergeDatePhrases).
	if (plain === 'pasadomanana') return moment().add(2, 'day').format('YYYY-MM-DD');

	if (lower === 'eod') return moment().format('YYYY-MM-DD');
	if (lower === 'eow') return moment().endOf('isoWeek').format('YYYY-MM-DD');
	if (lower === 'eom') return moment().endOf('month').format('YYYY-MM-DD');
	if (lower === 'eoy') return moment().endOf('year').format('YYYY-MM-DD');
	if (lower === 'weekend' || plain === 'finde' || plain === 'finsemana') return dayOfWeekFrom(6);

	// "next monday", "next mon", "this monday" come in pre-merged as "nextmonday" / "thismon"
	let weekOffset = 0;
	let dayTok = lower;
	if (lower.startsWith('next')) {
		weekOffset = 1;
		dayTok = lower.slice(4);
	}
	else if (lower.startsWith('this')) {
		weekOffset = 0;
		dayTok = lower.slice(4);
	}

	if (weekOffset === 1 && dayTok === 'week') return moment().add(1, 'week').format('YYYY-MM-DD');
	if (weekOffset === 1 && dayTok === 'month') return moment().add(1, 'month').format('YYYY-MM-DD');

	const dayIdx = dayIndexOf(dayTok);
	// dayOfWeekFrom already returns the next occurrence. Adding weekOffset here
	// made advertised inputs such as "next monday" jump an extra week.
	if (dayIdx !== -1) return dayOfWeekFrom(dayIdx);

	const relMatch = /^\+(\d+)([dwmy])$/.exec(lower);
	if (relMatch) {
		const n = parseInt(relMatch[1], 10);
		if (!Number.isSafeInteger(n) || n <= 0) return undefined;
		const unitMap: Record<string, moment.unitOfTime.DurationConstructor> = {
			d: 'days',
			w: 'weeks',
			m: 'months',
			y: 'years'
		};
		return moment().add(n, unitMap[relMatch[2]]).format('YYYY-MM-DD');
	}

	if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
		const m = moment(lower, 'YYYY-MM-DD', true);
		if (m.isValid()) return lower;
	}

	// Numeric user input is always day-first. Normalize before strict parsing so
	// padded and unpadded forms behave identically (1/2/2027 === 01/02/2027).
	const numericDate = /^(\d{1,2})([\/-])(\d{1,2})\2(\d{4})$/.exec(lower);
	if (numericDate) {
		const day = numericDate[1].padStart(2, '0');
		const month = numericDate[3].padStart(2, '0');
		const normalized = `${numericDate[4]}-${month}-${day}`;
		const m = moment(normalized, 'YYYY-MM-DD', true);
		if (m.isValid()) return m.format('YYYY-MM-DD');
	}

	return undefined;
}

// Parses a clock-time token such as "15:00", "3pm", "9:30am", "15h", "15h30"
// or "noon" into 24-hour { hours, minutes }, or undefined if it isn't a time.
// A time must carry a marker (colon, am/pm, an "h", or the word "noon"); bare
// numbers like "3" are rejected on purpose so they stay part of the description.
export function parseTimeToken(tok: string): TimeOfDay | undefined {
	const lower = trimTokenPunctuation(tok).toLowerCase();
	const plain = deaccent(lower);

	if (lower === 'noon' || plain === 'mediodia') return { hours: 12, minutes: 0 };
	if (lower === 'midnight' || plain === 'medianoche') return { hours: 0, minutes: 0 };

	// 12-hour: 3pm, 3:30pm, 11am, 12:15am
	const ampm = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(lower);
	if (ampm) {
		let h = parseInt(ampm[1], 10);
		const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
		if (h < 1 || h > 12 || m > 59) return undefined;
		if (ampm[3] === 'am') h = h === 12 ? 0 : h;
		else h = h === 12 ? 12 : h + 12;
		return { hours: h, minutes: m };
	}

	// 24-hour: 15:00, 9:30, 09:05
	const colon = /^(\d{1,2}):(\d{2})$/.exec(lower);
	if (colon) {
		const h = parseInt(colon[1], 10);
		const m = parseInt(colon[2], 10);
		if (h > 23 || m > 59) return undefined;
		return { hours: h, minutes: m };
	}

	// European shorthand: 15h, 15h30
	const hForm = /^(\d{1,2})h(\d{2})?$/.exec(lower);
	if (hForm) {
		const h = parseInt(hForm[1], 10);
		const m = hForm[2] ? parseInt(hForm[2], 10) : 0;
		if (h > 23 || m > 59) return undefined;
		return { hours: h, minutes: m };
	}

	return undefined;
}

// A bare clock number ("5", "17", "5:30") with no am/pm/h marker. Interpreted as
// 24-hour, so "a las 5" → 05:00 — combine with a daypart (de la tarde) or am/pm to
// shift it. Only meaningful right after a time preposition ("a las", "at"); used as
// the lookahead test there, never on its own, so stray numbers stay in the text.
export function parseBareHour(tok: string): TimeOfDay | undefined {
	const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(trimTokenPunctuation(tok));
	if (!m) return undefined;
	const h = parseInt(m[1], 10);
	const min = m[2] ? parseInt(m[2], 10) : 0;
	if (h > 23 || min > 59) return undefined;
	return { hours: h, minutes: min };
}

// True if a token could be a clock time — drives the "a las <X>" / "at <X>" lookahead
// so the preposition is only swallowed when a time actually follows it.
export function isTimeLike(tok: string | undefined): boolean {
	if (!tok) return false;
	return parseTimeToken(tok) !== undefined || parseBareHour(tok) !== undefined;
}

// Maps a Spanish daypart word ("mañana", "tarde", "noche", "madrugada") to am/pm so
// "a las 5 de la tarde" can shift 05:00 → 17:00. Returns undefined for anything else.
export function dayPartOf(word: string | undefined): 'am' | 'pm' | undefined {
	if (!word) return undefined;
	const w = deaccent(trimTokenPunctuation(word).toLowerCase());
	if (w === 'manana' || w === 'madrugada') return 'am';
	if (w === 'tarde' || w === 'noche') return 'pm';
	return undefined;
}

export function applyDayPart(
	time: TimeOfDay,
	part: 'am' | 'pm'
): TimeOfDay {
	let h = time.hours;
	if (part === 'pm' && h < 12) h += 12;
	else if (part === 'am' && h === 12) h = 0;
	return { hours: h, minutes: time.minutes };
}

// Combines a date and wall-clock time with the browser's UTC offset. Sending a
// timezone-less value makes Taskwarrior interpret it in the server/container
// timezone, which can shift 09:15 to 11:15 when displayed in Europe/Madrid.
export function combineDateTime(date: string, time: TimeOfDay): string {
	const hh = String(time.hours).padStart(2, '0');
	const mm = String(time.minutes).padStart(2, '0');
	return moment(`${date}T${hh}:${mm}:00`, 'YYYY-MM-DDTHH:mm:ss', true)
		.format('YYYY-MM-DDTHH:mm:ssZ');
}

// English + Spanish "next"/"this" qualifiers. Merged with the following day/period
// into the "next<day>" / "this<day>" tokens parseDateToken keys on.
const NEXT_WORDS = new Set(['next', 'proximo', 'proxima']);
const THIS_WORDS = new Set(['this', 'este', 'esta']);
const RELATIVE_PREFIX_WORDS = new Set(['in', 'en']);

const RELATIVE_UNIT_MAP: Record<string, string> = {
	day: 'd',
	days: 'd',
	dia: 'd',
	dias: 'd',
	week: 'w',
	weeks: 'w',
	semana: 'w',
	semanas: 'w',
	month: 'm',
	months: 'm',
	mes: 'm',
	meses: 'm',
	year: 'y',
	years: 'y',
	ano: 'y',
	anos: 'y'
};

const RELATIVE_COUNT_WORDS: Record<string, number> = {
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13,
	fourteen: 14,
	fifteen: 15,
	sixteen: 16,
	seventeen: 17,
	eighteen: 18,
	nineteen: 19,
	twenty: 20,
	twentyone: 21,
	twentytwo: 22,
	twentythree: 23,
	twentyfour: 24,
	twentyfive: 25,
	twentysix: 26,
	twentyseven: 27,
	twentyeight: 28,
	twentynine: 29,
	thirty: 30,
	thirtyone: 31,
	un: 1,
	una: 1,
	uno: 1,
	dos: 2,
	tres: 3,
	cuatro: 4,
	cinco: 5,
	seis: 6,
	siete: 7,
	ocho: 8,
	nueve: 9,
	diez: 10,
	once: 11,
	doce: 12,
	trece: 13,
	catorce: 14,
	quince: 15,
	dieciséis: 16,
	dieciseis: 16,
	diecisiete: 17,
	dieciocho: 18,
	diecinueve: 19,
	veinte: 20,
	veintiun: 21,
	veintiuna: 21,
	veintiuno: 21,
	veintidos: 22,
	veintitres: 23,
	veinticuatro: 24,
	veinticinco: 25,
	veintiseis: 26,
	veintisiete: 27,
	veintiocho: 28,
	veintinueve: 29,
	treinta: 30
};

const EN_RELATIVE_ONES = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']);
const ES_RELATIVE_ONES = new Set(['un', 'una', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']);

function normalizedCountWord(tok: string | undefined): string | undefined {
	if (!tok) return undefined;
	const plain = deaccent(trimTokenPunctuation(tok).toLowerCase());
	if (/^\d+$/.test(plain)) return plain;
	// Internal hyphens are valid in written compounds such as "twenty-two".
	// Signs, dangling hyphens and mixed digit/word tokens must not be erased,
	// otherwise a negative count such as "-2" silently becomes positive.
	if (!/^[a-z]+(?:-[a-z]+)*$/.test(plain)) return undefined;
	return plain.replace(/-/g, '');
}

function numericCountOf(tok: string | undefined): number | undefined {
	if (!tok || !/^\d+$/.test(tok)) return undefined;
	const n = parseInt(tok, 10);
	return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

function relativeCountFrom(tokens: string[], index: number): { count: number; length: number } | undefined {
	const first = normalizedCountWord(tokens[index]);
	if (!first) return undefined;

	const numeric = numericCountOf(first);
	if (numeric) return { count: numeric, length: 1 };

	const second = normalizedCountWord(tokens[index + 1]);
	if (first === 'twenty' && second && EN_RELATIVE_ONES.has(second)) {
		return { count: 20 + RELATIVE_COUNT_WORDS[second], length: 2 };
	}
	if (first === 'thirty' && second === 'one') {
		return { count: 31, length: 2 };
	}
	if (first === 'treinta' && second === 'y') {
		const third = normalizedCountWord(tokens[index + 2]);
		if (third && ES_RELATIVE_ONES.has(third)) {
			return { count: 30 + RELATIVE_COUNT_WORDS[third], length: 3 };
		}
	}

	const count = RELATIVE_COUNT_WORDS[first];
	return count ? { count, length: 1 } : undefined;
}

function relativeUnitOf(tok: string | undefined): string | undefined {
	if (!tok) return undefined;
	return RELATIVE_UNIT_MAP[deaccent(trimTokenPunctuation(tok).toLowerCase())];
}

function relativeTokenFrom(tokens: string[], countIndex: number): { token: string; consumed: number } | undefined {
	const parsedCount = relativeCountFrom(tokens, countIndex);
	if (!parsedCount) return undefined;
	const unit = relativeUnitOf(tokens[countIndex + parsedCount.length]);
	if (!unit) return undefined;
	return {
		token: `+${parsedCount.count}${unit}`,
		consumed: parsedCount.length + 1
	};
}

// Collapses multi-word date phrases into the single tokens parseDateToken understands,
// normalizing Spanish to the English forms it expects ("próximo lunes" -> "nextlunes",
// "próxima semana" -> "nextweek", "pasado mañana" -> "pasadomanana", "fin de semana" ->
// "weekend", "el viernes" -> "viernes", "in 15 days" / "en 15 días" -> "+15d").
// Shared by the quick-add palette and the reschedule popover so both speak the same
// date language. Time-only phrases ("3 pm") are intentionally left alone — that merge
// is quick-add specific.
export function mergeDatePhrases(raw: string[]): string[] {
	const tokens: string[] = [];
	for (let i = 0; i < raw.length; i++) {
		const cur = raw[i];
		const lower = trimTokenPunctuation(cur).toLowerCase();
		const plain = deaccent(lower);
		const peek = raw[i + 1] ? trimTokenPunctuation(raw[i + 1]).toLowerCase() : undefined;
		const peekPlain = peek ? deaccent(peek) : undefined;

		if ((NEXT_WORDS.has(plain) || THIS_WORDS.has(plain)) && peek) {
			const prefix = NEXT_WORDS.has(plain) ? 'next' : 'this';
			if (dayIndexOf(peek) !== -1) {
				tokens.push(`${prefix}${peek}`);
				i++;
				continue;
			}
			if (prefix === 'next' && (peekPlain === 'week' || peekPlain === 'semana')) {
				tokens.push('nextweek');
				i++;
				continue;
			}
			if (prefix === 'next' && (peekPlain === 'month' || peekPlain === 'mes')) {
				tokens.push('nextmonth');
				i++;
				continue;
			}
		}

		if (RELATIVE_PREFIX_WORDS.has(plain)) {
			const rel = relativeTokenFrom(raw, i + 1);
			if (rel) {
				tokens.push(rel.token);
				i += rel.consumed;
				continue;
			}
		}

		if (plain === 'dentro' && peekPlain === 'de') {
			const rel = relativeTokenFrom(raw, i + 2);
			if (rel) {
				tokens.push(rel.token);
				i += rel.consumed + 1;
				continue;
			}
		}

		if (plain === 'pasado' && peekPlain === 'manana') {
			tokens.push('pasadomanana');
			i++;
			continue;
		}

		if (plain === 'fin' && peekPlain === 'de' && deaccent(trimTokenPunctuation(raw[i + 2] ?? '').toLowerCase()) === 'semana') {
			tokens.push('weekend');
			i += 2;
			continue;
		}

		// Drop the article in "el viernes" / "el lunes" so the day resolves on its own.
		if (plain === 'el' && peek && dayIndexOf(peek) !== -1) continue;

		tokens.push(cur);
	}
	return tokens;
}

export function mergeDateTimePhrases(raw: string[]): string[] {
	const dated = mergeDatePhrases(raw);
	const tokens: string[] = [];
	for (let i = 0; i < dated.length; i++) {
		const cur = dated[i];
		const lower = trimTokenPunctuation(cur).toLowerCase();
		const peek = dated[i + 1] ? trimTokenPunctuation(dated[i + 1]).toLowerCase() : undefined;
		if (/^\d{1,2}(:\d{2})?$/.test(lower) && (peek === 'am' || peek === 'pm')) {
			tokens.push(`${lower}${peek}`);
			i++;
			continue;
		}
		tokens.push(cur);
	}
	return tokens;
}

export function datePartFromDue(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const m = moment(value);
	return m.isValid() ? m.format('YYYY-MM-DD') : undefined;
}

export function timePartFromDue(value: string | undefined): TimeOfDay | undefined {
	if (!value) return undefined;
	const m = moment(value);
	if (!m.isValid()) return undefined;
	const localMidnight = m.hour() === 0 && m.minute() === 0 && m.second() === 0;
	const u = m.clone().utc();
	const utcMidnight = u.hour() === 0 && u.minute() === 0 && u.second() === 0;
	if (localMidnight || utcMidnight) return undefined;
	return { hours: m.hour(), minutes: m.minute() };
}

export function parseDateTimeInput(
	input: string,
	fallbackDate?: string,
	fallbackTime?: TimeOfDay
): ParsedDateTimeInput | undefined {
	const tokens = mergeDateTimePhrases(input.trim().split(/\s+/).filter(Boolean));
	let date: string | undefined;
	let time: TimeOfDay | undefined;
	let matched = false;
	const matchedDates = new Set<string>();

	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		const lower = trimTokenPunctuation(tok).toLowerCase();
		const plain = deaccent(lower);
		const next = tokens[i + 1] ? trimTokenPunctuation(tokens[i + 1]).toLowerCase() : undefined;

		if (lower === 'at' && isTimeLike(tokens[i + 1])) {
			time = parseTimeToken(tokens[i + 1]) ?? parseBareHour(tokens[i + 1]);
			matched = true;
			i += 1;
			continue;
		}
		if (lower === 'a' && (next === 'las' || next === 'la') && isTimeLike(tokens[i + 2])) {
			time = parseTimeToken(tokens[i + 2]) ?? parseBareHour(tokens[i + 2]);
			matched = true;
			i += 2;
			continue;
		}
		if ((plain === 'de' || plain === 'por') && deaccent(next ?? '') === 'la' && dayPartOf(tokens[i + 2])) {
			if (time) {
				time = applyDayPart(time, dayPartOf(tokens[i + 2])!);
				matched = true;
			}
			i += 2;
			continue;
		}

		const parsedDate = parseDateToken(lower);
		if (parsedDate) {
			date = parsedDate;
			matchedDates.add(parsedDate);
			matched = true;
			continue;
		}
		const parsedTime = parseTimeToken(lower);
		if (parsedTime) {
			time = parsedTime;
			matched = true;
		}
	}

	if (!matched) return undefined;
	if (matchedDates.size > 1) return { error: 'ambiguous-date' };

	const out: ParsedDateTimeInput = { date, time };
	const dueDate = date ?? (time ? fallbackDate ?? moment().format('YYYY-MM-DD') : undefined);
	const dueTime = time ?? (date ? fallbackTime : undefined);
	if (dueDate && dueTime) out.due = combineDateTime(dueDate, dueTime);
	else if (dueDate) out.due = dueDate;
	return out;
}

// Parses free-text date input into a YYYY-MM-DD string, or undefined if nothing
// resolves or distinct date tokens conflict. Equivalent tokens for the same day
// are allowed, so "tomorrow mañana" remains unambiguous.
export function parseDateInput(input: string): string | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;
	let matchedDate: string | undefined;
	for (const tok of mergeDatePhrases(trimmed.split(/\s+/))) {
		const date = parseDateToken(tok);
		if (!date) continue;
		if (matchedDate && matchedDate !== date) return undefined;
		matchedDate = date;
	}
	return matchedDate;
}
