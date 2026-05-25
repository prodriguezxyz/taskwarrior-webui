import moment from 'moment';

const DAY_NAMES_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function dayIndexOf(tok: string): number {
	const lower = tok.toLowerCase();
	const full = DAY_NAMES_FULL.indexOf(lower);
	if (full !== -1) return full;
	return DAY_NAMES_SHORT.indexOf(lower);
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

	if (lower === 'today') return moment().format('YYYY-MM-DD');
	if (lower === 'tomorrow') return moment().add(1, 'day').format('YYYY-MM-DD');

	if (lower === 'eod') return moment().format('YYYY-MM-DD');
	if (lower === 'eow') return moment().endOf('isoWeek').format('YYYY-MM-DD');
	if (lower === 'eom') return moment().endOf('month').format('YYYY-MM-DD');
	if (lower === 'eoy') return moment().endOf('year').format('YYYY-MM-DD');
	if (lower === 'weekend') return dayOfWeekFrom(6);

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

	if (lower === 'noon') return { hours: 12, minutes: 0 };

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

// Combines a date-only string (YYYY-MM-DD) and a parsed time into the local
// datetime string the rest of the app uses for timed due dates
// (YYYY-MM-DDTHH:mm:00) — the same shape DateTimeInput emits.
export function combineDateTime(date: string, time: { hours: number; minutes: number }): string {
	const hh = String(time.hours).padStart(2, '0');
	const mm = String(time.minutes).padStart(2, '0');
	return `${date}T${hh}:${mm}:00`;
}

// Parses multi-token strings such as "next monday" or "this fri" before
// delegating to parseDateToken. Use for free-text user input where tokens
// arrive separated by whitespace.
export function parseDateInput(input: string): string | undefined {
	const trimmed = input.trim();
	if (!trimmed) return undefined;
	const parts = trimmed.split(/\s+/);
	if (parts.length === 1) return parseDateToken(parts[0]);
	if (parts.length === 2) {
		const merged = `${parts[0].toLowerCase()}${parts[1].toLowerCase()}`;
		return parseDateToken(merged);
	}
	return undefined;
}
