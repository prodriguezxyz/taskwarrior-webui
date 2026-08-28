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
					@keydown.down.prevent="onDown"
					@keydown.up.prevent="onUp"
					@keydown.tab="onTab"
					@keydown.enter.prevent="onEnter"
					@keyup="syncCursor"
					@click="syncCursor"
					@select="syncCursor"
				/>
			</div>

			<div class="tw-quickadd__actions" role="group" aria-label="Task actions">
				<button type="button" class="tw-quickadd__action" :disabled="submitting" @click="insertSyntax('#')">
					<v-icon size="14" aria-hidden="true">mdi-folder-outline</v-icon>
					{{ parsed.project || 'Project' }}
				</button>
				<v-menu offset-y>
					<template v-slot:activator="{ on, attrs }">
						<button v-bind="attrs" v-on="on" type="button" class="tw-quickadd__action" :disabled="submitting">
							<v-icon size="14" aria-hidden="true">mdi-calendar</v-icon>
							{{ parsed.due ? displayDate(parsed.due) : 'Date' }}
						</button>
					</template>
					<v-list dense>
						<v-list-item v-for="dateAction in dateActions" :key="dateAction.value" @click="selectDateAction(dateAction.value)">
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
				<button type="button" class="tw-quickadd__action" :disabled="submitting" @click="insertSyntax('+')">
					<v-icon size="14" aria-hidden="true">mdi-account-outline</v-icon>
					{{ resolvedAssigneeLabel || 'Assignee' }}
				</button>
				<button type="button" class="tw-quickadd__action" :disabled="submitting" @click="insertSyntax('%')">
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
				<button
					type="button"
					class="tw-quickadd__action"
					:class="{ 'tw-quickadd__action--active': detailsOpen }"
					:disabled="submitting"
					@click="showDescription"
				>
					<v-icon size="14" aria-hidden="true">mdi-pencil-outline</v-icon>
					Description
				</button>
			</div>

			<div v-if="detailsOpen" class="tw-quickadd__details">
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

			<div v-if="suggestions.length" class="tw-palette__results" role="listbox">
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

			<div v-if="hasParsedMeta" class="tw-quickadd__preview">
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
			</div>

			<div class="tw-palette__hint">
				<span class="tw-palette__hint-keys">
					<span class="tw-palette__hint-pair"><kbd>#</kbd>project</span>
					<span class="tw-palette__hint-pair"><kbd>%</kbd>label</span>
					<span class="tw-palette__hint-pair"><kbd>+</kbd>person</span>
					<span class="tw-palette__hint-pair"><kbd>p1-p4</kbd>priority</span>
					<span class="tw-palette__hint-pair"><kbd>cada lunes</kbd>repeat</span>
				</span>
				<span class="tw-palette__hint-keys">
					<span class="tw-palette__hint-pair"><kbd>↓</kbd>description</span>
					<span class="tw-palette__hint-pair"><kbd>↵</kbd>add</span>
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
import { applyQuickAddOverrides, parseQuickAdd } from '../utils/quickAddParse';
import { combineDateTime, parseDateToken } from '../utils/dateParse';
import { memberLabel, ProfileMember, resolveAssignee } from '../utils/assignee';
import { buildQuickAddAnnotations } from '../utils/quickAddAnnotations';

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
		const recurrenceOverride = ref<{ recur: string, due: string } | null>(null);
		const priorityOverride = ref<{ value?: 'H' | 'M' | 'L', label: string } | null>(null);
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

		const parsed = computed(() => {
			const base = parseQuickAdd(text.value, {
				parseDates: smartDates.value,
				parseRecurrences: smartRecurrences.value
			});
			return applyQuickAddOverrides(base, {
				...(priorityOverride.value ? { priority: priorityOverride.value.value ?? null } : {}),
				...(recurrenceOverride.value ? { recurrence: recurrenceOverride.value } : {}),
				...(dueOverride.value ? { due: dueOverride.value } : {})
			});
		});
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
			{ label: 'Every week', value: 'every week' },
			{ label: 'Every month', value: 'every month' },
			{ label: 'Every year', value: 'every year' }
		];

		const projectTargetProfile = computed(() => {
			const project = parsed.value.project;
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
		});

		const hasParsedMeta = computed(() =>
			Boolean(parsed.value.project)
			|| Boolean(parsed.value.assignee)
			|| parsed.value.tags.length > 0
			|| Boolean(parsed.value.priority)
			|| Boolean(parsed.value.due)
			|| Boolean(parsed.value.recur)
			|| Boolean(parsed.value.dateError)
			|| Boolean(parsed.value.recurrenceError)
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
				recurrenceOverride.value = null;
				priorityOverride.value = null;
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

		const onEnter = () => {
			if (suggestions.value.length) {
				applySuggestion(suggestions.value[activeIdx.value]);
				return;
			}
			submit();
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

		const selectDateAction = (value: string) => {
			const date = parseDateToken(value);
			if (!date) return;
			const current = parsed.value.due ? moment(parsed.value.due) : null;
			const hasTime = current?.isValid() && /T\d{2}:\d{2}/.test(parsed.value.due || '');
			dueOverride.value = hasTime
				? combineDateTime(date, { hours: current!.hour(), minutes: current!.minute() })
				: date;
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

		const submit = async () => {
			if (submitting.value) return;
			const p = parsed.value;
			if (!p.description || p.dateError || p.recurrenceError) return;
			if (p.assignee && !resolvedAssignee.value) {
				store.commit('setNotification', {
					color: 'error',
					text: 'Unknown assignee'
				});
				return;
			}
			submitting.value = true;
			// Route the write explicitly; otherwise the backend falls back to the
			// user's first allowed profile, which can differ from the intended one.
			const payload: TaskWithProfile = {
				_profile: projectTargetProfile.value || activeProfile.value || undefined,
				description: p.description,
				project: p.project,
				tags: p.tags.length ? p.tags : undefined,
				assignee: resolvedAssignee.value,
				priority: p.priority,
				due: p.due,
				recur: p.recur,
				annotations: buildQuickAddAnnotations(details.value)
			};
			try {
				await store.dispatch('updateTasks', [payload]);
				store.commit('setNotification', {
					color: 'success',
					text: 'Task added'
				});
				submitting.value = false;
				close();
			}
			catch (err) {
				// Keep the palette open with the user's input intact so they can retry
				// without re-typing — closing on error would silently lose the entry.
				store.commit('setNotification', {
					color: 'error',
					text: 'Failed to add task'
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
			priorityNumber,
			close,
			showDescription,
			onDown,
			onUp,
			onTab,
			onEnter,
			insertSyntax,
			selectDateAction,
			selectPriorityAction,
			selectRecurrenceAction,
			treatDateAsText,
			treatRecurrenceAsText,
			applySuggestion,
			syncCursor,
			submit,
			submitting
		};
	}
});
</script>
