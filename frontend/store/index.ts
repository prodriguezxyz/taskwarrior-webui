import { ActionTree, MutationTree, GetterTree } from 'vuex';
import { Task } from 'taskwarrior-lib';
import { getAccessorType } from 'typed-vuex';

export const state = () => ({
	tasks: [] as Task[],
	snackbar: false,
	notification: {
		color: '',
		text: ''
	},
	user: null as { email: string, profiles: string[] } | null,
	settings: {
		dark: false,
		autoRefresh: '5', // in minutes
		autoSync: '0', // in minutes
		profile: ''
	},
	hiddenColumns: [] as string[],
	profiles: [] as Array<{ name: string }>,
	defaultProfile: '',
	projectFilter: null as string | null,
	tagFilter: null as string | null,
	view: 'all' as 'all' | 'today' | 'tags' | 'projects',
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

	setView(state, value: 'all' | 'today' | 'tags' | 'projects') {
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

	async fetchTasks(context) {
		const tasks: Task[] = await this.$axios.$get('/api/tasks');
		context.commit('setTasks', tasks);
	},

	async deleteTasks(context, tasks: Task[]) {
		await this.$axios.$delete('/api/tasks', {
			params: { tasks: tasks.map(task => task.uuid) }
		});
		// Refresh
		await context.dispatch('fetchTasks');
	},

	async updateTasks(context, tasks: Task[]) {
		await this.$axios.$put('/api/tasks', { tasks });
		// Refresh
		await context.dispatch('fetchTasks');
	},

	async syncTasks(context) {
		await this.$axios.$post('/api/sync');
		await context.dispatch('fetchTasks');
	}
};

export const accessorType = getAccessorType({
	state,
	mutations,
	actions
});
