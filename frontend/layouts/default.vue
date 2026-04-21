<template>
	<v-app class="task-app">
		<SettingsDialog v-model="settingsDialog" />
		<TaskDialog :value="taskDialogOpen" :task="taskDialogTask || undefined" @input="onTaskDialogInput" />
		<SearchPalette />

		<v-snackbar
			v-model="snackbar"
			:color="notification.color"
			:timeout="4000"
		>
			{{ notification.text }}

			<template v-slot:action="{ attrs }">
				<v-btn
					dark
					text
					v-bind="attrs"
					@click="snackbar = false"
				>
					Close
				</v-btn>
			</template>
		</v-snackbar>

		<v-app-bar height="52px" fixed app flat>
			<div class="tw-wordmark">
				<span class="tw-wordmark__dot" />
				<span>Taskwarrior</span>
			</div>

			<v-spacer />

			<v-select
				v-if="profiles.length > 1"
				:items="profiles.map(p => p.name)"
				v-model="currentProfile"
				dense
				hide-details
				solo
				flat
				class="tw-profile-select mr-2"
				style="max-width: 160px"
			/>

			<div
				class="tw-icon-btn"
				role="button"
				tabindex="0"
				:title="dark ? 'Light theme' : 'Dark theme'"
				@click="dark = !dark"
				@keydown.enter="dark = !dark"
			>
				<v-icon size="18">{{ dark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
			</div>

			<div
				class="tw-icon-btn"
				role="button"
				tabindex="0"
				title="Settings"
				@click="settingsDialog = true"
				@keydown.enter="settingsDialog = true"
			>
				<v-icon size="18">mdi-cog-outline</v-icon>
			</div>
		</v-app-bar>

		<v-navigation-drawer app permanent width="240" class="tw-sidebar" :mini-variant="false">
			<nav class="tw-sidebar__nav">
				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--primary"
					title="New task"
					@click="openNewTask"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--primary">mdi-plus-circle</v-icon>
					<span class="tw-sidebar__label">Add task</span>
				</button>

				<button
					type="button"
					class="tw-sidebar__item"
					title="Search (/ or Ctrl+K)"
					@click="openSearch"
				>
					<v-icon size="16" class="tw-sidebar__icon">mdi-magnify</v-icon>
					<span class="tw-sidebar__label">Search</span>
					<span class="tw-sidebar__shortcut">/</span>
				</button>

				<div class="tw-sidebar__divider" />

				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--inbox"
					:class="{ 'tw-sidebar__item--active': view === 'all' && !projectFilter }"
					@click="selectInbox"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--inbox">mdi-inbox-outline</v-icon>
					<span class="tw-sidebar__label">Inbox</span>
					<span class="tw-sidebar__count">{{ totalPending }}</span>
				</button>

				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--today"
					:class="{ 'tw-sidebar__item--active': view === 'today' }"
					@click="selectToday"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--today">mdi-calendar-today</v-icon>
					<span class="tw-sidebar__label">Today</span>
					<span v-if="todayCount > 0" class="tw-sidebar__count tw-sidebar__count--today">{{ todayCount }}</span>
				</button>

				<div v-if="projectList.length" class="tw-sidebar__section">
					<span class="tw-sidebar__heading">Projects</span>
					<button
						v-for="p in projectList"
						:key="p.name"
						type="button"
						class="tw-sidebar__item"
						:class="{ 'tw-sidebar__item--active': view === 'all' && projectFilter === p.name }"
						@click="setProject(p.name)"
					>
						<v-icon size="16" class="tw-sidebar__icon">mdi-folder-outline</v-icon>
						<span class="tw-sidebar__label">{{ p.name }}</span>
						<span v-if="p.count > 0" class="tw-sidebar__count">{{ p.count }}</span>
					</button>
				</div>
			</nav>
		</v-navigation-drawer>

		<v-main>
			<nuxt />
		</v-main>
	</v-app>
</template>

<script lang="ts">
import { defineComponent, useContext, useStore, computed, onErrorCaptured, onMounted, onBeforeUnmount, ref } from '@nuxtjs/composition-api';
import moment from 'moment';
import SettingsDialog from '../components/SettingsDialog.vue';
import TaskDialog from '../components/TaskDialog.vue';
import SearchPalette from '../components/SearchPalette.vue';
import { accessorType } from '../store';

export default defineComponent({
	setup(_props, ctx) {
		const context = useContext();
		const store = useStore<typeof accessorType>();
		store.dispatch('fetchHiddenColumns');

		context.$vuetify.theme.dark = store.state.settings.dark;

		const profiles = computed(() => store.state.profiles);
		const currentProfile = computed({
			get: () => store.state.settings.profile,
			set: val => {
				store.dispatch('updateSettings', { ...store.state.settings, profile: val });
				store.dispatch('fetchTasks');
			}
		});

		const projectFilter = computed(() => store.state.projectFilter);
		const view = computed(() => store.state.view);

		const pendingTasks = computed(() =>
			store.state.tasks.filter((t: any) => t.status === 'pending')
		);

		const totalPending = computed(() =>
			pendingTasks.value.filter((t: any) => !t.project).length
		);

		const todayCount = computed(() => {
			const endOfToday = moment().endOf('day');
			const now = moment();
			return pendingTasks.value.filter((t: any) => {
				const waiting = (t.wait && moment(t.wait).isAfter(now))
					|| (t.scheduled && moment(t.scheduled).isAfter(now));
				return !waiting && t.due && moment(t.due).isSameOrBefore(endOfToday);
			}).length;
		});

		const projectList = computed(() => {
			const counts = new Map<string, number>();
			for (const t of pendingTasks.value) {
				if (t.project) counts.set(t.project, (counts.get(t.project) || 0) + 1);
			}
			// Include projects that have no pending tasks too (from any task)
			for (const t of store.state.tasks) {
				if (t.project && !counts.has(t.project)) counts.set(t.project, 0);
			}
			return Array.from(counts.entries())
				.map(([name, count]) => ({ name, count }))
				.sort((a, b) => a.name.localeCompare(b.name));
		});

		const setProject = (name: string | null) => {
			store.commit('setProjectFilter', name);
			store.commit('setView', 'all');
		};

		const selectInbox = () => {
			store.commit('setProjectFilter', null);
			store.commit('setView', 'all');
		};

		const selectToday = () => {
			store.commit('setProjectFilter', null);
			store.commit('setView', 'today');
		};

		const taskDialogOpen = computed(() => store.state.taskDialog.open);
		const taskDialogTask = computed(() => store.state.taskDialog.task);

		const onTaskDialogInput = (val: boolean) => {
			if (!val) store.commit('closeTaskDialog');
		};

		const openNewTask = () => store.commit('openNewTaskDialog');
		const openSearch = () => store.commit('setSearchOpen', true);

		const onGlobalKeydown = (e: KeyboardEvent) => {
			const isCtrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
			const isSlash = e.key === '/';
			if (!isCtrlK && !isSlash) return;
			if (isSlash) {
				const t = e.target as HTMLElement | null;
				if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
			}
			e.preventDefault();
			openSearch();
		};

		onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
		onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown));

		const dark = computed({
			get: () => context.$vuetify.theme.dark,
			set: val => {
				context.$vuetify.theme.dark = val;
			}
		});

		const settingsDialog = ref(false);

		const notification = computed(() => store.state.notification);
		const snackbar = computed({
			get: () => store.state.snackbar,
			set: val => store.commit('setSnackbar', val)
		});

		onErrorCaptured((err: any) => {
			let notification: any;
			if (err?.response) {
				const { status, data } = err.response!;
				notification = {
					color: 'error',
					text: `Error ${status}: ${data}`
				};
			}
			else {
				const { name, message } = err as Error;
				notification = {
					color: 'error',
					text: `Error ${name}: ${message}`
				};
			}
			store.commit('setNotification', notification);
			return false;
		});

		return {
			dark,
			snackbar,
			notification,
			settingsDialog,
			profiles,
			currentProfile,
			projectFilter,
			view,
			totalPending,
			todayCount,
			projectList,
			setProject,
			selectInbox,
			selectToday,

			taskDialogOpen,
			taskDialogTask,
			onTaskDialogInput,
			openNewTask,
			openSearch,

			SettingsDialog,
			TaskDialog,
			SearchPalette
		};
	}
});
</script>
