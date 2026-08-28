<template>
	<v-dialog
		v-model="open"
		max-width="640"
		content-class="tw-palette__dialog"
		transition="fade-transition"
		:persistent="submitting"
		@keydown.esc="close"
	>
		<div class="tw-palette tw-quickadd" role="dialog" aria-label="Add task">
			<div class="tw-palette__inputwrap">
				<v-icon size="18" class="tw-palette__icon" aria-hidden="true">mdi-plus-circle-outline</v-icon>
				<input
					ref="inputRef"
					v-model="text"
					type="text"
					class="tw-palette__input"
					aria-label="Quick add task"
					placeholder="Buy milk #shopping %errands tomorrow 3pm p2…"
					autocomplete="off"
					spellcheck="false"
					enterkeyhint="done"
					:disabled="submitting"
					:readonly="batchMode"
					@keydown.down.prevent="onDown"
					@keydown.up.prevent="onUp"
					@keydown.tab="onTab"
					@keydown.enter.prevent="onEnter"
					@paste="onPaste"
					@keyup="syncCursor"
					@click="syncCursor"
					@select="syncCursor"
				/>
			</div>

			<div class="tw-quickadd__actions" role="group" aria-label="Task actions">
				<button type="button" class="tw-quickadd__action" :disabled="submitting || batchMode" @click="insertSyntax('#')">
					<v-icon size="14" aria-hidden="true">mdi-folder-outline</v-icon>
					{{ parsed.project || 'Project' }}
				</button>
				<v-menu offset-y>
					<template v-slot:activator="{ on, attrs }">
						<button v-bind="attrs" v-on="on" type="button" class="tw-quickadd__action" :disabled="submitting">
							<v-icon size="14" aria-hidden="true">mdi-calendar</v-icon>
							{{ parsed.scheduled ? displayDate(parsed.scheduled) : 'Schedule' }}
						</button>
					</template>
					<v-list dense>
						<v-list-item v-for="dateAction in dateActions" :key="dateAction.value" @click="selectScheduledAction(dateAction.value)">
							<v-list-item-title>{{ dateAction.label }}</v-list-item-title>
						</v-list-item>
					</v-list>
				</v-menu>
				<v-menu offset-y>
					<template v-slot:activator="{ on, attrs }">
						<button v-bind="attrs" v-on="on" type="button" class="tw-quickadd__action" :disabled="submitting">
							<v-icon size="14" aria-hidden="true">mdi-calendar</v-icon>
							{{ parsed.due ? displayDate(parsed.due) : 'Deadline' }}
						</button>
					</template>
					<v-list dense>
						<v-list-item v-for="dateAction in dateActions" :key="dateAction.value" @click="selectDueAction(dateAction.value)">
							<v-list-item-title>{{ dateAction.label }}</v-list-item-title>
						</v-list-item>
					</v-list>
				</v-menu>
				<v-menu offset-y>
					<template v-slot:activator="{ on, attrs }">
						<button v-bind="attrs" v-on="on" type="button" class="tw-quickadd__action" :disabled="submitting">
							<v-icon size="14" aria-hidden="true">mdi-flag-outline</v-icon>
							{{ priorityActionLabel }}
						</button>
					</template>
					<v-list dense>
						<v-list-item v-for="priorityAction in priorityActions" :key="priorityAction" @click="selectPriorityAction(priorityAction)">
							<v-list-item-title>{{ priorityAction.toUpperCase() }}</v-list-item-title>
						</v-list-item>
					</v-list>
				</v-menu>
				<button type="button" class="tw-quickadd__action" :disabled="submitting || batchMode" @click="insertSyntax('+')">
					<v-icon size="14" aria-hidden="true">mdi-account-outline</v-icon>
					{{ resolvedAssigneeLabel || 'Assignee' }}
				</button>
				<button type="button" class="tw-quickadd__action" :disabled="submitting || batchMode" @click="insertSyntax('%')">
					<v-icon size="14" aria-hidden="true">mdi-tag-outline</v-icon>
					Labels
				</button>
				<v-menu offset-y>
					<template v-slot:activator="{ on, attrs }">
						<button v-bind="attrs" v-on="on" type="button" class="tw-quickadd__action" :disabled="submitting">
							<v-icon size="14" aria-hidden="true">mdi-repeat</v-icon>
							{{ parsed.recur || 'Repeat' }}
						</button>
					</template>
					<v-list dense>
						<v-list-item v-for="recurAction in recurrenceActions" :key="recurAction.value" @click="selectRecurrenceAction(recurAction.value)">
							<v-list-item-title>{{ recurAction.label }}</v-list-item-title>
						</v-list-item>
					</v-list>
				</v-menu>
				<button type="button" class="tw-quickadd__action" :disabled="submitting || batchMode" @click="insertSyntax('!')">
					<v-icon size="14" aria-hidden="true">mdi-bell-outline</v-icon>
					Reminder
				</button>
				<button type="button" class="tw-quickadd__action" :disabled="submitting || batchMode" @click="insertSyntax('durante ')">
					<v-icon size="14" aria-hidden="true">mdi-timer-outline</v-icon>
					Duration
				</button>
				<button
					type="button"
					class="tw-quickadd__action"
					:class="{ 'tw-quickadd__action--active': detailsOpen }"
					:disabled="submitting || batchMode"
					@click="showDescription"
				>
					<v-icon size="14" aria-hidden="true">mdi-pencil-outline</v-icon>
					Description
				</button>
			</div>

			<div v-if="batchMode" class="tw-quickadd__batch" aria-live="polite">
				<div class="tw-quickadd__batch-head">
					<span>{{ batchLines.length }} tasks ready to add</span>
					<span v-if="batchHasErrors" class="tw-quickadd__batch-error">Review highlighted tasks</span>
				</div>
				<div class="tw-quickadd__batch-list">
					<div
						v-for="(item, index) in batchParsed"
						:key="index + '-' + batchLines[index]"
						class="tw-quickadd__batch-item"
						:class="{ 'tw-quickadd__batch-item--error': !isParsedTaskValid(item) }"
					>
						<span class="tw-quickadd__batch-text">{{ item.description || batchLines[index] }}</span>
						<span class="tw-quickadd__batch-meta">{{ batchMeta(item) }}</span>
						<button type="button" title="Remove task" :disabled="submitting" @click="removeBatchLine(index)">
							<v-icon size="15" aria-hidden="true">mdi-close</v-icon>
						</button>
					</div>
				</div>
				<div class="tw-quickadd__batch-actions">
					<button type="button" :disabled="submitting" @click="cancelBatch">Cancel</button>
					<button type="button" :disabled="submitting" @click="keepBatchAsOne">Keep as one task</button>
					<button type="button" class="tw-quickadd__batch-submit" :disabled="submitting || batchHasErrors" @click="submitBatch">
						Add {{ batchLines.length }} tasks
					</button>
				</div>
			</div>

			<div v-if="detailsOpen && !batchMode" class="tw-quickadd__details">
				<textarea
					ref="detailsRef"
					v-model="details"
					class="tw-quickadd__details-input"
					rows="2"
					aria-label="Task description"
					placeholder="Add more context…"
					:disabled="submitting"
					@keydown.ctrl.enter.prevent="submit"
					@keydown.meta.enter.prevent="submit"
				/>
				<button
					type="button"
					class="tw-quickadd__submit"
					:disabled="!canSubmit"
					aria-label="Add task"
					title="Add task"
					@click="submit"
				>
					<v-icon size="18" aria-hidden="true">mdi-arrow-up</v-icon>
				</button>
			</div>

			<div v-if="suggestions.length && !batchMode" class="tw-palette__results" role="listbox">
				<button
					v-for="(s, i) in suggestions"
					:key="suggestionKey(s)"
					type="button"
					role="option"
					:aria-selected="i === activeIdx"
					:disabled="submitting"
					class="tw-palette__item"
					:class="{ 'tw-palette__item--active': i === activeIdx }"
					@mouseenter="activeIdx = i"
					@mousedown.prevent="applySuggestion(s)"
				>
					<v-icon size="14" class="tw-palette__item-icon" aria-hidden="true">
						{{ suggestionIcon }}
					</v-icon>
					<span class="tw-palette__item-desc">{{ s.text }}</span>
					<span v-if="s.email" class="tw-palette__item-profile">{{ s.email }}</span>
					<span v-else-if="s.profile" class="tw-palette__item-profile">{{ s.profile }}</span>
				</button>
			</div>

			<div v-if="hasParsedMeta && !batchMode" class="tw-quickadd__preview">
				<button
					v-if="parsed.recur"
					type="button"
					class="tw-quickadd__chip tw-quickadd__chip--interactive"
					title="Treat recurrence as task text"
					@click="treatRecurrenceAsText"
				>
					<v-icon size="12" aria-hidden="true">mdi-repeat</v-icon>
					{{ parsed.recur }}
					<v-icon size="11" aria-hidden="true">mdi-close</v-icon>
				</button>
				<span v-if="parsed.project" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-folder-outline</v-icon>
					{{ parsed.project }}
				</span>
				<span v-if="projectTargetProfile && projectTargetProfile !== activeProfile" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-account-switch-outline</v-icon>
					{{ projectTargetProfile }}
				</span>
				<span
					v-if="parsed.assignee"
					class="tw-quickadd__chip"
					:class="{ 'tw-quickadd__chip--error': !resolvedAssignee }"
				>
					<v-icon size="12" aria-hidden="true">
						{{ resolvedAssignee ? 'mdi-account-outline' : 'mdi-alert-circle-outline' }}
					</v-icon>
					{{ resolvedAssigneeLabel || parsed.assignee }}
				</span>
				<span
					v-for="t in parsed.tags"
					:key="'tag-' + t"
					class="tw-quickadd__chip"
				>
					<v-icon size="12" aria-hidden="true">mdi-tag-outline</v-icon>
					{{ t }}
				</span>
				<span
					v-if="parsed.priority"
					class="tw-quickadd__chip"
					:class="'tw-quickadd__chip--p' + parsed.priority"
				>
					P{{ priorityNumber(parsed.priority) }}
				</span>
				<span v-if="parsed.due && parsed.recur" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-calendar</v-icon>
					{{ displayDate(parsed.due) }}
				</span>
				<button
					v-else-if="parsed.due"
					type="button"
					class="tw-quickadd__chip tw-quickadd__chip--interactive"
					title="Treat date as task text"
					@click="treatDateAsText"
				>
					<v-icon size="12" aria-hidden="true">mdi-calendar</v-icon>
					{{ displayDate(parsed.due) }}
					<v-icon size="11" aria-hidden="true">mdi-close</v-icon>
				</button>
				<button
					v-if="parsed.scheduled"
					type="button"
					class="tw-quickadd__chip tw-quickadd__chip--interactive"
					title="Remove scheduled date"
					@click="treatScheduledAsText"
				>
					<v-icon size="12" aria-hidden="true">mdi-calendar</v-icon>
					planned {{ displayDate(parsed.scheduled) }}
					<v-icon size="11" aria-hidden="true">mdi-close</v-icon>
				</button>
				<span v-if="parsed.until" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-calendar</v-icon>
					until {{ displayDate(parsed.until) }}
				</span>
				<span v-if="parsed.reminder" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-bell-outline</v-icon>
					remind {{ displayDate(parsed.reminder) }}
				</span>
				<span v-if="parsed.durationMinutes" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-timer-outline</v-icon>
					{{ displayDuration(parsed.durationMinutes) }}
				</span>
				<span v-if="parsed.dateError" class="tw-quickadd__chip tw-quickadd__chip--error">
					<v-icon size="12" aria-hidden="true">mdi-alert-circle-outline</v-icon>
					Conflicting dates
				</span>
				<button
					v-if="parsed.recurrenceError"
					type="button"
					class="tw-quickadd__chip tw-quickadd__chip--error tw-quickadd__chip--interactive"
					title="Treat recurrence as task text"
					@click="treatRecurrenceAsText"
				>
					<v-icon size="12" aria-hidden="true">mdi-alert-circle-outline</v-icon>
					{{ parsed.recurrenceError === 'ambiguous' ? 'Conflicting recurrences' : 'Unsupported recurrence' }}
					<v-icon size="11" aria-hidden="true">mdi-close</v-icon>
				</button>
				<span v-if="parsed.reminderError" class="tw-quickadd__chip tw-quickadd__chip--error">
					<v-icon size="12" aria-hidden="true">mdi-alert-circle-outline</v-icon>
					{{ parsed.reminderError === 'ambiguous' ? 'Conflicting reminders' : 'Invalid reminder' }}
				</span>
				<span v-if="parsed.durationError" class="tw-quickadd__chip tw-quickadd__chip--error">
					<v-icon size="12" aria-hidden="true">mdi-alert-circle-outline</v-icon>
					Conflicting durations
				</span>
			</div>

			<div class="tw-palette__hint">
				<span class="tw-palette__hint-keys">
					<span class="tw-palette__hint-pair"><kbd>#</kbd>project</span>
					<span class="tw-palette__hint-pair"><kbd>%</kbd>label</span>
					<span class="tw-palette__hint-pair"><kbd>+</kbd>person</span>
					<span class="tw-palette__hint-pair"><kbd>p1-p4</kbd>priority</span>
					<span class="tw-palette__hint-pair"><kbd>cada lunes</kbd>repeat</span>
					<span class="tw-palette__hint-pair"><kbd>{29/8}</kbd>deadline</span>
					<span class="tw-palette__hint-pair"><kbd>!30m</kbd>reminder</span>
				</span>
				<span class="tw-palette__hint-keys">
					<span class="tw-palette__hint-pair"><kbd>↓</kbd>description</span>
					<span class="tw-palette__hint-pair"><kbd>↵</kbd>add</span>
					<span class="tw-palette__hint-pair"><kbd>⇧↵</kbd>add another</span>
					<span class="tw-palette__hint-pair"><kbd>Esc</kbd>close</span>
				</span>
			</div>
		</div>
	</v-dialog>
