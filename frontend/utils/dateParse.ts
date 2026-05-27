import moment from 'moment';

const DAY_NAMES_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
// Spanish day names (deaccented — see deaccent()) so "miércoles" === "miercoles". Only the
// full forms: Spanish abbreviations like "mar" (martes) collide with common words (mar = sea),
// and "mon"/"tue" already cover the short case for anyone who wants it.
const DAY_ES_FULL = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// Strip diacritics so Spanish tokens compare the same with or without accents
// ("miércoles" === "miercoles", "mañana" === "manana").
export function deaccent(s: string): string {
	return s.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
}

export function dayIndexOf(tok: string): number {
	const plain = deaccent(tok.toLowerCase());
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
	const lower = tok.toLowerCase();
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
	if (dayIdx !== -1) return dayOfWeekFrom(dayIdx, weekOffset);

	const relMatch = /^\+(\d+)([dwmy])$/.exec(lower);
	if (relMatch) {
		const n = parseInt(relMatch[1], 10);
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

	return undefined;
}

// Parses a clock-time token such as "15:00", "3pm", "9:30am", "15h", "15h30"
// or "noon" into 24-hour { hours, minutes }, or undefined if it isn't a time.
// A time must carry a marker (colon, am/pm, an "h", or the word "noon"); bare
// numbers like "3" are rejected on purpose so they stay part of the description.
export function parseTimeToken(tok: string): { hours: number; minutes: number } | undefined {
	const lower = tok.toLowerCase();
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
export function parseBareHour(tok: string): { hours: number; minutes: number } | undefined {
	const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(tok);
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
	const w = deaccent(word.toLowerCase());
	if (w === 'manana' || w === 'madrugada') return 'am';
	if (w === 'tarde' || w === 'noche') return 'pm';
	return undefined;
}

export function applyDayPart(
	time: { hours: number; minutes: number },
	part: 'am' | 'pm'
): { hours: number; minutes: number } {
	let h = time.hours;
	if (part === 'pm' && h < 12) h += 12;
	else if (part === 'am' && h === 12) h = 0;
	return { hours: h, minutes: time.minutes };
}

// Combines a date-only string (YYYY-MM-DD) and a parsed time into the local
// datetime string the rest of the app uses for timed due dates
// (YYYY-MM-DDTHH:mm:00) — the same shape DateTimeInput emits.
export function combineDateTime(date: string, time: { hours: number; minutes: number }): string {
	const hh = String(time.hours).padStart(2, '0');
	const mm = String(time.minutes).padStart(2, '0');
	return `${date}T${hh}:${mm}:00`;
}

// English + Spanish "next"/"this" qualifiers. Merged with the following day/period
// into the "next<day>" / "this<day>" tokens parseDateToken keys on.
const NEXT_WORDS = new Set(['next', 'proximo', 'proxima']);
const THIS_WORDS = new Set(['this', 'este', 'esta']);

// Collapses multi-word date phrases into the single tokens parseDateToken understands,
// normalizing Spanish to the English forms it expects ("próximo lunes" -> "nextlunes",
// "próxima semana" -> "nextweek", "pasado mañana" -> "pasadomanana", "fin de semana" ->
// "weekend", "el viernes" -> "viernes"). Shared by the quick-add palette and the
// reschedule popover so both speak the same date language. Time-only phrases ("3 pm")
// are intentionally left alone — that merge is quick-add specific.
export function mergeDatePhrases(raw: string[]): string[] {
	const tokens: string[] = [];
	for (let i = 0; i < raw.length; i++) {
		const cur = raw[i];
		const lower = cur.toLowerCase();
		const plain = deaccent(lower);
		const peek = raw[i + 1]?.toLowerCase();
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

		if (plain === 'pasado' && peekPlain === 'manana') {
			tokens.push('pasadomanana');
			i++;
			continue;
		}

		if (plain === 'fin' && peekPlain === 'de' && deaccent(raw[i + 2]?.toLowerCase() ?? '') === 'semana') {
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

// Parses free-text date input (e.g. the reschedule popover) into a YYYY-MM-DD string,
// or undefined if nothing in it reads as a date. Phrases are merged first, then the
// first token that resolves wins — so "próximo lunes", "el viernes" and "next mon"
// all work, English or Spanish.
export function parseDateInput(input: string): string | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;
	for (const tok of mergeDatePhrases(trimmed.split(/\s+/))) {
		const date = parseDateToken(tok);
		if (date) return date;
	}
	return undefined;
}
