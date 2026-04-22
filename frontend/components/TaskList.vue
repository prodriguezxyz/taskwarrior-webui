<template>
	<div>
		<ConfirmationDialog
			v-model="showConfirmationDialog"
			:title="confirmation.title"
			:text="confirmation.text"
			@yes="confirmation.handler"
		/>
		<ColumnDialog v-model="showColumnDialog" :active-columns="headers" />

		<div class="tw-toolbar" :class="{ 'tw-toolbar--bare': !projectFilter && !sidebarTagFilter }">
			<nav v-if="projectFilter || sidebarTagFilter" class="tw-tabs" role="tablist">
				<button
					v-for="st in allStatus"
					:key="st"
					type="button"
					role="tab"
					:aria-selected="st === status"
					:data-status="st"
					class="tw-tab"
					:class="{ 'tw-tab--active': st === status }"
					@click="selectStatus(st)"
				>
					<v-icon size="15" class="tw-tab__icon">
						{{ statusIcons[st] }}
					</v-icon>
					<span class="tw-tab__label">{{ statusLabels[st] }}</span>
					<span
						v-if="tabCount(st) > 0"
						class="tw-tab__count"
					>{{ tabCount(st) }}</span>
				</button>
			</nav>

			<div class="tw-toolbar__spacer" />

			<div class="tw-toolbar__actions">
				<button
					type="button"
					class="tw-action tw-action--ghost"
					:class="{ 'tw-action--on': showFilters || hasActiveFilters }"
					title="Filters"
					@click="showFilters = !showFilters"
				>
					<v-icon size="18">mdi-filter-variant</v-icon>
				</button>

				<button
					type="button"
					class="tw-action tw-action--ghost"
					title="Refresh"
					@click="refresh"
				>
					<v-icon size="18">mdi-refresh</v-icon>
				</button>

				<button
					v-if="showSyncBtn"
					type="button"
					class="tw-action tw-action--ghost"
					title="Sync"
					@click="syncTasks"
				>
					<v-icon size="18">mdi-sync</v-icon>
				</button>

				<button
					type="button"
					class="tw-action tw-action--ghost"
					title="Configure columns"
					@click="showColumnDialog = true"
				>
					<v-icon size="18">mdi-view-column-outline</v-icon>
				</button>
			</div>
		</div>

		<div v-if="showFilters" class="tw-filterbar">
			<div v-if="availableTags.length" class="tw-filterbar__group">
				<span class="tw-filterbar__label">Tags</span>
				<button
					v-for="tag in availableTags"
					:key="tag"
					type="button"
					class="tw-chip-filter"
					:class="{ 'tw-chip-filter--active': tagFilter.includes(tag) }"
					@click="toggleTag(tag)"
				>
					{{ tag }}
				</button>
			</div>
			<div class="tw-filterbar__group">
				<span class="tw-filterbar__label">Priority</span>
				<button
					v-for="p in ['H','M','L']"
					:key="p"
					type="button"
					class="tw-chip-filter"
					:class="{ 'tw-chip-filter--active': priorityFilter === p }"
					@click="togglePriority(p)"
				>
					{{ p }}
				</button>
			</div>
			<div class="tw-filterbar__spacer" />
			<button
				v-if="hasActiveFilters"
				type="button"
				class="tw-chip-filter tw-chip-filter--clear"
				@click="clearFilters"
			>
				Clear all
			</button>
		</div>

		<div class="tw-table-wrap">
			<div v-if="selected.length" class="tw-selbar">
				<span class="tw-selbar__count">
					<strong>{{ selected.length }}</strong> selected
				</span>
				<button
					type="button"
					class="tw-selbar__clear"
					@click="selected = []"
				>
					Clear
				</button>

				<div class="tw-selbar__spacer" />

				<button
					v-if="status === 'pending' || status === 'today'"
					type="button"
					class="tw-btn tw-btn--ghost"
					@click="completeTasks(selected)"
				>
					<v-icon size="16" left>mdi-check</v-icon>
					Complete
				</button>
				<button
					v-if="status === 'completed' || status === 'deleted'"
					type="button"
					class="tw-btn tw-btn--ghost"
					@click="restoreTasks(selected)"
				>
					<v-icon size="16" left>mdi-restore</v-icon>
					Restore
				</button>
				<button
					v-if="status !== 'deleted'"
					type="button"
					class="tw-btn tw-btn--ghost tw-btn--danger"
					@click="deleteTasks(selected)"
				>
					<v-icon size="16" left>mdi-delete-outline</v-icon>
					Delete
				</button>
			</div>

			<v-data-table
				:items="currentItems"
				:headers="filteredHeaders"
				show-select
				item-key="uuid"
				:item-class="rowClass"
				:group-by="groupBy"
				v-model="selected"
				class="tw-table"
				style="width: 100%"
			>
				<template v-slot:group.header="{ group, items, isOpen, toggle, headers: hdrs }">
					<tr class="v-row-group__header tw-group-row">
						<td :colspan="hdrs.length" class="tw-group-header">
							<button
								type="button"
								class="tw-group-header__toggle"
								:class="{ 'tw-group-header__toggle--overdue': group === 'Overdue' }"
								@click="toggle"
							>
								<v-icon size="14">{{ isOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
								<span>{{ group }}</span>
								<span class="tw-group-header__count">{{ items.length }}</span>
							</button>
						</td>
					</tr>
				</template>

				<template v-slot:item.description="{ item }">
					<span v-html="linkify(item.description)" />
				</template>

				<template v-if="status === 'waiting'" v-slot:item.wait="{ item }">
					{{ displayDate(item.wait) }}
				</template>
				<template v-slot:item.scheduled="{ item }">
					{{ displayDate(item.scheduled) }}
				</template>
				<template v-slot:item.due="{ item }">
					{{ displayDate(item.due) }}
				</template>
				<template v-slot:item.until="{ item }">
					{{ displayDate(item.until) }}
				</template>

				<template v-slot:item.tags="{ item }">
					<v-chip
						v-for="tag in item.tags"
						:key="tag"
						small
					>
						{{ tag }}
					</v-chip>
				</template>

				<template v-slot:item.urgency="{ item }">
					{{ item.urgency }}
				</template>

				<template v-slot:item.actions="{ item }">
					<v-icon
						v-show="status === 'pending' || status === 'today'"
						size="20px"
						class="ml-2"
						@click="completeTasks([item])"
						title="Done"
					>
						mdi-check
					</v-icon>
					<v-icon
						v-show="status === 'completed' || status === 'deleted'"
						size="20px"
						class="ml-2"
						@click="restoreTasks([item])"
						title="Restore"
					>
						mdi-restore
					</v-icon>
					<v-icon
						class="ml-2"
						size="20px"
						@click="editTask(item)"
						title="Edit"
					>
						mdi-pencil
					</v-icon>
					<v-icon
						v-show="status !== 'deleted'"
						class="ml-2"
						size="20px"
						@click="deleteTasks([item])"
						title="Delete"
					>
						mdi-delete
					</v-icon>
				</template>
			</v-data-table>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, useStore, computed, reactive, ref, watch, ComputedRef, Ref } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import _ from 'lodash';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import ColumnDialog from '../components/ColumnDialog.vue';
import moment from 'moment';
import urlRegex from 'url-regex-safe';
import normalizeUrl from 'normalize-url';
import { accessorType } from '../store';

function displayDate(str?: string) {
	if (!str)
		return str;

	const date = moment(str);
	const diff = moment.duration(date.diff(moment()));
	if (Math.abs(diff.asDays()) < 1)
		return diff.humanize(true);
	return date.format('YYYY-MM-DD');
}

function urgentDate(str?: string) {
	if (!str)
		return false;

	const date = moment(str);
	const diff = moment.duration(date.diff(moment()));
	const days = diff.asDays();
	if (days > 0 && days < 1)
		return true;

	return false;
}

function expiredDate(str?: string) {
	if (!str)
		return false;

	const date = moment(str);
	return date.isBefore(moment());
}

function futureDate(str?: string) {
	if (!str)
		return false;

	const date = moment(str);
	return date.isAfter(moment());
}

function linkify(text: string) {
	const regex = urlRegex();

	let match;
	let lastIndex = 0;
	let result = '';
	while ((match = regex.exec(text)) !== null) {
		const str = text.substring(lastIndex, match.index);
		const url = `<a target="_blank" href=${normalizeUrl(match[0])}>${match[0]}</a>`;
		result = `${result}${str}${url}`;
		lastIndex = match.index + match[0].length;
	}
	result += text.substring(lastIndex);

	return result;
}

export default defineComponent({
	props: {
		tasks: {
			type: Array as () => Task[],
			required: true
		}
	},

	setup(props) {
		const store = useStore<typeof accessorType>();
		const selected = ref([] as Task[]);

		const view = computed(() => store.state.view);
		const status = ref(view.value === 'today' ? 'today' : 'pending');
		const allStatus = ['pending', 'waiting', 'completed', 'deleted', 'recurring'];
		const classifiedStatuses = ['today', ...allStatus];
		const statusIcons: { [st: string]: string } = {
			today: 'mdi-calendar-today',
			pending: 'mdi-clock-outline',
			waiting: 'mdi-pause',
			completed: 'mdi-check',
			deleted: 'mdi-delete-outline',
			recurring: 'mdi-restart'
		};
		const statusLabels: { [st: string]: string } = {
			today: 'Today',
			pending: 'Pending',
			waiting: 'Waiting',
			completed: 'Completed',
			deleted: 'Deleted',
			recurring: 'Recurring'
		};
		const headers = computed(() => [
			{ text: 'Description', value: 'description' },
			{ text: 'Project', value: 'project' },
			{ text: 'Priority', value: 'priority' },
			{ text: 'Scheduled', value: 'scheduled' },
			...(status.value === 'recurring'
				? [{ text: 'Recur', value: 'recur' }]
				: []),
			...(status.value !== 'waiting'
				? [{ text: 'Due', value: 'due' }]
				: [{ text: 'Wait', value: 'wait' }]),
			{ text: 'Until', value: 'until' },
			{ text: 'Tags', value: 'tags' },
			{ text: 'Urgency', value: 'urgency', sort: (a: number, b: number) => b - a },
			{ text: 'Actions', value: 'actions', sortable: false }
		]);

		const filteredHeaders = computed(() =>
			headers.value.filter((v) => !store.state.hiddenColumns.includes(v.value))
		);

		const showColumnDialog = ref(false);

		const projectFilter = computed(() => store.state.projectFilter);
		const sidebarTagFilter = computed(() => store.state.tagFilter);
		const tagFilter = ref<string[]>([]);
		const priorityFilter: Ref<string | null> = ref(null);
		const showFilters = ref(false);

		const availableTags = computed(() => {
			const set = new Set<string>();
			props.tasks?.forEach(t => t.tags?.forEach(tg => set.add(tg)));
			return Array.from(set).sort();
		});

		const hasActiveFilters = computed(() =>
			tagFilter.value.length > 0 || priorityFilter.value !== null
		);

		watch([tagFilter, priorityFilter], () => {
			selected.value = [];
		});

		// Scope owns the status: Today → 'today', Inbox → 'pending', Project/Tag → user-picked.
		watch([view, projectFilter, sidebarTagFilter], ([v, pf, tf]) => {
			if (v === 'today') status.value = 'today';
			else if (!pf && !tf) status.value = 'pending';
			selected.value = [];
		});

		const toggleTag = (tag: string) => {
			const idx = tagFilter.value.indexOf(tag);
			if (idx === -1) tagFilter.value = [...tagFilter.value, tag];
			else tagFilter.value = tagFilter.value.filter(t => t !== tag);
		};

		const togglePriority = (p: string) => {
			priorityFilter.value = priorityFilter.value === p ? null : p;
		};

		const clearFilters = () => {
			tagFilter.value = [];
			priorityFilter.value = null;
		};

		const matchesFilters = (task: Task) => {
			if (projectFilter.value && task.project !== projectFilter.value) return false;
			if (sidebarTagFilter.value && !task.tags?.includes(sidebarTagFilter.value)) return false;
			if (priorityFilter.value && task.priority !== priorityFilter.value) return false;
			if (tagFilter.value.length) {
				if (!task.tags || !tagFilter.value.every(t => task.tags!.includes(t))) return false;
			}
			return true;
		};

		const isOverdue = (task: Task) => !!task.due && moment(task.due).isBefore(moment());

		const tempTasks: { [key: string]: ComputedRef<Task[]> } = {};
		for (const status of classifiedStatuses) {
			tempTasks[status] = computed((): Task[] => {
				const endOfToday = status === 'today' ? moment().endOf('day') : null;
				const filtered = props.tasks?.filter(task => {
					let passStatus: boolean;
					if (status === 'today') {
						const waiting = (task.wait && !expiredDate(task.wait))
							|| (task.scheduled && futureDate(task.scheduled));
						passStatus = task.status === 'pending'
							&& !waiting
							&& task.due !== undefined
							&& moment(task.due).isSameOrBefore(endOfToday!);
					}
					else if (status === 'waiting' || status === 'pending') {
						const waiting = (task.wait && !expiredDate(task.wait))
							|| (task.scheduled && futureDate(task.scheduled));
						passStatus = task.status === 'pending' && (status === 'pending' ? !waiting : !!waiting);
					}
					else {
						passStatus = task.status === status;
					}
					if (!passStatus) return false;
					// Inbox scope: when no project/tag filter and not the today bucket, only unprojected
					if (!projectFilter.value && !sidebarTagFilter.value && status !== 'today' && task.project) return false;
					return matchesFilters(task);
				}) || [];

				if (status === 'today' || status === 'pending') {
					const todayGroup = status === 'today' ? 'Today' : 'Upcoming';
					return filtered.map(t => ({
						...t,
						_group: isOverdue(t) ? 'Overdue' : todayGroup
					})) as Task[];
				}
				return filtered as Task[];
			});
		}
		const classifiedTasks = reactive(tempTasks);

		const currentItems = computed((): Task[] => {
			const bucket: any = (classifiedTasks as any)[status.value];
			return Array.isArray(bucket) ? bucket : (bucket?.value || []);
		});

		const groupBy = computed((): string | undefined => {
			if (!projectFilter.value && !sidebarTagFilter.value) return undefined;
			if (status.value !== 'today' && status.value !== 'pending') return undefined;
			const bucket: any = (classifiedTasks as any)[status.value];
			const arr: any[] = Array.isArray(bucket) ? bucket : (bucket?.value || []);
			const groups = new Set(arr.map(t => t._group));
			return groups.size > 1 ? '_group' : undefined;
		});

		const refresh = () => {
			store.dispatch('fetchTasks');
		};

		const showConfirmationDialog = ref(false);
		const confirmation = reactive({
			title: 'Confirm',
			text: '',
			handler: () => {}
		});

		const showSyncBtn = computed(() => {
			return store.state.settings.autoSync !== '0';
		});

		const syncTasks = async () => {
			try {
				await store.dispatch('syncTasks');
				store.commit('setNotification', {
					color: 'success',
					text: 'Successfully synced tasks.'
				});
			}
			catch (error) {
				store.commit('setNotification', {
					color: 'error',
					text: 'Failed to sync tasks.'
				});
			}
		};

		const editTask = (task: Task) => {
			store.commit('openEditTaskDialog', _.cloneDeep(task));
		};

		const completeTasks = async (tasks: Task[]) => {
			await store.dispatch('updateTasks', tasks.map(task => {
				return {
					...task,
					status: 'completed'
				};
			}));
			selected.value = selected.value.filter(task => tasks.findIndex(t => t.uuid === task.uuid) === -1);
			store.commit('setNotification', {
				color: 'success',
				text: 'Successfully complete the task(s)'
			});
		};

		const deleteTasks = (tasks: Task[]) => {
			confirmation.text = 'Are you sure to delete the task(s)?';
			confirmation.handler = async () => {
				await store.dispatch('deleteTasks', tasks);
				selected.value = selected.value.filter(task => tasks.findIndex(t => t.uuid === task.uuid) === -1);
				store.commit('setNotification', {
					color: 'success',
					text: 'Successfully delete the task(s)'
				});
			};
			showConfirmationDialog.value = true;
		};

		const restoreTasks = (tasks: Task[]) => {
			confirmation.text = 'Are you sure to restore the task(s)?';
			confirmation.handler = async () => {
				await store.dispatch('updateTasks', tasks.map(task => {
					return {
						...task,
						status: 'pending'
					};
				}));
				selected.value = selected.value.filter(task => tasks.findIndex(t => t.uuid === task.uuid) === -1);
				store.commit('setNotification', {
					color: 'success',
					text: 'Successfully restore the task(s)'
				});
			};
			showConfirmationDialog.value = true;
		};

		const rowClass = (item: Task) => {
			if (item.mask)
				return 'recur-task';
			else if (item.status !== 'completed' && urgentDate(item.due))
				return 'urgent-task';
			else if (item.status !== 'completed' && expiredDate(item.due))
				return 'expired-task';
			return undefined;
		};

		const selectStatus = (st: string) => {
			if (view.value === 'today') {
				store.commit('setView', 'all');
			}
			if (st !== status.value) {
				selected.value = [];
				status.value = st;
			}
		};

		const tabCount = (st: string): number => {
			const bucket: any = (classifiedTasks as any)[st];
			if (!bucket) return 0;
			// reactive wraps ComputedRef; handle both shapes
			const arr = Array.isArray(bucket) ? bucket : bucket.value;
			return arr ? arr.length : 0;
		};

		return {
			linkify,
			refresh,
			headers,
			filteredHeaders,
			classifiedTasks,
			groupBy,
			status,
			allStatus,
			statusIcons,
			selected,
			showSyncBtn,
			syncTasks,
			editTask,
			deleteTasks,
			completeTasks,
			restoreTasks,
			showConfirmationDialog,
			showColumnDialog,
			confirmation,
			displayDate,
			rowClass,
			selectStatus,
			tabCount,
			statusLabels,

			projectFilter,
			sidebarTagFilter,
			view,
			currentItems,
			tagFilter,
			priorityFilter,
			availableTags,
			showFilters,
			hasActiveFilters,
			toggleTag,
			togglePriority,
			clearFilters,

			ConfirmationDialog,
			ColumnDialog
		};
	}
});
</script>