</template>

<script lang="ts">
import { defineComponent, useStore, computed, ref, watch, nextTick } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import moment from 'moment';
import { accessorType, TaskWithProfile } from '../store';
import {
	applyQuickAddOverrides,
	durationMinutesToIso,
	ParsedQuickAdd,
	parseQuickAdd
} from '../utils/quickAddParse';
import { combineDateTime, parseDateToken } from '../utils/dateParse';
import { memberLabel, ProfileMember, resolveAssignee } from '../utils/assignee';
import { buildQuickAddAnnotations } from '../utils/quickAddAnnotations';
import {
	composeQuickAddBatch,
	composeQuickAddSingle,
	quickAddBatchUuid,
	quickAddPasteLines
} from '../utils/quickAddBatch';

interface Suggestion {
	text: string;
	profile?: string;
	email?: string;
}

function displayDate(str?: string) {
	if (!str) return '';
	const date = moment(str);
	const hasTime = /T\d{2}:\d{2}/.test(str) && !(date.hour() === 0 && date.minute() === 0);
	const today = moment().startOf('day');
	const diffDays = date.clone().startOf('day').diff(today, 'days');
	let label: string;
	if (diffDays === 0) label = 'today';
	else if (diffDays === 1) label = 'tomorrow';
	else if (diffDays === -1) label = 'yesterday';
	else if (diffDays > 1 && diffDays < 7) label = date.format('dddd');
	else label = date.format('YYYY-MM-DD');
	return hasTime ? `${label} ${date.format('HH:mm')}` : label;
}

