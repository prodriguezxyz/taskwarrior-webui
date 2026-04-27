<template>
	<v-app class="task-app">
		<SettingsDialog v-model="settingsDialog" />
		<TaskDialog :value="taskDialogOpen" :task="taskDialogTask || undefined" @input="onTaskDialogInput" />
		<SearchPalette />
		<QuickAddPalette />
		<ProjectManageDialog v-model="projectDialogOpen" :project="projectDialogName" />
		<ShortcutsHelp v-model="shortcutsOpen" />

		<v-snackbar
			v-model="snackbar"
			:color="notification.color"
			:timeout="notification.actionHandler ? 6000 : 4000"
		>
			{{ notification.text }}

			<template v-slot:action="{ attrs }">
				<v-btn
					v-if="notification.actionHandler"
					dark
					text
					v-bind="attrs"
					@click="runNotificationAction"
				>
					{{ notification.actionText || 'Undo' }}
				</v-btn>
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
			<div v-if="profiles.length > 1" class="tw-sidebar__header">
				<v-select
					:items="profiles.map(p => p.name)"
					v-model="currentProfile"
					dense
					hide-details
					solo
					flat
					prepend-inner-icon="mdi-account-circle-outline"
					append-icon="mdi-unfold-more-horizontal"
					class="tw-profile-select"
					:menu-props="{ offsetY: true, contentClass: 'tw-profile-menu' }"
					aria-label="Switch profile"
				/>
			</div>

			<nav class="tw-sidebar__nav">
				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--primary"
					title="New task (q)"
					@click="openNewTask"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--primary">mdi-plus-circle</v-icon>
					<span class="tw-sidebar__label">Add task</span>
					<span class="tw-sidebar__shortcut">q</span>
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
					:class="{ 'tw-sidebar__item--active': view === 'all' && !projectFilter && !tagFilter }"
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

				<button
					v-if="hasMembers"
					type="button"
					class="tw-sidebar__item tw-sidebar__item--mine"
					:class="{ 'tw-sidebar__item--active': view === 'mine' }"
					@click="selectMine"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--mine">mdi-account-outline</v-icon>
					<span class="tw-sidebar__label">Assigned to me</span>
					<span v-if="mineCount > 0" class="tw-sidebar__count tw-sidebar__count--mine">{{ mineCount }}</span>
				</button>

				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--tag"
					:class="{ 'tw-sidebar__item--active': view === 'tags' || (view === 'all' && tagFilter) }"
					@click="selectTagsIndex"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--tag">mdi-tag-multiple-outline</v-icon>
					<span class="tw-sidebar__label">Tags</span>
					<span v-if="totalTags > 0" class="tw-sidebar__count">{{ totalTags }}</span>
				</button>

				<div v-if="projectList.length" class="tw-sidebar__section">
					<button
						type="button"
						class="tw-sidebar__heading tw-sidebar__heading--button"
						:class="{ 'tw-sidebar__heading--active': view === 'projects' }"
						title="Manage projects"
						@click="selectProjectsIndex"
					>
						Projects
					</button>
					<div
						v-for="p in projectList"
						:key="p.name"
						class="tw-sidebar__project"
					>
						<button
							type="button"
							class="tw-sidebar__item tw-sidebar__project-main"
							:class="{ 'tw-sidebar__item--active': view === 'all' && projectFilter === p.name }"
							@click="setProject(p.name)"
						>
							<v-icon size="16" class="tw-sidebar__icon">mdi-folder-outline</v-icon>
							<span class="tw-sidebar__label">{{ p.name }}</span>
							<span v-if="p.count > 0" class="tw-sidebar__count tw-sidebar__project-count">{{ p.count }}</span>
						</button>
						<button
							type="button"
							class="tw-sidebar__project-edit"
							title="Rename or delete project"
							@click.stop="manageProject(p.name)"
						>
							<v-icon size="14">mdi-dots-horizontal</v-icon>
						</button>
					</div>
				</div>
			</nav>
		</v-navigation-drawer>

		<v-main>
			<nuxt />
		</v-main>
	</v-app>
