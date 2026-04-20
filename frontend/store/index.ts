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
	settings: {
		dark: false,
		autoRefresh: '5', // in minutes
		autoSync: '0', // in minutes
		profile: ''
	},
	hiddenColumns: [] as string[],
	profiles: [] as Array<{ name: string }>,
	defaultProfile: ''
});

export type RootState = ReturnType<typeof state>;

export const getters: GetterTree<RootState, RootState> = {
	projects: state => state.tasks.map(task => task.project).filter(p => p !== undefined),
	tags: state => state.tasks.reduce((tags: string[], task) => {
		return task.tags ? tags.concat(task.tags) : tags;
	}, [])
};

export const mutations: MutationTree<RootState> = {
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
	}
};

export const actions: ActionTree<RootState, RootState> = {
	fetchSettings(context) {
		const raw = localStorage.getItem('settings');
		const saved = raw ? JSON.parse(raw) : {};
		context.commit('setSettings', { ...context.state.settings, ...saved });
	},

	updateSettings(context, settings) {
		context.commit('setSettings', settings);
		localStorage.setItem('settings', JSON.stringify(settings));
	},

	fetchHiddenColumns(context) {
		const columns = localStorage.getItem('hiddenColumns');
		if (columns) {
			context.commit('setHiddenColumns', JSON.parse(columns));
		}
	},

	updateHiddenColumns(context, columns) {
		context.commit('setHiddenColumns', columns);
		localStorage.setItem('hiddenColumns', JSON.stringify(columns));
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
