import { ActionTree, MutationTree, GetterTree } from 'vuex';
import { Task } from 'taskwarrior-lib';
import { getAccessorType } from 'typed-vuex';

export type TaskWithProfile = Task & { _profile?: string };
export type ViewName = 'all' | 'today' | 'calendar' | 'tags' | 'projects' | 'mine';
export const CROSS_PROFILE_VIEWS: ReadonlySet<ViewName> = new Set(['today', 'calendar', 'mine']);
export function isCrossProfileView(view: ViewName): boolean {
	return CROSS_PROFILE_VIEWS.has(view);
}

export const state = () => ({
	tasks: [] as Task[],
	snackbar: false,
	notification: {
		color: '',
		text: '',
		actionText: '' as string | undefined,
		actionHandler: null as (() => void) | null
	},
	user: null as { email: string, profiles: string[] } | null,
	settings: {
		dark: false,
		autoRefresh: '5', // in minutes
		autoSync: '0', // in minutes
		profile: '',
		// Today view: 'mine' shows tasks assigned to me or unassigned; 'all'
		// shows everything (useful in shared profiles to see what others have).
		todayScope: 'mine' as 'mine' | 'all',
		calendarScope: 'mine' as 'mine' | 'all',
		calendarViewMode: 'month' as 'month' | 'week',
		// Tags hidden from the row display (still indexed/searchable). Default
		// covers the bulk "imported" tag a user is likely carrying around.
		hiddenTags: ['todoist-import'] as string[]
	},
	hiddenColumns: [] as string[],
	profiles: [] as Array<{ name: string }>,
	defaultProfile: '',
	members: [] as Array<{ email: string, name: string }>,
	projectFilter: null as string | null,
	tagFilter: null as string | null,
	assigneeFilter: null as string | null,
	view: 'all' as ViewName,
	searchOpen: false,
	quickAddOpen: false,
	taskDialog: {
		open: false,
		task: null as Task | null
	}
});

export type RootState = ReturnType<typeof state>;

export const getters: GetterTree<RootState, RootState> = {
	projects: state => state.tasks.map(task => task.project).filter(p => p !== undefined),
	tags: state => {
		const set = new Set<string>();
		for (const task of state.tasks) {
			if (task.tags) for (const t of task.tags) set.add(t);
		}
		return Array.from(set).sort();
	},
	assignees: state => {
		const set = new Set<string>();
		for (const task of state.tasks) {
			const a = (task as any).assignee;
			if (a) set.add(a);
		}
		return Array.from(set).sort();
	},
	assigneeLabel: state => (email?: string): string => {
		if (!email) return '';
		const m = state.members.find(x => x.email === email);
		if (m && m.name) return m.name;
		const at = email.indexOf('@');
		return at > 0 ? email.slice(0, at) : email;
	},
	multiProfile: state => state.profiles.length > 1,
	// Single profile: every task is "ours". Multi-profile: must match the active profile.
	// Used by profile-scoped views (Inbox, projects, tags); Today and Mine ignore this.
	isOwnProfile: state => (task: Task): boolean => {
		if (state.profiles.length <= 1) return true;
		return (task as TaskWithProfile)._profile === state.settings.profile;
	},
	// Memoized profile-scoped subset. Cheaper than re-filtering in every
	// computed that needs "tasks in the active profile".
	ownTasks: (state): Task[] => {
		if (state.profiles.length <= 1) return state.tasks;
		const active = state.settings.profile;
		return state.tasks.filter(t => (t as TaskWithProfile)._profile === active);
	},
	// Today scope: 'mine' keeps tasks the user owns or that nobody owns;
	// 'all' includes tasks assigned to other members. Used by the Today
	// view, the sidebar count, and the page header count.
	inTodayScope: (state) => (task: Task): boolean => {
		if (state.settings.todayScope === 'all') return true;
		const a = (task as any).assignee;
		if (!a) return true;
		const me = state.user?.email;
		return !!me && a === me;
	},
	// Calendar scope is intentionally independent from Today scope. Both use
	// the same ownership rule for "mine", but changing one view must not alter
	// the other.
	inCalendarScope: (state) => (task: Task): boolean => {
		if (state.settings.calendarScope === 'all') return true;
		const a = (task as any).assignee;
		if (!a) return true;
		const me = state.user?.email;
		return !!me && a === me;
	}
};

