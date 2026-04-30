<template>
	<div>
		<ConfirmationDialog
			v-model="showConfirmationDialog"
			:title="confirmation.title"
			:text="confirmation.text"
			@yes="confirmation.handler"
		/>
		<ColumnDialog v-model="showColumnDialog" :active-columns="configurableHeaders" />

		<div class="tw-toolbar" :class="{ 'tw-toolbar--bare': !projectFilter && !sidebarTagFilter && view !== 'mine' }">
			<nav v-if="projectFilter || sidebarTagFilter || view === 'mine'" class="tw-tabs" role="tablist">
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
			<div v-if="availableAssignees.length" class="tw-filterbar__group">
				<span class="tw-filterbar__label">Assigned to</span>
				<button
					v-for="email in availableAssignees"
					:key="email"
					type="button"
					class="tw-chip-filter"
					:class="{ 'tw-chip-filter--active': assigneeFilter.includes(email) }"
					@click="toggleAssignee(email)"
				>
					{{ assigneeLabel(email) }}
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
					@click="onBulkDelete(selected)"
				>
					<v-icon size="16" left>mdi-delete-outline</v-icon>
					{{ status === 'recurring' ? 'Stop series' : 'Delete' }}
				</button>
			</div>

			<v-data-table
				:items="currentItems"
				:headers="filteredHeaders"
				item-key="uuid"
				:item-class="rowClass"
				:group-by="groupBy"
				:items-per-page="20"
				:footer-props="{ 'items-per-page-options': [10, 20, 50, 100, -1] }"
				class="tw-table"
				style="width: 100%"
				@click:row="onRowClick"
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

				<template v-slot:item._complete="{ item }">
					<button
						type="button"
						class="tw-complete"
						:class="completeBtnClass(item)"
						:title="completeBtnTitle(item)"
						@click="onCompleteClick($event, item)"
					>
						<v-icon size="18" class="tw-complete__icon">{{ completeBtnIcon(item) }}</v-icon>
						<v-icon size="14" class="tw-complete__hover-icon">mdi-check</v-icon>
					</button>
				</template>

				<template v-slot:item.description="{ item }">
					<span
						class="tw-description tw-description--clickable"
						title="Edit task"
						@click="onDescriptionClick($event, item)"
					>
						<span v-html="linkify(item.description)" />
						<span
							v-if="showProfileChip && item._profile"
							class="tw-profile-chip"
							:title="`Profile: ${item._profile}`"
						>{{ item._profile }}</span>
					</span>
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

				<template v-slot:item.assignee="{ item }">
					<v-chip
						v-if="item.assignee"
						small
						outlined
					>
						{{ assigneeLabel(item.assignee) }}
					</v-chip>
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
						class="ml-2"
						size="20px"
						@click="onActionClick($event, () => editTask(item))"
						title="Edit"
					>
						mdi-pencil
					</v-icon>
					<v-icon
						v-if="item.parent && status !== 'deleted'"
						class="ml-2"
						size="20px"
						@click="onActionClick($event, () => confirmDeleteSeries([item]))"
						title="Stop recurring series"
					>
						mdi-restart-off
					</v-icon>
					<v-icon
						v-show="status !== 'deleted'"
						class="ml-2"
						size="20px"
						@click="onActionClick($event, () => onRowDelete(item))"
						:title="item.status === 'recurring' ? 'Stop recurring series' : 'Delete'"
					>
						mdi-delete
					</v-icon>
				</template>
			</v-data-table>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, useStore, computed, reactive, ref, watch, ComputedRef, Ref, onMounted, onBeforeUnmount, nextTick, inject } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import _ from 'lodash';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import ColumnDialog from '../components/ColumnDialog.vue';
