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
			<button
				v-if="isMobile"
				type="button"
				class="tw-icon-btn tw-icon-btn--menu"
				title="Menu"
				aria-label="Toggle navigation"
				:aria-expanded="mobileDrawer"
				@click="mobileDrawer = !mobileDrawer"
			>
				<v-icon size="20" aria-hidden="true">mdi-menu</v-icon>
			</button>

			<div class="tw-wordmark">
				<span class="tw-wordmark__dot" aria-hidden="true" />
				<span>Taskwarrior</span>
			</div>

			<v-spacer />

			<button
				type="button"
				class="tw-icon-btn"
				:title="dark ? 'Light theme' : 'Dark theme'"
				:aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
				:aria-pressed="dark"
				@click="dark = !dark"
			>
				<v-icon size="18" aria-hidden="true">{{ dark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
			</button>

			<button
				type="button"
				class="tw-icon-btn"
				title="Settings"
				aria-label="Open settings"
				@click="settingsDialog = true"
			>
				<v-icon size="18" aria-hidden="true">mdi-cog-outline</v-icon>
			</button>
		</v-app-bar>

		<v-navigation-drawer
			v-model="mobileDrawer"
			app
			:permanent="!isMobile"
			:temporary="isMobile"
			:width="isMobile ? MOBILE_DRAWER_WIDTH : sidebarWidth"
			class="tw-sidebar"
			:class="{ 'tw-sidebar--resizing': resizing, 'tw-sidebar--mobile': isMobile }"
			:mini-variant="false"
		>
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
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--primary" aria-hidden="true">mdi-plus-circle</v-icon>
					<span class="tw-sidebar__label">Add task</span>
					<span class="tw-sidebar__shortcut" aria-hidden="true">q</span>
				</button>

				<button
					type="button"
					class="tw-sidebar__item"
					title="Search (/ or Ctrl+K)"
					@click="openSearch"
				>
					<v-icon size="16" class="tw-sidebar__icon" aria-hidden="true">mdi-magnify</v-icon>
					<span class="tw-sidebar__label">Search</span>
					<span class="tw-sidebar__shortcut" aria-hidden="true">/</span>
				</button>

				<div class="tw-sidebar__divider" aria-hidden="true" />

				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--inbox"
					:class="{ 'tw-sidebar__item--active': view === 'all' && !projectFilter && !tagFilter }"
					@click="selectInbox"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--inbox" aria-hidden="true">mdi-inbox-outline</v-icon>
					<span class="tw-sidebar__label">Inbox</span>
					<span class="tw-sidebar__count">{{ totalPending }}</span>
				</button>

				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--today"
					:class="{ 'tw-sidebar__item--active': view === 'today' }"
					@click="selectToday"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--today" aria-hidden="true">mdi-calendar-today</v-icon>
					<span class="tw-sidebar__label">Today</span>
					<span v-if="todayCount > 0" class="tw-sidebar__count tw-sidebar__count--today">{{ todayCount }}</span>
				</button>

				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--calendar"
					:class="{ 'tw-sidebar__item--active': view === 'calendar' }"
					@click="selectCalendar"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--calendar" aria-hidden="true">mdi-calendar-month-outline</v-icon>
					<span class="tw-sidebar__label">Calendar</span>
					<span v-if="calendarCount > 0" class="tw-sidebar__count tw-sidebar__count--calendar">{{ calendarCount }}</span>
				</button>

				<button
					v-if="hasMembers"
					type="button"
					class="tw-sidebar__item tw-sidebar__item--mine"
					:class="{ 'tw-sidebar__item--active': view === 'mine' }"
					@click="selectMine"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--mine" aria-hidden="true">mdi-account-outline</v-icon>
					<span class="tw-sidebar__label">Assigned to me</span>
					<span v-if="mineCount > 0" class="tw-sidebar__count tw-sidebar__count--mine">{{ mineCount }}</span>
				</button>

				<button
					type="button"
					class="tw-sidebar__item tw-sidebar__item--tag"
					:class="{ 'tw-sidebar__item--active': view === 'tags' || (view === 'all' && tagFilter) }"
					@click="selectTagsIndex"
				>
					<v-icon size="16" class="tw-sidebar__icon tw-sidebar__icon--tag" aria-hidden="true">mdi-tag-multiple-outline</v-icon>
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
							<v-icon size="16" class="tw-sidebar__icon" aria-hidden="true">mdi-folder-outline</v-icon>
							<span class="tw-sidebar__label">{{ p.name }}</span>
							<span v-if="p.count > 0" class="tw-sidebar__count tw-sidebar__project-count">{{ p.count }}</span>
						</button>
						<button
							type="button"
							class="tw-sidebar__project-edit"
							title="Rename or delete project"
							:aria-label="`Manage project ${p.name}`"
							@click.stop="manageProject(p.name)"
						>
							<v-icon size="14" aria-hidden="true">mdi-dots-horizontal</v-icon>
						</button>
					</div>
				</div>
			</nav>

			<div
				v-if="!isMobile"
				class="tw-sidebar__resize"
				title="Drag to resize · double-click to reset"
				role="separator"
				aria-orientation="vertical"
				@pointerdown="startResize"
				@dblclick="resetSidebarWidth"
			/>
		</v-navigation-drawer>

		<v-main>
			<nuxt />
		</v-main>

		<button
			v-if="isMobile && !fabHidden"
			type="button"
			class="tw-fab"
			title="New task"
			aria-label="New task"
			@click="openNewTask"
		>
			<v-icon size="26" aria-hidden="true">mdi-plus</v-icon>
		</button>
	</v-app>
</template>

<script lang="ts">
import { defineComponent, useContext, useStore, computed, onErrorCaptured, onMounted, onBeforeUnmount, ref, provide, watch } from '@nuxtjs/composition-api';
import moment from 'moment';
import SettingsDialog from '../components/SettingsDialog.vue';
import TaskDialog from '../components/TaskDialog.vue';
import SearchPalette from '../components/SearchPalette.vue';
import QuickAddPalette from '../components/QuickAddPalette.vue';
import ProjectManageDialog from '../components/ProjectManageDialog.vue';
import ShortcutsHelp from '../components/ShortcutsHelp.vue';
import { accessorType } from '../store';
import { collapseRecurring } from '../utils/collapse';
import { calendarTaskItems } from '../utils/calendar';

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
				// Multi-profile: tasks are loaded via /api/tasks/aggregate which
				// already covers every profile, so flipping the active profile
				// doesn't require a refetch — only the per-profile member list does.
				if (!store.getters.multiProfile) store.dispatch('fetchTasks');
			}
		});

		const projectFilter = computed(() => store.state.projectFilter);
		const tagFilter = computed(() => store.state.tagFilter);
		const view = computed(() => store.state.view);

		const pendingTasks = computed(() =>
			store.state.tasks.filter((t: any) => t.status === 'pending')
		);

		// Profile-scoped subsets for views that show "this profile only" data
		// (Inbox, project list, tags). Today/Mine deliberately ignore this.
		const ownTasks = computed((): any[] => store.getters.ownTasks);
		const ownPendingTasks = computed(() =>
			ownTasks.value.filter((t: any) => t.status === 'pending')
		);

		const totalPending = computed(() =>
			ownPendingTasks.value.filter((t: any) => !t.project && !t.parent).length
		);

		const totalTags = computed(() => {
			const set = new Set<string>();
			for (const t of ownTasks.value) {
				if (t.tags) for (const tg of t.tags) set.add(tg);
			}
			return set.size;
		});

		const todayCount = computed(() => {
			const endOfToday = moment().endOf('day');
			const now = moment();
			const todayList = pendingTasks.value.filter((t: any) => {
				if (!store.getters.inTodayScope(t)) return false;
				const waiting = (t.wait && moment(t.wait).isAfter(now))
					|| (t.scheduled && moment(t.scheduled).isAfter(now));
				return !waiting && t.due && moment(t.due).isSameOrBefore(endOfToday);
			});
			return collapseRecurring(todayList).length;
		});

		const calendarCount = computed(() => {
			const scoped = pendingTasks.value.filter((t: any) => store.getters.inCalendarScope(t));
			return calendarTaskItems(scoped).length;
		});

		const hasMembers = computed(() => store.state.members.length > 1);

		const mineCount = computed(() => {
			const me = store.state.user?.email;
			if (!me) return 0;
			return pendingTasks.value.filter((t: any) => t.assignee === me).length;
		});

		const projectList = computed(() => {
			const counts = new Map<string, number>();
			for (const t of ownPendingTasks.value) {
				if (t.project) counts.set(t.project, (counts.get(t.project) || 0) + 1);
			}
			// Include projects that have no pending tasks too (from any task),
			// but skip projects whose only remaining tasks are deleted — otherwise
			// a "deleted" project keeps showing in the sidebar with count 0.
			for (const t of ownTasks.value) {
				if (t.status === 'deleted') continue;
				if (t.project && !counts.has(t.project)) counts.set(t.project, 0);
			}
			return Array.from(counts.entries())
				.map(([name, count]) => ({ name, count }))
				.sort((a, b) => a.name.localeCompare(b.name));
		});

		const isMobile = computed(() => context.$vuetify.breakpoint.smAndDown);
		const mobileDrawer = ref(false);
		const MOBILE_DRAWER_WIDTH = 280;
		provide('isMobile', isMobile);

		const selectView = (view: string, project: string | null = null) => {
			store.commit('setProjectFilter', project);
			store.commit('setTagFilter', null);
			store.commit('setView', view);
			mobileDrawer.value = false;
		};

		const setProject = (name: string | null) => selectView('all', name);
		const selectInbox = () => selectView('all');
		const selectToday = () => selectView('today');
		const selectCalendar = () => selectView('calendar');
		const selectMine = () => selectView('mine');
		const selectTagsIndex = () => selectView('tags');
		const selectProjectsIndex = () => selectView('projects');

		const taskDialogOpen = computed(() => store.state.taskDialog.open);
		const taskDialogTask = computed(() => store.state.taskDialog.task);

		const onTaskDialogInput = (val: boolean) => {
			if (!val) store.commit('closeTaskDialog');
		};

		const openNewTask = () => {
			store.commit('setQuickAddOpen', true);
			mobileDrawer.value = false;
		};
		const openSearch = () => {
			store.commit('setSearchOpen', true);
			mobileDrawer.value = false;
		};
		const openQuickAdd = () => store.commit('setQuickAddOpen', true);

		const projectDialogOpen = ref(false);
		const projectDialogName = ref('');
		const manageProject = (name: string) => {
			projectDialogName.value = name;
			projectDialogOpen.value = true;
		};

		const shortcutsOpen = ref(false);
		const settingsDialog = ref(false);

		const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
		const SIDEBAR_DEFAULT = 240;
		const SIDEBAR_MIN = 200;
		const SIDEBAR_MAX = 480;
		const clampWidth = (n: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));

		const sidebarWidth = ref(SIDEBAR_DEFAULT);
		const resizing = ref(false);

		const onResizeMove = (e: PointerEvent) => {
			sidebarWidth.value = clampWidth(e.clientX);
		};
		const onResizeEnd = () => {
			resizing.value = false;
			window.removeEventListener('pointermove', onResizeMove);
			window.removeEventListener('pointerup', onResizeEnd);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value));
		};
		const startResize = (e: PointerEvent) => {
			e.preventDefault();
			resizing.value = true;
			window.addEventListener('pointermove', onResizeMove);
			window.addEventListener('pointerup', onResizeEnd);
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
		};
		const resetSidebarWidth = () => {
			sidebarWidth.value = SIDEBAR_DEFAULT;
			localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT));
		};

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

		// Hide the mobile FAB when anything else is on top — drawer, palette,
		// task dialog, settings, etc. — so it doesn't poke through overlays.
		const fabHidden = computed(() =>
			mobileDrawer.value
			|| store.state.quickAddOpen
			|| store.state.searchOpen
			|| store.state.taskDialog.open
			|| layoutDialogsOpen.value
		);

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
					case 'c': e.preventDefault(); selectCalendar(); return;
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

		onMounted(() => {
			window.addEventListener('keydown', onGlobalKeydown);
			const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
			const n = raw ? Number(raw) : NaN;
			if (Number.isFinite(n)) sidebarWidth.value = clampWidth(n);
		});
		onBeforeUnmount(() => {
			window.removeEventListener('keydown', onGlobalKeydown);
			window.removeEventListener('pointermove', onResizeMove);
			window.removeEventListener('pointerup', onResizeEnd);
			disarmG();
		});

		const dark = computed({
			get: () => context.$vuetify.theme.dark,
			set: val => {
				context.$vuetify.theme.dark = val;
				store.dispatch('updateSettings', { ...store.state.settings, dark: val });
			}
		});

		// Mirror the active theme onto <html> so native UI (scrollbars, native
		// inputs, form controls in dark mode on Windows) renders consistently.
		watch(dark, val => {
			if (typeof document !== 'undefined') {
				document.documentElement.style.setProperty('color-scheme', val ? 'dark' : 'light');
			}
		}, { immediate: true });

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
			calendarCount,
			hasMembers,
			mineCount,
			projectList,
			totalTags,
			setProject,
			selectInbox,
			selectToday,
			selectCalendar,
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

			sidebarWidth,
			resizing,
			startResize,
			resetSidebarWidth,

			isMobile,
			mobileDrawer,
			MOBILE_DRAWER_WIDTH,
			fabHidden,

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
