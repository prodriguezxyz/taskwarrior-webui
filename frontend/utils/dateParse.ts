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