function priorityNumber(priority: 'H' | 'M' | 'L') {
	return priority === 'H' ? 1 : priority === 'M' ? 2 : 3;
}

function displayDuration(minutes: number) {
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	return [hours ? `${hours}h` : '', remainder ? `${remainder}m` : ''].filter(Boolean).join(' ');
}

export default defineComponent({
	setup() {
		const store = useStore<typeof accessorType>();
		const submitting = ref(false);

		const open = computed({
			get: () => store.state.quickAddOpen,
			set: val => {
				if (!val && submitting.value) return;
				store.commit('setQuickAddOpen', val);
			}
		});

		const text = ref('');
		const details = ref('');
		const detailsOpen = ref(false);
		const smartDates = ref(true);
		const smartRecurrences = ref(true);
		const dueOverride = ref<string | null>(null);
		const scheduledOverride = ref<string | null>(null);
		const recurrenceOverride = ref<{ recur: string, due: string } | null>(null);
		const priorityOverride = ref<{ value?: 'H' | 'M' | 'L', label: string } | null>(null);
		const batchLines = ref<string[]>([]);
		const batchUuids = ref<string[]>([]);
		const batchSingleText = ref('');
		const cursorPos = ref(0);
		const activeIdx = ref(0);
		const inputRef = ref<HTMLInputElement | null>(null);
		const detailsRef = ref<HTMLTextAreaElement | null>(null);
		let focusCycle = 0;
		const selectedProject = ref<{ project: string, profile: string } | null>(null);
		const memberCache = ref<Record<string, ProfileMember[]>>({});
		const activeProfile = computed(() => store.state.settings.profile);

		const projectSuggestions = computed((): Suggestion[] => {
			const seen = new Set<string>();
			const byProfile = new Map<string, Set<string>>();
			for (const t of store.state.tasks as TaskWithProfile[]) {
				if (t.status === 'deleted') continue;
				if (!t.project) continue;
				const profile = t._profile || activeProfile.value;
				if (!byProfile.has(profile)) byProfile.set(profile, new Set());
				byProfile.get(profile)!.add(t.project);
			}
			const order = store.getters.multiProfile
				? [
					activeProfile.value,
					...store.state.profiles.map(p => p.name).filter(n => n !== activeProfile.value)
				]
				: [activeProfile.value];
			const items: Suggestion[] = [];
			for (const profile of order) {
				const projects = byProfile.get(profile);
				if (!projects) continue;
				for (const project of Array.from(projects).sort()) {
					const key = `${profile}::${project}`;
					if (seen.has(key)) continue;
					seen.add(key);
					items.push({
						text: project,
						profile: store.getters.multiProfile ? profile : undefined
					});
				}
			}
			return items;
		});

		const tags = computed(() => {
			const set = new Set<string>();
			for (const t of store.getters.ownTasks as Task[]) {
				if (t.tags) for (const tag of t.tags) set.add(tag);
			}
			return Array.from(set).sort();
		});

		const currentToken = computed(() => {
			const pos = cursorPos.value;
			const before = text.value.slice(0, pos);
			const m = /([#@%+])([\p{L}\p{N}_.@+-]*)$/u.exec(before);
			if (!m) return null;
			return {
				sigil: m[1] as '#' | '@' | '%' | '+',
				prefix: m[2],
				start: pos - m[0].length
			};
		});

		const suggestionType = computed(() => {
			const t = currentToken.value;
			if (!t) return null;
			if (t.sigil === '#') return 'project';
			if (t.sigil === '+') return 'assignee';
			return 'tag';
		});

		const suggestionIcon = computed(() => {
			if (suggestionType.value === 'project') return 'mdi-folder-outline';
			if (suggestionType.value === 'assignee') return 'mdi-account-outline';
			return 'mdi-tag-outline';
		});

		const assigneeMembers = computed(() => {
			const profile = projectTargetProfile.value || activeProfile.value;
			if (!profile) return [];
			if (profile === activeProfile.value) return store.state.members;
			return memberCache.value[profile] || [];
		});

		const assigneeSuggestions = computed((): Suggestion[] =>
			assigneeMembers.value.map(member => ({
				text: memberLabel(member),
				email: member.email
			}))
		);

		const suggestions = computed((): Suggestion[] => {
			const t = currentToken.value;
			if (!t) return [];
			if (t.sigil === '+' && /^\d/.test(t.prefix)) return [];
			const list: Suggestion[] = t.sigil === '#'
				? projectSuggestions.value
				: t.sigil === '+'
					? assigneeSuggestions.value
					: tags.value.map(text => ({ text }));
			const prefix = t.prefix.toLowerCase();
			const parsed = parseQuickAdd(text.value);
			const used = t.sigil === '@' || t.sigil === '%' ? new Set(parsed.tags) : new Set<string>();
			return list
				.filter(item => {
					if (used.has(item.text)) return false;
					if (!prefix) return true;
					return item.text.toLowerCase().includes(prefix)
						|| Boolean(item.email?.toLowerCase().includes(prefix));
				})
				.slice(0, 6);
		});

		const parseWithOverrides = (value: string): ParsedQuickAdd => {
			const base = parseQuickAdd(value, {
				parseDates: smartDates.value,
				parseRecurrences: smartRecurrences.value
			});
			return applyQuickAddOverrides(base, {
				...(priorityOverride.value ? { priority: priorityOverride.value.value ?? null } : {}),
				...(recurrenceOverride.value ? { recurrence: recurrenceOverride.value } : {}),
				...(dueOverride.value ? { due: dueOverride.value } : {}),
				...(scheduledOverride.value ? { scheduled: scheduledOverride.value } : {})
			});
		};
		const parsed = computed(() => parseWithOverrides(text.value));
		const batchParsed = computed(() => batchLines.value.map(parseWithOverrides));
		const batchMode = computed(() => batchLines.value.length > 0);
		const isParsedTaskValid = (item: ParsedQuickAdd) =>
			Boolean(item.description)
			&& !item.dateError
			&& !item.recurrenceError
			&& !item.reminderError
			&& !item.durationError;
		const batchHasErrors = computed(() => batchParsed.value.some(item => !isParsedTaskValid(item)));
		const batchMeta = (item: ParsedQuickAdd) => [
			item.project ? `#${item.project}` : '',
			...item.tags.map(tag => `%${tag}`),
			item.priority ? `P${priorityNumber(item.priority)}` : '',
			item.scheduled ? `planned ${displayDate(item.scheduled)}` : '',
			item.due ? `due ${displayDate(item.due)}` : '',
			item.recur || '',
			item.reminder ? `remind ${displayDate(item.reminder)}` : '',
			item.durationMinutes ? displayDuration(item.durationMinutes) : '',
			item.dateError ? 'conflicting dates' : '',
			item.recurrenceError ? 'invalid recurrence' : '',
			item.reminderError ? 'invalid reminder' : '',
			item.durationError ? 'invalid duration' : ''
		].filter(Boolean).join(' · ');
		const dateActions = [
			{ label: 'Today', value: 'today' },
			{ label: 'Tomorrow', value: 'tomorrow' },
			{ label: 'This weekend', value: 'weekend' }
		];
		const priorityActions = ['p1', 'p2', 'p3', 'p4'];
		const priorityActionLabel = computed(() =>
			priorityOverride.value?.label
			|| (parsed.value.priority ? `P${priorityNumber(parsed.value.priority)}` : 'Priority')
		);
		const recurrenceActions = [
			{ label: 'Every day', value: 'every day' },
			{ label: 'Every weekday', value: 'every weekday' },
			{ label: 'Every weekend', value: 'every weekend' },
			{ label: 'Every week', value: 'every week' },
			{ label: 'Every two weeks', value: 'every two weeks' },
			{ label: 'Every month', value: 'every month' },
			{ label: 'Every quarter', value: 'every quarter' },
			{ label: 'Every year', value: 'every year' }
		];

		const targetProfileForProject = (project?: string) => {
			if (!project) return activeProfile.value || undefined;
			if (
				selectedProject.value
				&& selectedProject.value.project.toLowerCase() === project.toLowerCase()
			) return selectedProject.value.profile;

			if (!store.getters.multiProfile) return activeProfile.value || undefined;
			const matches = projectSuggestions.value
				.filter(s => s.text.toLowerCase() === project.toLowerCase() && s.profile)
				.map(s => s.profile as string);
			if (matches.includes(activeProfile.value)) return activeProfile.value;
			const unique = Array.from(new Set(matches));
			return unique.length === 1 ? unique[0] : activeProfile.value || undefined;
		};
		const projectTargetProfile = computed(() => targetProfileForProject(parsed.value.project));

		const hasParsedMeta = computed(() =>
			Boolean(parsed.value.project)
			|| Boolean(parsed.value.assignee)
			|| parsed.value.tags.length > 0
			|| Boolean(parsed.value.priority)
			|| Boolean(parsed.value.due)
			|| Boolean(parsed.value.scheduled)
			|| Boolean(parsed.value.until)
			|| Boolean(parsed.value.recur)
			|| Boolean(parsed.value.reminder)
			|| Boolean(parsed.value.durationMinutes)
			|| Boolean(parsed.value.dateError)
			|| Boolean(parsed.value.recurrenceError)
			|| Boolean(parsed.value.reminderError)
			|| Boolean(parsed.value.durationError)
		);

		const resolvedAssignee = computed(() =>
			resolveAssignee(parsed.value.assignee, assigneeMembers.value)
		);

		const resolvedAssigneeLabel = computed(() => {
			const email = resolvedAssignee.value;
			if (!email) return '';
			const member = assigneeMembers.value.find(m => m.email === email);
			return member ? memberLabel(member) : store.getters.assigneeLabel(email);
		});

		const canSubmit = computed(() => {
			const p = parsed.value;
			return !submitting.value
				&& Boolean(p.description)
				&& !p.dateError
				&& !p.recurrenceError
				&& !p.reminderError
				&& !p.durationError
				&& (!p.assignee || Boolean(resolvedAssignee.value));
		});

		watch(suggestions, () => {
			activeIdx.value = 0;
		});

		watch(open, async val => {
			const cycle = ++focusCycle;
			if (val) {
				text.value = '';
				details.value = '';
				detailsOpen.value = false;
				smartDates.value = true;
				smartRecurrences.value = true;
				dueOverride.value = null;
				scheduledOverride.value = null;
				recurrenceOverride.value = null;
				priorityOverride.value = null;
				batchLines.value = [];
				batchUuids.value = [];
				batchSingleText.value = '';
				cursorPos.value = 0;
				activeIdx.value = 0;
				submitting.value = false;
				selectedProject.value = null;
				await nextTick();
				// VDialog mounts its lazy content over two ticks. Wait until the next
				// frame so its focus management cannot leave focus on the dialog itself.
				await new Promise(resolve => window.requestAnimationFrame(resolve));
				if (cycle === focusCycle && open.value) inputRef.value?.focus();
			}
			else {
				const active = document.activeElement;
				if (active === inputRef.value || active === detailsRef.value) {
					(active as HTMLElement).blur();
				}
			}
		}, { flush: 'sync' });

		watch([open, projectTargetProfile], async ([isOpen, profile]) => {
			if (!isOpen || !profile || profile === activeProfile.value || memberCache.value[profile]) return;
			try {
				const members = await store.dispatch('fetchMembersFor', profile);
				memberCache.value = { ...memberCache.value, [profile]: members };
			}
			catch (err) {
				console.error('[QuickAddPalette] fetchMembersFor failed:', err);
			}
		}, { immediate: true });

		watch(text, () => {
			const project = parsed.value.project;
			if (!selectedProject.value) return;
			if (!project || selectedProject.value.project.toLowerCase() !== project.toLowerCase()) {
				selectedProject.value = null;
			}
		});

		const syncCursor = () => {
			const el = inputRef.value;
			if (el) cursorPos.value = el.selectionStart ?? text.value.length;
		};

		const close = () => {
			if (submitting.value) return;
			open.value = false;
		};

		const showDescription = async () => {
			if (submitting.value) return;
			detailsOpen.value = true;
			await nextTick();
			detailsRef.value?.focus();
		};

		const onDown = () => {
			if (batchMode.value) return;
			if (!suggestions.value.length) {
				showDescription();
				return;
			}
			activeIdx.value = (activeIdx.value + 1) % suggestions.value.length;
		};

		const onUp = () => {
			const n = suggestions.value.length;
			if (!n) return;
			activeIdx.value = (activeIdx.value - 1 + n) % n;
		};

		const onTab = (event: KeyboardEvent) => {
			if (!suggestions.value.length) return;
			event.preventDefault();
			applySuggestion(suggestions.value[activeIdx.value]);
		};

		const onEnter = (event: KeyboardEvent) => {
			if (batchMode.value) {
				submitBatch();
				return;
			}
			if (suggestions.value.length) {
				applySuggestion(suggestions.value[activeIdx.value]);
				return;
			}
			submit(event.shiftKey);
		};

		const onPaste = (event: ClipboardEvent) => {
			const pasted = event.clipboardData?.getData('text/plain') || '';
			const lines = quickAddPasteLines(pasted);
			if (lines.length < 2) return;
			if (lines.length > 100) {
				event.preventDefault();
				store.commit('setNotification', {
					color: 'error',
					text: 'Quick Add accepts up to 100 tasks at once'
				});
				return;
			}
			event.preventDefault();
			const el = inputRef.value;
			const start = el?.selectionStart ?? text.value.length;
			const end = el?.selectionEnd ?? start;
			batchLines.value = composeQuickAddBatch(text.value, start, end, lines);
			batchUuids.value = batchLines.value.map(() => quickAddBatchUuid());
			batchSingleText.value = composeQuickAddSingle(text.value, start, end, lines);
		};

		const removeBatchLine = (index: number) => {
			batchLines.value = batchLines.value.filter((_, i) => i !== index);
			batchUuids.value = batchUuids.value.filter((_, i) => i !== index);
		};

		const cancelBatch = () => {
			batchLines.value = [];
			batchUuids.value = [];
			batchSingleText.value = '';
			focusInput();
		};

		const keepBatchAsOne = () => {
			text.value = batchSingleText.value;
			cancelBatch();
		};

		const suggestionKey = (s: Suggestion) => `${s.profile || ''}::${s.email || s.text}`;

		const insertSyntax = (value: string) => {
			if (submitting.value) return;
			const separator = text.value && !/\s$/.test(text.value) ? ' ' : '';
			text.value += `${separator}${value}`;
			nextTick(() => {
				const el = inputRef.value;
				if (!el) return;
				const pos = text.value.length;
				el.focus();
				el.setSelectionRange(pos, pos);
				cursorPos.value = pos;
			});
		};

		const focusInput = () => nextTick(() => inputRef.value?.focus());

		const dateWithCurrentTime = (value: string, currentValue?: string) => {
			const date = parseDateToken(value);
			if (!date) return null;
			const current = currentValue ? moment(currentValue) : null;
			const hasTime = current?.isValid() && /T\d{2}:\d{2}/.test(currentValue || '');
			return hasTime
				? combineDateTime(date, { hours: current!.hour(), minutes: current!.minute() })
				: date;
		};

		const selectDueAction = (value: string) => {
			dueOverride.value = dateWithCurrentTime(value, parsed.value.due);
			focusInput();
		};

		const selectScheduledAction = (value: string) => {
			scheduledOverride.value = dateWithCurrentTime(value, parsed.value.scheduled);
			focusInput();
		};

		const selectPriorityAction = (value: string) => {
			const selected = parseQuickAdd(`Task ${value}`);
			priorityOverride.value = {
				value: selected.priority,
				label: value.toUpperCase()
			};
			focusInput();
		};

		const selectRecurrenceAction = (value: string) => {
			const selected = parseQuickAdd(`Task ${value}`);
			if (!selected.recur || !selected.due) return;
			recurrenceOverride.value = {
				recur: selected.recur,
				due: dueOverride.value || parsed.value.due || selected.due
			};
			focusInput();
		};

		const treatDateAsText = () => {
			if (dueOverride.value) dueOverride.value = null;
			else smartDates.value = false;
			focusInput();
		};

		const treatScheduledAsText = () => {
			scheduledOverride.value = null;
			focusInput();
		};

		const treatRecurrenceAsText = () => {
			if (recurrenceOverride.value) recurrenceOverride.value = null;
			else smartRecurrences.value = false;
			focusInput();
		};

		const applySuggestion = (s: Suggestion) => {
			if (submitting.value) return;
			const t = currentToken.value;
			if (!t) return;
			const before = text.value.slice(0, t.start);
			const after = text.value.slice(cursorPos.value);
			const insert = `${t.sigil}${s.text} `;
			const insertText = t.sigil === '+' && s.email
				? `+${s.email} `
				: insert;
			if (t.sigil === '#' && s.profile) {
				selectedProject.value = { project: s.text, profile: s.profile };
			}
			text.value = before + insertText + after;
			nextTick(() => {
				const el = inputRef.value;
				if (!el) return;
				const newPos = t.start + insertText.length;
				el.focus();
				el.setSelectionRange(newPos, newPos);
				cursorPos.value = newPos;
			});
		};

		const ensureMembersForProfile = async (profile?: string) => {
			if (!profile || profile === activeProfile.value || memberCache.value[profile]) return;
			const members = await store.dispatch('fetchMembersFor', profile) as ProfileMember[];
			memberCache.value = { ...memberCache.value, [profile]: members };
		};

		const payloadForParsed = (p: ParsedQuickAdd, uuid?: string): TaskWithProfile => {
			const profile = targetProfileForProject(p.project);
			const members = !profile || profile === activeProfile.value
				? store.state.members
				: memberCache.value[profile] || [];
			const assignee = resolveAssignee(p.assignee, members);
			if (p.assignee && !assignee) throw new Error(`Unknown assignee: ${p.assignee}`);
			return {
				uuid,
				_profile: profile,
				description: p.description,
				project: p.project,
				tags: p.tags.length ? p.tags : undefined,
				assignee,
				priority: p.priority,
				due: p.due,
				scheduled: p.scheduled,
				until: p.until,
				recur: p.recur,
				twui_reminder: p.reminder,
				twui_duration: p.durationMinutes ? durationMinutesToIso(p.durationMinutes) : undefined,
				annotations: buildQuickAddAnnotations(details.value)
			};
		};

		const clearDraftAndFocus = async () => {
			text.value = '';
			details.value = '';
			detailsOpen.value = false;
			smartDates.value = true;
			smartRecurrences.value = true;
			dueOverride.value = null;
			scheduledOverride.value = null;
			recurrenceOverride.value = null;
			priorityOverride.value = null;
			batchLines.value = [];
			batchUuids.value = [];
			batchSingleText.value = '';
			selectedProject.value = null;
			cursorPos.value = 0;
			await nextTick();
			inputRef.value?.focus();
		};

		const submit = async (keepOpen = false) => {
			if (submitting.value) return;
			const p = parsed.value;
			if (!p.description || p.dateError || p.recurrenceError || p.reminderError || p.durationError) return;
			submitting.value = true;
			try {
				await ensureMembersForProfile(targetProfileForProject(p.project));
				const payload = payloadForParsed(p);
				await store.dispatch('updateTasks', [payload]);
				store.commit('setNotification', {
					color: 'success',
					text: 'Task added'
				});
				submitting.value = false;
				if (keepOpen) await clearDraftAndFocus();
				else close();
			}
			catch (err) {
				// Keep the palette open with the user's input intact so they can retry
				// without re-typing — closing on error would silently lose the entry.
				store.commit('setNotification', {
					color: 'error',
					text: (err as Error).message.startsWith('Unknown assignee:')
						? (err as Error).message
						: 'Failed to add task'
				});
			}
			finally {
				submitting.value = false;
			}
		};

		const submitBatch = async () => {
			if (submitting.value || batchHasErrors.value || !batchParsed.value.length) return;
			submitting.value = true;
			try {
				const profiles = Array.from(new Set(batchParsed.value.map(item =>
					targetProfileForProject(item.project)
				)));
				for (const profile of profiles) await ensureMembersForProfile(profile);
				const payloads = batchParsed.value.map((item, index) =>
					payloadForParsed(item, batchUuids.value[index])
				);
				await store.dispatch('updateTasks', payloads);
				store.commit('setNotification', {
					color: 'success',
					text: `${payloads.length} tasks added`
				});
				submitting.value = false;
				close();
			}
			catch (err) {
				store.commit('setNotification', {
					color: 'error',
					text: (err as Error).message.startsWith('Unknown assignee:')
						? (err as Error).message
						: 'Failed to add tasks'
				});
			}
			finally {
				submitting.value = false;
			}
		};

		return {
			open,
			text,
			details,
			detailsOpen,
			inputRef,
			detailsRef,
			suggestions,
			suggestionType,
			suggestionIcon,
			suggestionKey,
			activeIdx,
			parsed,
			batchLines,
			batchParsed,
			batchMode,
			batchHasErrors,
			batchMeta,
			isParsedTaskValid,
			dateActions,
			priorityActions,
			priorityActionLabel,
			recurrenceActions,
			activeProfile,
			projectTargetProfile,
			hasParsedMeta,
			resolvedAssignee,
			resolvedAssigneeLabel,
			canSubmit,
			displayDate,
			displayDuration,
			priorityNumber,
			close,
			showDescription,
			onDown,
			onUp,
			onTab,
			onEnter,
			onPaste,
			insertSyntax,
			selectDueAction,
			selectScheduledAction,
			selectPriorityAction,
			selectRecurrenceAction,
			treatDateAsText,
			treatScheduledAsText,
			treatRecurrenceAsText,
			removeBatchLine,
			cancelBatch,
			keepBatchAsOne,
			submitBatch,
			applySuggestion,
			syncCursor,
			submit,
			submitting
		};
	}
});
</script>
