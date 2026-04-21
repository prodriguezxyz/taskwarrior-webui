<template>
	<div>
		<div class="tw-page">
			<header class="tw-page__header">
				<h1 class="tw-page__title">
					{{ projectFilter || 'All tasks' }}
					<span class="tw-page__count">{{ pendingCount }}</span>
				</h1>
				<div v-if="projectFilter" class="tw-page__meta">
					{{ progress }}% complete
				</div>
			</header>
		</div>

		<TaskList :tasks="tasks" />
	</div>
</template>

<script lang="ts">
import { defineComponent, computed, watch, ComputedRef, useStore, useContext } from '@nuxtjs/composition-api';
import TaskList from '../components/TaskList.vue';
import { Task } from 'taskwarrior-lib';
import { accessorType } from '../store';

export default defineComponent({
	setup() {
		const store = useStore<typeof accessorType>();
		const context = useContext();
		store.dispatch('fetchTasks');

		let refreshInterval: NodeJS.Timeout | null = null;
		const setAutoRefresh = () => {
			if (refreshInterval)
				clearInterval(refreshInterval);
			const freq = +store.state.settings.autoRefresh;
			if (freq > 0) {
				refreshInterval = setInterval(() => {
					store.dispatch('fetchTasks');
				}, +store.state.settings.autoRefresh * 60000);
			}
		};
		setAutoRefresh();

		let syncInterval: NodeJS.Timeout | null = null;
		const setAutoSync = () => {
			if (syncInterval)
				clearInterval(syncInterval);
			const freq = +store.state.settings.autoSync;
			if (freq > 0) {
				syncInterval = setInterval(() => {
					store.dispatch('syncTasks');
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

		const pendingCount = computed(() => {
			const base = store.state.tasks.filter((t: Task) => t.status === 'pending');
			return projectFilter.value
				? base.filter((t: Task) => t.project === projectFilter.value).length
				: base.length;
		});

		const progress = computed(() => {
			if (!projectFilter.value) return 0;
			const proj = projectFilter.value;
			const rel = store.state.tasks.filter((t: Task) => t.project === proj);
			const completed = rel.reduce((acc: number, t: Task) => t.status === 'completed' ? acc + 1 : acc, 0);
			const pending = rel.reduce((acc: number, t: Task) => t.status === 'pending' ? acc + 1 : acc, 0);
			const total = completed + pending;
			return total === 0 ? 100 : Math.round(100 * completed / total);
		});

		return {
			TaskList,
			tasks,
			projectFilter,
			pendingCount,
			progress
		};
	}
});
</script>