export const mutations: MutationTree<RootState> = {
	setUser(state, user: { email: string, profiles: string[] } | null) {
		state.user = user;
	},

	setSettings(state, settings) {
		state.settings = settings;
	},

	setTasks(state, tasks: Task[]) {
		state.tasks = tasks;
	},

	setHiddenColumns(state, hiddenColumns) {
		state.hiddenColumns = hiddenColumns;
	},

	setProfiles(state, payload: { profiles: Array<{ name: string }>, default: string }) {
		state.profiles = payload.profiles;
		state.defaultProfile = payload.default;
	},

	setMembers(state, members: Array<{ email: string, name: string }>) {
		state.members = members;
	},

	setNotification(state, notification) {
		state.notification = notification;
		// Show notification
		state.snackbar = true;
	},

	setSnackbar(state, value) {
		state.snackbar = value;
	},

	setProjectFilter(state, value: string | null) {
		state.projectFilter = value;
	},

	setTagFilter(state, value: string | null) {
		state.tagFilter = value;
	},

	setAssigneeFilter(state, value: string | null) {
		state.assigneeFilter = value;
	},

	setView(state, value: ViewName) {
		state.view = value;
	},

	setSearchOpen(state, value: boolean) {
		state.searchOpen = value;
	},

	setQuickAddOpen(state, value: boolean) {
		state.quickAddOpen = value;
	},

	openNewTaskDialog(state) {
		state.taskDialog = { open: true, task: null };
	},

	openEditTaskDialog(state, task: Task) {
		state.taskDialog = { open: true, task };
	},

	closeTaskDialog(state) {
		state.taskDialog = { open: false, task: null };
	}
};

function settingsKey(email: string | undefined): string {
	return email ? `settings:${email}` : 'settings';
}

function hiddenColumnsKey(email: string | undefined): string {
	return email ? `hiddenColumns:${email}` : 'hiddenColumns';
}