</template>

<script lang="ts">
import { defineComponent, useContext, useStore, computed, onErrorCaptured, onMounted, onBeforeUnmount, ref, provide } from '@nuxtjs/composition-api';
import moment from 'moment';
import SettingsDialog from '../components/SettingsDialog.vue';
import TaskDialog from '../components/TaskDialog.vue';
import SearchPalette from '../components/SearchPalette.vue';
import QuickAddPalette from '../components/QuickAddPalette.vue';
import ProjectManageDialog from '../components/ProjectManageDialog.vue';
import ShortcutsHelp from '../components/ShortcutsHelp.vue';
import { accessorType } from '../store';

export default defineComponent({
	setup(_props, _ctx) {
		const context = useContext();
		const store = useStore<typeof accessorType>();
		store.dispatch('fetchHiddenColumns');

		context.$vuetify.theme.dark = store.state.settings.dark;

		const profiles = computed(() => store.state.profiles);
		const currentProfile = computed({
			get: () => store.state.settings.profile,
			set: val => {
				store.dispatch('updateSettings', { ...store.state.settings, profile: val });
				store.dispatch('fetchMembers');
				store.dispatch('fetchTasks');
			}
		});

		const projectFilter = computed(() => store.state.projectFilter);
		const tagFilter = computed(() => store.state.tagFilter);
		const view = computed(() => store.state.view);

		const pendingTasks = computed(() =>
			store.state.tasks.filter((t: any) => t.status === 'pending')
		);

		const totalPending = computed(() =>
			pendingTasks.value.filter((t: any) => !t.project && !t.parent).length
		);

		const totalTags = computed(() => {
			const set = new Set<string>();
			for (const t of store.state.tasks) {
				if (t.tags) for (const tg of t.tags) set.add(tg);
			}
			return set.size;
		});

		const todayCount = computed(() => {
			const endOfToday = moment().endOf('day');
			const now = moment();
			return pendingTasks.value.filter((t: any) => {
				const waiting = (t.wait && moment(t.wait).isAfter(now))
					|| (t.scheduled && moment(t.scheduled).isAfter(now));
				return !waiting && t.due && moment(t.due).isSameOrBefore(endOfToday);
			}).length;
		});

		const hasMembers = computed(() => store.state.members.length > 1);

		const mineCount = computed(() => {
			const me = store.state.user?.email;
			if (!me) return 0;
			return pendingTasks.value.filter((t: any) => t.assignee === me).length;
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
			store.commit('setTagFilter', null);
			store.commit('setView', 'all');
		};

		const selectInbox = () => {
			store.commit('setProjectFilter', null);
			store.commit('setTagFilter', null);
			store.commit('setView', 'all');
		};

		const selectToday = () => {
			store.commit('setProjectFilter', null);
			store.commit('setTagFilter', null);
			store.commit('setView', 'today');
		};

		const selectMine = () => {
			store.commit('setProjectFilter', null);
			store.commit('setTagFilter', null);
			store.commit('setView', 'mine');
		};

		const selectTagsIndex = () => {
			store.commit('setProjectFilter', null);
			store.commit('setTagFilter', null);
			store.commit('setView', 'tags');
		};

		const selectProjectsIndex = () => {
			store.commit('setProjectFilter', null);
			store.commit('setTagFilter', null);
			store.commit('setView', 'projects');
		};

		const taskDialogOpen = computed(() => store.state.taskDialog.open);
		const taskDialogTask = computed(() => store.state.taskDialog.task);

		const onTaskDialogInput = (val: boolean) => {
			if (!val) store.commit('closeTaskDialog');
		};

		const openNewTask = () => store.commit('setQuickAddOpen', true);
		const openSearch = () => store.commit('setSearchOpen', true);
		const openQuickAdd = () => store.commit('setQuickAddOpen', true);

		const projectDialogOpen = ref(false);
		const projectDialogName = ref('');
		const manageProject = (name: string) => {
			projectDialogName.value = name;
			projectDialogOpen.value = true;
		};

		const shortcutsOpen = ref(false);
		const settingsDialog = ref(false);

		const isTypingTarget = (el: EventTarget | null) => {
			if (!(el instanceof HTMLElement)) return false;
			const tag = el.tagName;
			return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
		};

		const anyDialogOpen = () =>
			store.state.searchOpen
			|| store.state.quickAddOpen
			|| store.state.taskDialog.open
			|| settingsDialog.value
			|| projectDialogOpen.value
			|| shortcutsOpen.value;

		const layoutDialogsOpen = computed(() =>
			settingsDialog.value || projectDialogOpen.value || shortcutsOpen.value
		);
		provide('layoutDialogsOpen', layoutDialogsOpen);

		let gPending = false;
		let gTimer: number | null = null;
		const armG = () => {
			gPending = true;
			if (gTimer !== null) window.clearTimeout(gTimer);
			gTimer = window.setTimeout(() => {
				gPending = false; gTimer = null;
			}, 800);
		};
		const disarmG = () => {
			gPending = false;
			if (gTimer !== null) {
				window.clearTimeout(gTimer); gTimer = null;
			}
		};

		const onGlobalKeydown = (e: KeyboardEvent) => {
			// Ctrl+K works everywhere (Linear/Slack idiom), even inside inputs.
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				openSearch();
				return;
			}

			if (isTypingTarget(e.target)) return;
			if (anyDialogOpen()) return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			if (gPending) {
				disarmG();
				switch (e.key.toLowerCase()) {
					case 'i': e.preventDefault(); selectInbox(); return;
					case 't': e.preventDefault(); selectToday(); return;
					case 'p': e.preventDefault(); selectProjectsIndex(); return;
					case 'g': e.preventDefault(); selectTagsIndex(); return;
				}
				// Unknown continuation — fall through so the key still acts as a shortcut.
			}

			switch (e.key) {
				case '/':
					e.preventDefault(); openSearch(); return;
				case 'q':
				case 'a':
					e.preventDefault(); openQuickAdd(); return;
				case 'g':
					e.preventDefault(); armG(); return;
				case 's':
					e.preventDefault(); store.dispatch('syncTasks'); return;
				case 'r':
					e.preventDefault(); store.dispatch('fetchTasks'); return;
				case '?':
					e.preventDefault(); shortcutsOpen.value = true;
			}
		};

		onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
		onBeforeUnmount(() => {
			window.removeEventListener('keydown', onGlobalKeydown);
			disarmG();
		});

		const dark = computed({
			get: () => context.$vuetify.theme.dark,
			set: val => {
				context.$vuetify.theme.dark = val;
			}
		});

		const notification = computed(() => store.state.notification);
		const snackbar = computed({
			get: () => store.state.snackbar,
			set: val => store.commit('setSnackbar', val)
		});

		const runNotificationAction = () => {
			const handler = store.state.notification.actionHandler;
			store.commit('setSnackbar', false);
			if (handler) handler();
		};

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
			runNotificationAction,
			settingsDialog,
			profiles,
			currentProfile,
			projectFilter,
			tagFilter,
			view,
			totalPending,
			todayCount,
			hasMembers,
			mineCount,
			projectList,
			totalTags,
			setProject,
			selectInbox,
			selectToday,
			selectMine,
			selectTagsIndex,
			selectProjectsIndex,

			taskDialogOpen,
			taskDialogTask,
			onTaskDialogInput,
			openNewTask,
			openSearch,
			openQuickAdd,

			projectDialogOpen,
			projectDialogName,
			manageProject,

			shortcutsOpen,

			SettingsDialog,
			TaskDialog,
			SearchPalette,
			QuickAddPalette,
			ProjectManageDialog,
			ShortcutsHelp
		};
	}
});
</script>
