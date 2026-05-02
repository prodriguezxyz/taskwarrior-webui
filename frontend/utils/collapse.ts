import { Task } from 'taskwarrior-lib';
import moment from 'moment';

export type CollapsibleTask = Task & {
	_collapsedCount?: number;
	_siblingUuids?: string[];
};

// Group pending child instances of the same recurring series into a single
// representative row. Representative = oldest by `due` (most overdue first),
// so the row's `due` already conveys "stale since when". Completing the
// representative is expected to bulk-complete every uuid in `_siblingUuids`.
//
// Tasks without a `parent` (and single-instance groups) pass through untouched.
// Never mutates the input — the representative is a shallow clone carrying the
// virtual `_collapsedCount` / `_siblingUuids` fields.
//
// In multi-profile aggregate mode, group key is scoped by `_profile` so two
// profiles that happen to share a parent UUID (e.g. cross-device sync to the
// same taskserver) are treated as independent series — same reasoning as the
// per-profile inheritance scoping in `fetchTasks`.
export function collapseRecurring(tasks: Task[]): CollapsibleTask[] {
	const groups = new Map<string, Task[]>();
	const out: CollapsibleTask[] = [];

	for (const t of tasks) {
		const parent = (t as any).parent as string | undefined;
		if (!parent) {
			out.push(t); continue;
		}
		const profileKey = (t as any)._profile || '';
		const groupKey = `${profileKey}::${parent}`;
		const arr = groups.get(groupKey) || [];
		arr.push(t); groups.set(groupKey, arr);
	}

	for (const [, arr] of groups) {
		if (arr.length === 1) {
			out.push(arr[0]); continue;
		}
		const sorted = arr.slice().sort((a, b) => {
			const da = a.due ? +moment(a.due) : Number.POSITIVE_INFINITY;
			const db = b.due ? +moment(b.due) : Number.POSITIVE_INFINITY;
			if (da !== db) return da - db;
			const ea = a.entry ? +moment(a.entry) : 0;
			const eb = b.entry ? +moment(b.entry) : 0;
			if (ea !== eb) return ea - eb;
			return (a.uuid || '').localeCompare(b.uuid || '');
		});
		const rep = sorted[0];
		out.push({
			...rep,
			_collapsedCount: arr.length - 1,
			_siblingUuids: arr.map(t => t.uuid!).filter(Boolean)
		});
	}

	return out;
}