export const actions: ActionTree<RootState, RootState> = {
	async fetchMe(context) {
		const payload: { email: string, profiles: string[] }
			= await this.$axios.$get('/api/auth/me');
		context.commit('setUser', payload);
	},

	fetchSettings(context) {
		const email = context.state.user?.email;
		const raw = localStorage.getItem(settingsKey(email));
		const saved = raw ? JSON.parse(raw) : {};
		context.commit('setSettings', { ...context.state.settings, ...saved });
	},

	updateSettings(context, settings) {
		const email = context.state.user?.email;
		context.commit('setSettings', settings);
		localStorage.setItem(settingsKey(email), JSON.stringify(settings));
	},

	fetchHiddenColumns(context) {
		const email = context.state.user?.email;
		const columns = localStorage.getItem(hiddenColumnsKey(email));
		if (columns) {
			context.commit('setHiddenColumns', JSON.parse(columns));
		}
	},

	updateHiddenColumns(context, columns) {
		const email = context.state.user?.email;
		context.commit('setHiddenColumns', columns);
		localStorage.setItem(hiddenColumnsKey(email), JSON.stringify(columns));
	},

	async fetchProfiles(context) {
		const payload: { profiles: Array<{ name: string }>, default: string }
			= await this.$axios.$get('/api/profiles');
		context.commit('setProfiles', payload);
		const settings = context.state.settings;
		const valid = payload.profiles.some(p => p.name === settings.profile);
		if (!valid) {
			context.dispatch('updateSettings', { ...settings, profile: payload.default });
		}
	},

	async fetchMembers(context) {
		const profile = context.state.settings.profile;
		if (!profile) {
			context.commit('setMembers', []);
			return;
		}
		try {
			context.commit('setMembers', await loadProfileMembers(this.$axios, profile));
		}
		catch (err) {
			// Non-fatal: keep whatever was cached rather than blowing up
			// the boot flow or wiping the list on a transient blip.
			console.error('[store] fetchMembers failed:', err);
		}
	},

	// Read-only fetch for arbitrary profile members. Does NOT mutate
	// state.members so the active profile's list (used by the rest of
	// the UI) stays put while a dialog edits a cross-profile task.
	async fetchMembersFor(_context, profile: string) {
		if (!profile) return [];
		try {
			return await loadProfileMembers(this.$axios, profile);
		}
		catch (err) {
			console.error('[store] fetchMembersFor failed:', err);
			return [];
		}
	},

	async fetchTasks(context) {
		const multi = context.state.profiles.length > 1;
		const url = multi ? '/api/tasks/aggregate' : '/api/tasks';
		const tasks: Task[] = await this.$axios.$get(url);
		// Recurring child instances may be exported without `project`/`tags`
		// even when their parent template defines them. Inherit from parent
		// so Inbox/project filters and counts treat them consistently.
		// In aggregated mode, do this scoped per profile so a child never
		// inherits from a parent UUID that lives in a different profile.
		const buckets = new Map<string, Task[]>();
		for (const t of tasks) {
			const key = (t as TaskWithProfile)._profile || '';
			const arr = buckets.get(key) || [];
			arr.push(t); buckets.set(key, arr);
		}
		for (const arr of buckets.values()) {
			const byUuid = new Map<string, Task>();
			for (const t of arr) if (t.uuid) byUuid.set(t.uuid, t);
			for (const t of arr) {
				if (!t.parent) continue;
				const parent = byUuid.get(t.parent);
				if (!parent) continue;
				if (!t.project && parent.project) t.project = parent.project;
				if ((!t.tags || !t.tags.length) && parent.tags?.length) t.tags = [...parent.tags];
			}
		}
		context.commit('setTasks', tasks);
	},

	async deleteTasks(context, tasks: Task[]) {
		const groups = groupByProfile(tasks);
		// Always refresh, even on failure — the multi-profile loop can partially
		// succeed (one profile written, the next throws), and stale UI is worse
		// than reflecting what actually happened. Swallow refresh errors so the
		// original write error (which the caller wants to surface) isn't masked.
		try {
			for (const [profile, ts] of groups) {
				const headers = profile ? { 'X-Profile': profile } : undefined;
				await this.$axios.$delete('/api/tasks', {
					params: { tasks: ts.map(task => task.uuid) },
					headers
				});
			}
		}
		finally {
			try {
				await context.dispatch('fetchTasks');
			}
			catch (err) {
				console.error('[store] fetchTasks after delete failed:', err);
			}
		}
	},

	async updateTasks(context, tasks: Task[]) {
		const groups = groupByProfile(tasks);
		try {
			for (const [profile, ts] of groups) {
				const headers = profile ? { 'X-Profile': profile } : undefined;
				// Strip frontend-only annotations before sending — taskwarrior-lib
				// persists unknown fields, so leaving _profile on the payload
				// would create a stray UDA on every updated task.
				const payload = ts.map(t => stripInternalFields(t));
				await this.$axios.$put('/api/tasks', { tasks: payload }, { headers });
			}
		}
		finally {
			try {
				await context.dispatch('fetchTasks');
			}
			catch (err) {
				console.error('[store] fetchTasks after update failed:', err);
			}
		}
	},

	// Move a task from one profile (Taskwarrior) to another. There is no atomic
	// cross-profile primitive — profiles are independent sync targets — so we
	// create in the destination FIRST (taskwarrior-lib `import` preserves the
	// uuid/annotations/dates) and delete from the source AFTER. Worst case on a
	// partial failure is a duplicate (recoverable), never data loss.
	async moveTask(context, payload: { task: TaskWithProfile, fromProfile: string, toProfile: string }) {
		const { task, fromProfile, toProfile } = payload;
		const body = stripInternalFields(task);
		let created = false;
		try {
			await this.$axios.$put('/api/tasks', { tasks: [body] }, { headers: { 'X-Profile': toProfile } });
			created = true;
			await this.$axios.$delete('/api/tasks', {
				params: { tasks: [task.uuid] },
				headers: { 'X-Profile': fromProfile }
			});
		}
		catch (err) {
			// Create succeeded but delete failed → the task now lives in BOTH
			// profiles. Surface a specific error so the dialog can tell the user
			// to remove the leftover manually, instead of a generic failure.
			if (created) {
				const e: any = new Error(`moved to ${toProfile} but original left in ${fromProfile}`);
				e.moveLeftover = { uuid: task.uuid, fromProfile, toProfile };
				throw e;
			}
			throw err;
		}
		finally {
			try {
				await context.dispatch('fetchTasks');
			}
			catch (err) {
				console.error('[store] fetchTasks after move failed:', err);
			}
		}
	},

	async syncTasks(context) {
		const profiles = context.state.profiles;
		if (profiles.length <= 1) {
			await this.$axios.$post('/api/sync');
			await context.dispatch('fetchTasks');
			return;
		}
		// Sync every profile the user has access to. Run in parallel and
		// gather results so a single broken taskserver doesn't prevent the
		// other profiles from syncing.
		const results = await Promise.allSettled(
			profiles.map(p =>
				this.$axios.$post('/api/sync', null, {
					headers: { 'X-Profile': p.name }
				})
			)
		);
		const failed = profiles
			.filter((_, i) => results[i].status === 'rejected')
			.map(p => p.name);
		// Always refresh — partial-failure case still has fresh data from
		// the profiles that did sync, and surfacing it beats hiding it
		// behind a generic error notification.
		await context.dispatch('fetchTasks');
		if (failed.length > 0) {
			const err: any = new Error(`Sync failed for: ${failed.join(', ')}`);
			err.failedProfiles = failed;
			err.succeededCount = profiles.length - failed.length;
			throw err;
		}
	}
};

function groupByProfile(tasks: Task[]): Map<string | null, Task[]> {
	const groups = new Map<string | null, Task[]>();
	for (const t of tasks) {
		const key = (t as TaskWithProfile)._profile ?? null;
		const arr = groups.get(key) || [];
		arr.push(t); groups.set(key, arr);
	}
	return groups;
}

const INTERNAL_FIELDS = ['_profile', '_collapsedCount', '_siblingUuids'];
function stripInternalFields(task: Task): Task {
	const out: any = {};
	for (const k of Object.keys(task)) {
		if (!INTERNAL_FIELDS.includes(k)) out[k] = (task as any)[k];
	}
	return out as Task;
}

async function loadProfileMembers(
	axios: any,
	profile: string
): Promise<Array<{ email: string, name: string }>> {
	const payload: { members: Array<{ email: string, name: string }> }
		= await axios.$get(`/api/profiles/${encodeURIComponent(profile)}/members`);
	return payload.members;
}

export const accessorType = getAccessorType({
	state,
	mutations,
	actions
});
