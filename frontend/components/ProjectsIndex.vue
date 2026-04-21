<template>
	<div class="tw-projects-index">
		<ProjectManageDialog v-model="dialogOpen" :project="dialogProject" />

		<div v-if="!projectList.length" class="tw-projects-index__empty">
			<v-icon size="28" class="tw-projects-index__empty-icon">mdi-folder-outline</v-icon>
			<p class="tw-projects-index__empty-title">No projects yet</p>
			<p class="tw-projects-index__empty-hint">
				Assign a project to any task (Edit → Project) to see it here.
			</p>
		</div>

		<ul v-else class="tw-projects-index__list">
			<li
				v-for="p in projectList"
				:key="p.name"
				class="tw-projects-index__row"
			>
				<button
					type="button"
					class="tw-projects-index__main"
					@click="openProject(p.name)"
					:title="`Show tasks in ${p.name}`"
				>
					<v-icon size="16" class="tw-projects-index__icon">mdi-folder-outline</v-icon>
					<span class="tw-projects-index__name">{{ p.name }}</span>
					<span class="tw-projects-index__counts">
						<span class="tw-projects-index__count tw-projects-index__count--pending">
							{{ p.pending }} pending
						</span>
						<span class="tw-projects-index__count tw-projects-index__count--total">
							{{ p.total }} total
						</span>
					</span>
				</button>
				<button
					type="button"
					class="tw-projects-index__edit"
					title="Rename or delete project"
					@click="manage(p.name)"
				>
					<v-icon size="16">mdi-pencil-outline</v-icon>
					<span>Edit</span>
				</button>
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, useStore } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import { accessorType } from '../store';
import ProjectManageDialog from './ProjectManageDialog.vue';

export default defineComponent({
	components: { ProjectManageDialog },

	setup() {
		const store = useStore<typeof accessorType>();

		const projectList = computed(() => {
			const pending = new Map<string, number>();
			const total = new Map<string, number>();
			for (const t of store.state.tasks as Task[]) {
				if (!t.project) continue;
				total.set(t.project, (total.get(t.project) || 0) + 1);
				if (t.status === 'pending') {
					pending.set(t.project, (pending.get(t.project) || 0) + 1);
				}
			}
			return Array.from(total.entries())
				.map(([name, totalCount]) => ({
					name,
					pending: pending.get(name) || 0,
					total: totalCount
				}))
				.sort((a, b) => a.name.localeCompare(b.name));
		});

		const openProject = (name: string) => {
			store.commit('setProjectFilter', name);
			store.commit('setTagFilter', null);
			store.commit('setView', 'all');
		};

		const dialogOpen = ref(false);
		const dialogProject = ref('');
		const manage = (name: string) => {
			dialogProject.value = name;
			dialogOpen.value = true;
		};

		return {
			projectList,
			openProject,
			dialogOpen,
			dialogProject,
			manage
		};
	}
});
</script>
