<template>
	<v-dialog
		v-model="open"
		max-width="640"
		content-class="tw-palette__dialog"
		transition="fade-transition"
		@keydown.esc="close"
	>
		<div class="tw-palette" role="dialog" aria-label="Search tasks">
			<div class="tw-palette__inputwrap">
				<v-icon size="18" class="tw-palette__icon" aria-hidden="true">mdi-magnify</v-icon>
				<input
					ref="inputRef"
					v-model="query"
					type="search"
					class="tw-palette__input"
					aria-label="Search tasks"
					placeholder="Search tasks, projects, tags…"
					autocomplete="off"
					spellcheck="false"
					inputmode="search"
					enterkeyhint="search"
					@keydown.down.prevent="move(1)"
					@keydown.up.prevent="move(-1)"
					@keydown.enter.prevent="choose(results[activeIdx])"
					@keydown.alt.a.prevent="includeArchived = !includeArchived"
				/>
				<button
					type="button"
					class="tw-palette__toggle"
					:class="{ 'tw-palette__toggle--active': includeArchived }"
					:title="includeArchived ? 'Searching active + archived (Alt+A)' : 'Search archived too (Alt+A)'"
					:aria-pressed="includeArchived"
					@click="includeArchived = !includeArchived"
				>
					<v-icon size="14" aria-hidden="true">mdi-archive-outline</v-icon>
					<span class="tw-palette__toggle-label">Archived</span>
				</button>
				<button
					v-if="query"
					type="button"
					class="tw-palette__clear"
					title="Clear"
					aria-label="Clear search"
					@click="query = ''"
				>
					<v-icon size="14" aria-hidden="true">mdi-close</v-icon>
				</button>
			</div>

			<div v-if="query && results.length" class="tw-palette__results" role="listbox">
				<button
					v-for="(task, i) in results"
					:key="task.uuid"
					type="button"
					role="option"
					:aria-selected="i === activeIdx"
					class="tw-palette__item"
					:class="{ 'tw-palette__item--active': i === activeIdx }"
					@mouseenter="activeIdx = i"
					@click="choose(task)"
				>
					<v-icon size="14" class="tw-palette__item-icon" :class="'tw-palette__item-icon--' + statusKey(task)" aria-hidden="true">
						{{ statusIcon(task) }}
					</v-icon>
					<span class="tw-palette__item-desc" v-html="highlight(task.description || '')" />
					<span v-if="multiProfile && task._profile" class="tw-palette__item-profile">
						{{ task._profile }}
					</span>
					<span v-if="task.project" class="tw-palette__item-meta">
						<v-icon size="11" class="tw-palette__item-meta-icon" aria-hidden="true">mdi-folder-outline</v-icon>
						{{ task.project }}
					</span>
					<span v-if="task.tags && task.tags.length" class="tw-palette__item-tags">
						<span v-for="tag in task.tags.slice(0, 3)" :key="tag" class="tw-palette__item-tag">
							{{ tag }}
						</span>
					</span>
					<span v-if="task.due" class="tw-palette__item-due">
						<v-icon size="11" aria-hidden="true">mdi-calendar</v-icon>
						{{ displayDate(task.due) }}
					</span>
				</button>
			</div>

			<div v-else-if="query" class="tw-palette__empty">
				No matching tasks.
			</div>

			<div v-else class="tw-palette__hint">
				<span>{{ includeArchived ? 'Searching active + archived tasks' : 'Searching active tasks' }}</span>
				<span class="tw-palette__hint-keys">
					<kbd>↑</kbd><kbd>↓</kbd> navigate
					<kbd>↵</kbd> open
					<kbd>Alt</kbd>+<kbd>A</kbd> archived
					<kbd>Esc</kbd> close
				</span>
			</div>
		</div>
	</v-dialog>
</template>

<script lang="ts">
import { defineComponent, useStore, computed, ref, watch, nextTick } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import moment from 'moment';
import { accessorType } from '../store';

function displayDate(str?: string) {
	if (!str) return '';
	const date = moment(str);
	const diff = moment.duration(date.diff(moment()));
	if (Math.abs(diff.asDays()) < 1)
		return diff.humanize(true);
	return date.format('YYYY-MM-DD');
}

function escapeHtml(s: string) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escapeRegex(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineComponent({
	setup() {
		const store = useStore<typeof accessorType>();

		const open = computed({
			get: () => store.state.searchOpen,
			set: val => store.commit('setSearchOpen', val)
		});

		const query = ref('');
		const activeIdx = ref(0);
		const includeArchived = ref(false);
		const inputRef = ref<HTMLInputElement | null>(null);

		const results = computed((): Task[] => {
			const q = query.value.trim().toLowerCase();
			if (!q) return [];
			const matches: Task[] = [];
			for (const task of store.state.tasks) {
				if (!includeArchived.value && (task.status === 'completed' || task.status === 'deleted')) continue;
				const hay = [
					task.description,
					task.project,
					...(task.tags || []),
					...((task.annotations || []).map((a: any) => a.description))
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				if (hay.includes(q)) {
					matches.push(task);
					if (matches.length >= 50) break;
				}
			}
			matches.sort((a: any, b: any) => {
				const prio = (s?: string) =>
					s === 'pending' ? 0 : s === 'waiting' ? 1 : s === 'recurring' ? 2 : 3;
				const byStatus = prio(a.status) - prio(b.status);
				if (byStatus !== 0) return byStatus;
				return (b.urgency || 0) - (a.urgency || 0);
			});
			return matches;
		});

		watch(open, async val => {
			if (val) {
				query.value = '';
				activeIdx.value = 0;
				includeArchived.value = false;
				await nextTick();
				inputRef.value?.focus();
			}
		});

		watch(query, () => {
			activeIdx.value = 0;
		});

		watch(includeArchived, () => {
			activeIdx.value = 0;
		});

		const close = () => {
			open.value = false;
		};

		const choose = (task?: Task) => {
			if (!task) return;
			store.commit('openEditTaskDialog', JSON.parse(JSON.stringify(task)));
			close();
		};

		const move = (delta: number) => {
			const n = results.value.length;
			if (!n) return;
			activeIdx.value = (activeIdx.value + delta + n) % n;
		};

		const statusKey = (task: Task) => {
			if (task.status === 'completed') return 'completed';
			if (task.status === 'deleted') return 'deleted';
			if (task.status === 'recurring') return 'recurring';
			if (task.wait && moment(task.wait).isAfter(moment())) return 'waiting';
			if (task.due && moment(task.due).isBefore(moment())) return 'overdue';
			return 'pending';
		};

		const statusIcon = (task: Task) => {
			const k = statusKey(task);
			return {
				completed: 'mdi-check',
				deleted: 'mdi-delete-outline',
				recurring: 'mdi-restart',
				waiting: 'mdi-pause',
				overdue: 'mdi-alert-circle-outline',
				pending: 'mdi-circle-outline'
			}[k];
		};

		const highlight = (text: string) => {
			const q = query.value.trim();
			const safe = escapeHtml(text);
			if (!q) return safe;
			const re = new RegExp(escapeRegex(q), 'ig');
			return safe.replace(re, m => `<mark class="tw-palette__mark">${m}</mark>`);
		};

		const multiProfile = computed(() => store.getters.multiProfile);

		return {
			open,
			query,
			activeIdx,
			includeArchived,
			results,
			inputRef,
			close,
			choose,
			move,
			displayDate,
			statusKey,
			statusIcon,
			highlight,
			multiProfile
		};
	}
});
</script>
