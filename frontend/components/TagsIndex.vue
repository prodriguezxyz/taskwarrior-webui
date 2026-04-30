<template>
	<div class="tw-tags-index">
		<TagManageDialog v-model="dialogOpen" :tag="dialogTag" />

		<div v-if="!tagList.length" class="tw-tags-index__empty">
			<v-icon size="28" class="tw-tags-index__empty-icon">mdi-tag-outline</v-icon>
			<p class="tw-tags-index__empty-title">No tags yet</p>
			<p class="tw-tags-index__empty-hint">
				Add a tag to any task (Edit → Tags) to see it here.
			</p>
		</div>

		<ul v-else class="tw-tags-index__list">
			<li
				v-for="t in tagList"
				:key="t.name"
				class="tw-tags-index__row"
			>
				<button
					type="button"
					class="tw-tags-index__main"
					@click="openTag(t.name)"
					:title="`Show tasks tagged ${t.name}`"
				>
					<v-icon size="16" class="tw-tags-index__icon">mdi-tag-outline</v-icon>
					<span class="tw-tags-index__name">{{ t.name }}</span>
					<span class="tw-tags-index__counts">
						<span class="tw-tags-index__count tw-tags-index__count--pending">
							{{ t.pending }} pending
						</span>
						<span class="tw-tags-index__count tw-tags-index__count--total">
							{{ t.total }} total
						</span>
					</span>
				</button>
				<button
					type="button"
					class="tw-tags-index__edit"
					title="Rename or delete tag"
					@click="manage(t.name)"
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
import TagManageDialog from './TagManageDialog.vue';

export default defineComponent({
	components: { TagManageDialog },

	setup() {
		const store = useStore<typeof accessorType>();

		const tagList = computed(() => {
			const pending = new Map<string, number>();
			const total = new Map<string, number>();
			for (const t of store.getters.ownTasks as Task[]) {
				if (!t.tags) continue;
				const isPending = t.status === 'pending';
				for (const tg of t.tags) {
					total.set(tg, (total.get(tg) || 0) + 1);
					if (isPending) pending.set(tg, (pending.get(tg) || 0) + 1);
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

		const openTag = (name: string) => {
			store.commit('setTagFilter', name);
			store.commit('setProjectFilter', null);
			store.commit('setView', 'all');
		};

		const dialogOpen = ref(false);
		const dialogTag = ref('');
		const manage = (name: string) => {
			dialogTag.value = name;
			dialogOpen.value = true;
		};

		return {
			tagList,
			openTag,
			dialogOpen,
			dialogTag,
			manage
		};
	}
});
</script>