import moment from 'moment';
import urlRegex from 'url-regex-safe';
import normalizeUrl from 'normalize-url';
import { accessorType, isCrossProfileView } from '../store';

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
		const showAssigneeColumn = computed(() => {
			if (store.state.members.length > 1) return true;
			return props.tasks?.some(t => Boolean((t as any).assignee)) ?? false;
		});

		const showProfileChip = computed(() =>
			store.getters.multiProfile && isCrossProfileView(view.value)
		);

		const headers = computed(() => [
			{ text: '', value: '_complete', sortable: false, width: '36px', class: 'tw-th--compact', cellClass: 'tw-td--compact' },
			{ text: 'Description', value: 'description' },
			{ text: 'Project', value: 'project', class: 'tw-col--hide-xs', cellClass: 'tw-col--hide-xs' },
			...(showAssigneeColumn.value
				? [{ text: 'Assigned to', value: 'assignee', class: 'tw-col--hide-sm', cellClass: 'tw-col--hide-sm' }]
				: []),
			{ text: 'Priority', value: 'priority', class: 'tw-col--hide-xs', cellClass: 'tw-col--hide-xs' },
			{ text: 'Scheduled', value: 'scheduled', class: 'tw-col--hide-sm', cellClass: 'tw-col--hide-sm' },
			...(status.value === 'recurring'
				? [{ text: 'Recur', value: 'recur', class: 'tw-col--hide-sm', cellClass: 'tw-col--hide-sm' }]
				: []),
			...(status.value !== 'waiting'
				? [{ text: 'Due', value: 'due' }]
				: [{ text: 'Wait', value: 'wait' }]),
			{ text: 'Until', value: 'until', class: 'tw-col--hide-sm', cellClass: 'tw-col--hide-sm' },
			{ text: 'Tags', value: 'tags', class: 'tw-col--hide-xs', cellClass: 'tw-col--hide-xs' },
			{ text: 'Urgency', value: 'urgency', sort: (a: number, b: number) => b - a, class: 'tw-col--hide-sm', cellClass: 'tw-col--hide-sm' },
			{ text: 'Actions', value: 'actions', sortable: false }
		]);

		const filteredHeaders = computed(() =>
			headers.value.filter((v) => !store.state.hiddenColumns.includes(v.value))
		);

		const configurableHeaders = computed(() =>
			headers.value.filter((v) => v.text !== '')
		);

		const showColumnDialog = ref(false);

		const projectFilter = computed(() => store.state.projectFilter);
		const sidebarTagFilter = computed(() => store.state.tagFilter);
		const tagFilter = ref<string[]>([]);
		const assigneeFilter = ref<string[]>([]);
		const priorityFilter: Ref<string | null> = ref(null);
		const showFilters = ref(false);

		const assigneeLabel = (email?: string) => store.getters.assigneeLabel(email);

		// Filter chips list only the tags/assignees visible in the current
		// scope; otherwise multi-profile users see chips that can't match
		// any rendered row.
		const inScope = (t: Task) =>
			isCrossProfileView(view.value) || store.getters.isOwnProfile(t);

		const availableTags = computed(() => {
			const set = new Set<string>();
			props.tasks?.forEach(t => {
				if (!inScope(t)) return;
				t.tags?.forEach(tg => set.add(tg));
			});
			return Array.from(set).sort();
		});

		const availableAssignees = computed(() => {
			const set = new Set<string>();
			props.tasks?.forEach(t => {
				if (!inScope(t)) return;
				const a = (t as any).assignee;
				if (a) set.add(a);
			});
			return Array.from(set).sort();
		});

		const hasActiveFilters = computed(() =>
			tagFilter.value.length > 0
			|| assigneeFilter.value.length > 0
			|| priorityFilter.value !== null
		);

		watch([tagFilter, assigneeFilter, priorityFilter], () => {
			selected.value = [];
		});

		// Scope owns the status: Today → 'today', everything else → 'pending'.
		// Switching project/tag in the sidebar always lands on pending.
		watch([view, projectFilter, sidebarTagFilter], ([v]) => {
			status.value = v === 'today' ? 'today' : 'pending';
			selected.value = [];
		});

		const toggleTag = (tag: string) => {
			const idx = tagFilter.value.indexOf(tag);
			if (idx === -1) tagFilter.value = [...tagFilter.value, tag];
			else tagFilter.value = tagFilter.value.filter(t => t !== tag);
		};

		const toggleAssignee = (email: string) => {
			const idx = assigneeFilter.value.indexOf(email);
			if (idx === -1) assigneeFilter.value = [...assigneeFilter.value, email];
			else assigneeFilter.value = assigneeFilter.value.filter(e => e !== email);
		};

		const togglePriority = (p: string) => {
			priorityFilter.value = priorityFilter.value === p ? null : p;
		};

		const clearFilters = () => {
			tagFilter.value = [];
			assigneeFilter.value = [];
			priorityFilter.value = null;
		};

		const matchesFilters = (task: Task) => {
			if (!isCrossProfileView(view.value) && !store.getters.isOwnProfile(task)) return false;
			if (projectFilter.value && task.project !== projectFilter.value) return false;
			if (sidebarTagFilter.value && !task.tags?.includes(sidebarTagFilter.value)) return false;
			if (priorityFilter.value && task.priority !== priorityFilter.value) return false;
			if (tagFilter.value.length) {
				if (!task.tags || !tagFilter.value.every(t => task.tags!.includes(t))) return false;
			}
			if (assigneeFilter.value.length) {
				const a = (task as any).assignee;
				if (!a || !assigneeFilter.value.includes(a)) return false;
			}
			if (view.value === 'mine') {
				const me = store.state.user?.email;
				if (!me || (task as any).assignee !== me) return false;
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
					// Inbox scope: when no project/tag filter and not the today/mine bucket,
					// only unprojected non-recurring tasks. Recurring child instances
					// (task.parent set) are already-triaged routines, not inbox items.
					if (!projectFilter.value && !sidebarTagFilter.value && view.value !== 'mine'
						&& status !== 'today' && (task.project || (task as any).parent)) return false;
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
			catch (error: any) {
				// Multi-profile partial failure: surface which profiles failed
				// so the user knows what (if anything) needs retry.
				const failed: string[] | undefined = error?.failedProfiles;
				const succeeded: number | undefined = error?.succeededCount;
				const text = (failed && failed.length)
					? `Sync failed for: ${failed.join(', ')}` + (succeeded ? ` (${succeeded} ok)` : '')
					: 'Failed to sync tasks.';
				store.commit('setNotification', { color: 'error', text });
			}
		};

		const editTask = (task: Task) => {
			store.commit('openEditTaskDialog', _.cloneDeep(task));
		};

		const toggleSelection = (task: Task) => {
			const idx = selected.value.findIndex(t => t.uuid === task.uuid);
			if (idx >= 0) selected.value = selected.value.filter(t => t.uuid !== task.uuid);
			else selected.value = [...selected.value, task];
		};

		const isMultiSelect = (event: MouseEvent) => event.ctrlKey || event.metaKey;

		const onRowClick = (task: Task, _row: unknown, event: MouseEvent) => {
			if (isMultiSelect(event)) toggleSelection(task);
		};

		const onDescriptionClick = (event: MouseEvent, task: Task) => {
			if (isMultiSelect(event)) {
				event.stopPropagation();
				toggleSelection(task);
				return;
			}
			const target = event.target as HTMLElement | null;
			if (target && target.closest('a')) return;
			event.stopPropagation();
			editTask(task);
		};

		const onActionClick = (event: MouseEvent, action: () => void) => {
			if (isMultiSelect(event)) return;
			event.stopPropagation();
			action();
		};

		const onCompleteClick = (event: MouseEvent, task: Task) => {
			event.stopPropagation();
			if (isMultiSelect(event)) {
				toggleSelection(task);
				return;
			}
			if (task.status === 'pending') completeTasks([task]);
			else if (task.status === 'completed' || task.status === 'deleted') restoreTasks([task]);
		};

		const completeBtnIcon = (task: Task) => {
			if (task.status === 'completed') return 'mdi-check-circle';
			if (task.status === 'deleted') return 'mdi-delete-outline';
			if (task.status === 'recurring') return 'mdi-restart';
			return 'mdi-circle-outline';
		};

		const completeBtnClass = (task: Task) => ({
			'tw-complete--done': task.status === 'completed',
			'tw-complete--deleted': task.status === 'deleted',
			'tw-complete--recurring': task.status === 'recurring'
		});

		const completeBtnTitle = (task: Task) => {
			if (task.status === 'completed' || task.status === 'deleted') return 'Restore';
			if (task.status === 'recurring') return 'Recurring task';
			return 'Mark as done';
		};

		const undoTasks = async (originals: Task[]) => {
			await store.dispatch('updateTasks', originals);
		};

		const completeTasks = async (tasks: Task[]) => {
			const originals = tasks.map(t => _.cloneDeep(t));
			await store.dispatch('updateTasks', tasks.map(task => {
				return {
					...task,
					status: 'completed'
				};
			}));
			selected.value = selected.value.filter(task => tasks.findIndex(t => t.uuid === task.uuid) === -1);
			store.commit('setNotification', {
				color: 'success',
				text: tasks.length === 1 ? 'Task completed' : `${tasks.length} tasks completed`,
				actionText: 'Undo',
				actionHandler: () => undoTasks(originals)
			});
		};

		const deleteTasks = async (tasks: Task[]) => {
			const originals = tasks.map(t => _.cloneDeep(t));
			await store.dispatch('deleteTasks', tasks);
			selected.value = selected.value.filter(task => tasks.findIndex(t => t.uuid === task.uuid) === -1);
			store.commit('setNotification', {
				color: 'success',
				text: tasks.length === 1 ? 'Task deleted' : `${tasks.length} tasks deleted`,
				actionText: 'Undo',
				actionHandler: () => undoTasks(originals)
			});
		};

		// Stop a recurring series by deleting the parent template. Existing child
		// instances stay; no new ones get generated. We require explicit confirmation
		// because rolling back a deleted recurring parent in Taskwarrior is not clean
		// — undo wouldn't reliably restore the series — and the action affects every
		// future instance, not just the one the user is looking at.
		const confirmDeleteSeries = (tasks: Task[]) => {
			const parents = tasks.map(t => ({ uuid: ((t as any).parent as string) || (t.uuid as string) }));
			const count = parents.length;
			confirmation.title = 'Stop recurring series';
			confirmation.text = count === 1
				? 'Delete the entire recurring series? Existing instances stay but no new ones will be generated.'
				: `Delete ${count} recurring series? Existing instances stay but no new ones will be generated.`;
			confirmation.handler = async () => {
				await store.dispatch('deleteTasks', parents);
				selected.value = selected.value.filter(task =>
					!parents.some(p => p.uuid === task.uuid));
				store.commit('setNotification', {
					color: 'success',
					text: count === 1 ? 'Recurring series deleted' : `${count} recurring series deleted`
				});
			};
			showConfirmationDialog.value = true;
		};

		const onRowDelete = (task: Task) => {
			if (task.status === 'recurring') confirmDeleteSeries([task]);
			else deleteTasks([task]);
		};

		const onBulkDelete = (tasks: Task[]) => {
			if (status.value === 'recurring') confirmDeleteSeries(tasks);
			else deleteTasks(tasks);
		};

		const restoreTasks = (tasks: Task[]) => {
			confirmation.title = 'Confirm';
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

		const cursorUuid = ref<string | null>(null);

		const cursorTask = computed((): Task | null => {
			if (!cursorUuid.value) return null;
			return currentItems.value.find(t => t.uuid === cursorUuid.value) || null;
		});

		const moveCursor = async (delta: number) => {
			const items = currentItems.value;
			if (!items.length) return;
			const curIdx = cursorUuid.value
				? items.findIndex(t => t.uuid === cursorUuid.value)
				: -1;
			const next = curIdx < 0
				? (delta > 0 ? 0 : items.length - 1)
				: Math.max(0, Math.min(items.length - 1, curIdx + delta));
			cursorUuid.value = items[next].uuid || null;
			await nextTick();
			const el = document.querySelector('.tw-row--cursor') as HTMLElement | null;
			if (el) el.scrollIntoView({ block: 'nearest' });
		};

		const rowClass = (item: Task) => {
			const sel = selected.value.some(t => t.uuid === item.uuid) ? 'tw-row--selected' : '';
			const cur = cursorUuid.value === item.uuid ? 'tw-row--cursor' : '';
			let base = '';
			if (item.mask)
				base = 'recur-task';
			else if (item.status !== 'completed' && urgentDate(item.due))
				base = 'urgent-task';
			else if (item.status !== 'completed' && expiredDate(item.due))
				base = 'expired-task';
			return [base, sel, cur].filter(Boolean).join(' ') || undefined;
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

		const isGridTypingTarget = (el: EventTarget | null) => {
			if (!(el instanceof HTMLElement)) return false;
			const tag = el.tagName;
			return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
		};

		const layoutDialogsOpen = inject<Ref<boolean>>('layoutDialogsOpen', ref(false));

		const isGridBlocked = () =>
			showConfirmationDialog.value
			|| showColumnDialog.value
			|| store.state.searchOpen
			|| store.state.quickAddOpen
			|| store.state.taskDialog.open
			|| layoutDialogsOpen.value;

		const isActivatorTarget = (el: EventTarget | null) => {
			if (!(el instanceof HTMLElement)) return false;
			const tag = el.tagName;
			return tag === 'BUTTON' || tag === 'A';
		};

		const GRID_KEYS = new Set(['j', 'k', 'e', 'x', ' ', 'Enter', 'ArrowUp', 'ArrowDown']);

		const onGridKeydown = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (!GRID_KEYS.has(e.key)) return;
			if (isGridTypingTarget(e.target)) return;
			if (isGridBlocked()) return;

			const cur = cursorTask.value;
			const onActivator = isActivatorTarget(e.target);

			switch (e.key) {
				case 'j':
				case 'ArrowDown':
					e.preventDefault(); moveCursor(1); return;
				case 'k':
				case 'ArrowUp':
					e.preventDefault(); moveCursor(-1); return;
				case 'e':
					if (!cur) return;
					e.preventDefault(); editTask(cur); return;
				case 'Enter':
					// Enter natively activates focused buttons/links — don't double-fire.
					if (onActivator) return;
					if (!cur) return;
					e.preventDefault(); editTask(cur); return;
				case 'x':
					if (!cur) return;
					e.preventDefault(); toggleSelection(cur); return;
				case ' ':
					// Space natively activates focused buttons/links — don't double-fire.
					if (onActivator) return;
					if (!cur) return;
					e.preventDefault();
					if (cur.status === 'pending') completeTasks([cur]);
					else if (cur.status === 'completed' || cur.status === 'deleted') restoreTasks([cur]);
			}
		};

		onMounted(() => window.addEventListener('keydown', onGridKeydown));
		onBeforeUnmount(() => window.removeEventListener('keydown', onGridKeydown));

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
			configurableHeaders,
			classifiedTasks,
			groupBy,
			status,
			allStatus,
			statusIcons,
			selected,
			showSyncBtn,
			syncTasks,
			editTask,
			onDescriptionClick,
			onRowClick,
			onActionClick,
			onCompleteClick,
			completeBtnIcon,
			completeBtnClass,
			completeBtnTitle,
			deleteTasks,
			confirmDeleteSeries,
			onRowDelete,
			onBulkDelete,
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
			assigneeFilter,
			priorityFilter,
			availableTags,
			availableAssignees,
			assigneeLabel,
			showFilters,
			hasActiveFilters,
			toggleTag,
			toggleAssignee,
			togglePriority,
			clearFilters,
			showProfileChip,

			ConfirmationDialog,
			ColumnDialog
		};
	}
});
</script>

<style>
.tw-table tr.tw-row--cursor > td:first-child {
	box-shadow: inset 2px 0 0 0 currentColor;
}

.tw-profile-chip {
	display: inline-block;
	margin-left: 8px;
	padding: 1px 6px;
	border-radius: 4px;
	border: 1px solid rgba(127, 127, 127, 0.35);
	font-size: 11px;
	line-height: 1.4;
	color: rgba(127, 127, 127, 0.95);
	background: transparent;
	vertical-align: middle;
	white-space: nowrap;
}
</style>
