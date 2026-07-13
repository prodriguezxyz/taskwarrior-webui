<template>
	<div>
		<div class="tw-page" :class="{ 'tw-page--wide': view === 'calendar' }">
			<header class="tw-page__header">
				<h1 class="tw-page__title">
					<v-icon size="22" :class="['tw-page__icon', pageIconTone]">{{ pageIcon }}</v-icon>
					{{ pageTitle }}
					<span class="tw-page__count">{{ pendingCount }}</span>
				</h1>
				<div v-if="projectFilter || tagFilter" class="tw-page__meta">
					{{ progress }}% complete
				</div>
			</header>
		</div>

		<CalendarView v-if="view === 'calendar'" :tasks="tasks" />
		<TagsIndex v-else-if="view === 'tags'" />
		<ProjectsIndex v-else-if="view === 'projects'" />
		<TaskList v-else :tasks="tasks" />
	</div>
</template>

<script lang="ts">
import { defineComponent, computed, watch, ComputedRef, useStore, useContext } from '@nuxtjs/composition-api';
import moment from 'moment';
import TaskList from '../components/TaskList.vue';
import CalendarView from '../components/CalendarView.vue';
import TagsIndex from '../components/TagsIndex.vue';
import ProjectsIndex from '../components/ProjectsIndex.vue';
import { Task } from 'taskwarrior-lib';
import { accessorType } from '../store';
import { collapseRecurring } from '../utils/collapse';
import { calendarTaskItems } from '../utils/calendar';

export default defineComponent({
	setup() {
		const store = useStore<typeof accessorType>();
		const context = useContext();
		store.dispatch('fetchTasks');

		let refreshInterval: ReturnType<typeof setInterval> | null = null;
		const setAutoRefresh = () => {
			if (refreshInterval)
				clearInterval(refreshInterval);
			const freq = +store.state.settings.autoRefresh;
			if (freq > 0) {
				refreshInterval = setInterval(() => {
					// Background tick: log and move on. A transient blip shouldn't
					// pop a toast (the user didn't ask for this refresh) or leave
					// an unhandled promise rejection.
					store.dispatch('fetchTasks').catch(err => {
						console.error('[autoRefresh] fetchTasks failed:', err);
					});
				}, +store.state.settings.autoRefresh * 60000);
			}
		};
		setAutoRefresh();

		let syncInterval: ReturnType<typeof setInterval> | null = null;
		const setAutoSync = () => {
			if (syncInterval)
				clearInterval(syncInterval);
			const freq = +store.state.settings.autoSync;
			if (freq > 0) {
				syncInterval = setInterval(() => {
					store.dispatch('syncTasks').catch(err => {
						console.error('[autoSync] syncTasks failed:', err);
					});
				}, +store.state.settings.autoSync * 60000);
			}
		};
		setAutoSync();

		watch(() => store.state.settings, () => {
			setAutoSync();
			setAutoRefresh();
			context.$vuetify.theme.dark = store.state.settings.dark;
		});

		const tasks: ComputedRef<Task[]> = computed(() => store.state.tasks);

		const projectFilter = computed(() => store.state.projectFilter);
		const tagFilter = computed(() => store.state.tagFilter);
		const view = computed(() => store.state.view);

		const pageTitle = computed(() => {
			if (view.value === 'today') return 'Today';
			if (view.value === 'calendar') return 'Calendar';
			if (view.value === 'mine') return 'Assigned to me';
			if (view.value === 'tags') return 'Tags';
			if (view.value === 'projects') return 'Projects';
			if (tagFilter.value) return `#${tagFilter.value}`;
			if (projectFilter.value) return projectFilter.value;
			return 'Inbox';
		});

		const pageIcon = computed(() => {
			if (view.value === 'today') return 'mdi-calendar-today';
			if (view.value === 'calendar') return 'mdi-calendar-month-outline';
			if (view.value === 'mine') return 'mdi-account-outline';
			if (view.value === 'tags') return 'mdi-tag-multiple-outline';
			if (view.value === 'projects') return 'mdi-folder-multiple-outline';
			if (tagFilter.value) return 'mdi-tag-outline';
			if (projectFilter.value) return 'mdi-folder-outline';
			return 'mdi-inbox-outline';
		});

		const pageIconTone = computed(() => {
			if (view.value === 'today') return 'tw-page__icon--today';
			if (view.value === 'calendar') return 'tw-page__icon--calendar';
			if (view.value === 'mine') return 'tw-page__icon--mine';
			if (view.value === 'tags') return 'tw-page__icon--tag';
			if (view.value === 'projects') return '';
			if (tagFilter.value) return 'tw-page__icon--tag';
			if (projectFilter.value) return '';
			return 'tw-page__icon--inbox';
		});

		const ownTasks = computed((): Task[] => store.getters.ownTasks);

		const pendingCount = computed(() => {
			if (view.value === 'today') {
				const endOfToday = moment().endOf('day');
				const now = moment();
				const todayList = store.state.tasks.filter((t: Task) => {
					if (t.status !== 'pending') return false;
					if (!store.getters.inTodayScope(t)) return false;
					const waiting = (t.wait && moment(t.wait).isAfter(now))
						|| (t.scheduled && moment(t.scheduled).isAfter(now));
					return !waiting && t.due && moment(t.due).isSameOrBefore(endOfToday);
				});
				return collapseRecurring(todayList).length;
			}
			if (view.value === 'calendar') {
				const scoped = store.state.tasks.filter((t: Task) => store.getters.inCalendarScope(t));
				return calendarTaskItems(scoped).length;
			}
			if (view.value === 'mine') {
				const me = store.state.user?.email;
				if (!me) return 0;
				return store.state.tasks.filter((t: Task) =>
					t.status === 'pending' && (t as any).assignee === me).length;
			}
			if (view.value === 'tags') {
				const set = new Set<string>();
				for (const t of ownTasks.value) {
					if (t.tags) for (const tg of t.tags) set.add(tg);
				}
				return set.size;
			}
			if (view.value === 'projects') {
				const set = new Set<string>();
				for (const t of ownTasks.value) {
					if (t.project) set.add(t.project);
				}
				return set.size;
			}
			const ownPending = ownTasks.value.filter((t: Task) => t.status === 'pending');
			if (tagFilter.value) {
				return ownPending.filter((t: Task) => t.tags?.includes(tagFilter.value!)).length;
			}
			if (projectFilter.value) {
				return ownPending.filter((t: Task) => t.project === projectFilter.value).length;
			}
			return ownPending.filter((t: Task) => !t.project && !(t as any).parent).length;
		});

		const progress = computed(() => {
			let rel: Task[];
			if (tagFilter.value) {
				const tg = tagFilter.value;
				rel = ownTasks.value.filter((t: Task) => t.tags?.includes(tg));
			}
			else if (projectFilter.value) {
				const proj = projectFilter.value;
				rel = ownTasks.value.filter((t: Task) => t.project === proj);
			}
			else {
				return 0;
			}
			let completed = 0; let pending = 0;
			for (const t of rel) {
				if (t.status === 'completed') completed++;
				else if (t.status === 'pending') pending++;
			}
			const total = completed + pending;
			return total === 0 ? 100 : Math.round(100 * completed / total);
		});

		return {
			TaskList,
			CalendarView,
			TagsIndex,
			ProjectsIndex,
			tasks,
			projectFilter,
			tagFilter,
			view,
			pageTitle,
			pageIcon,
			pageIconTone,
			pendingCount,
			progress
		};
	}
});
</script>
