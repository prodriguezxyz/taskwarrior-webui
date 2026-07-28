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
					placeholder="Buy milk #shopping @errands tomorrow 3pm p2…"
					autocomplete="off"
					spellcheck="false"
					enterkeyhint="done"
					:disabled="submitting"
					@keydown.down.prevent="onDown"
					@keydown.up.prevent="onUp"
					@keydown.tab.prevent="onTab"
					@keydown.enter.prevent="onEnter"
					@keyup="syncCursor"
					@click="syncCursor"
					@select="syncCursor"
				/>
				<v-menu offset-y left>
					<template v-slot:activator="{ on, attrs }">
						<v-btn
							v-bind="attrs"
							v-on="on"
							icon
							small
							:disabled="submitting"
							aria-label="More actions"
							title="More actions"
						>
							<v-icon size="18">mdi-dots-horizontal</v-icon>
						</v-btn>
					</template>
					<v-list dense>
						<v-list-item @click="showDescription">
							<v-list-item-icon>
								<v-icon small>mdi-pencil-outline</v-icon>
							</v-list-item-icon>
							<v-list-item-content>
								<v-list-item-title>Description</v-list-item-title>
							</v-list-item-content>
						</v-list-item>
					</v-list>
				</v-menu>
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
					P{{ parsed.priority }}
				</span>
				<span v-if="parsed.due" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-calendar</v-icon>
					{{ displayDate(parsed.due) }}
				</span>
				<span v-if="parsed.dateError" class="tw-quickadd__chip tw-quickadd__chip--error">
					<v-icon size="12" aria-hidden="true">mdi-alert-circle-outline</v-icon>
					Conflicting dates
				</span>
			</div>

			<div class="tw-palette__hint">
				<span class="tw-palette__hint-keys">
					<span class="tw-palette__hint-pair"><kbd>#</kbd>project</span>
					<span class="tw-palette__hint-pair"><kbd>@</kbd>tag</span>
					<span class="tw-palette__hint-pair"><kbd>+</kbd>person</span>
					<span class="tw-palette__hint-pair"><kbd>p1-p4</kbd>priority</span>
					<span class="tw-palette__hint-pair"><kbd>today</kbd>date</span>
					<span class="tw-palette__hint-pair"><kbd>mañana</kbd>date</span>
					<span class="tw-palette__hint-pair"><kbd>+3d</kbd>date</span>
					<span class="tw-palette__hint-pair"><kbd>3pm</kbd>time</span>
				</span>
				<span class="tw-palette__hint-keys">
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
import { parseQuickAdd } from '../utils/quickAddParse';
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
			const m = /([#@+])([\p{L}\p{N}_.@+-]*)$/u.exec(before);
			if (!m) return null;
			return {
				sigil: m[1] as '#' | '@' | '+',
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
			const used = t.sigil === '@' ? new Set(parsed.tags) : new Set<string>();
			return list
				.filter(item => {
					if (used.has(item.text)) return false;
					if (!prefix) return true;
					return item.text.toLowerCase().includes(prefix)
						|| Boolean(item.email?.toLowerCase().includes(prefix));
				})
				.slice(0, 6);
		});

		const parsed = computed(() => parseQuickAdd(text.value));

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
			|| Boolean(parsed.value.dateError)
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
				cursorPos.value = 0;
				activeIdx.value = 0;
				submitting.value = false;
				selectedProject.value = null;
				await nextTick();
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
			const project = parseQuickAdd(text.value).project;
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
			if (!suggestions.value.length) return;
			activeIdx.value = (activeIdx.value + 1) % suggestions.value.length;
		};

		const onUp = () => {
			const n = suggestions.value.length;
			if (!n) return;
			activeIdx.value = (activeIdx.value - 1 + n) % n;
		};

		const onTab = () => {
			if (suggestions.value.length) applySuggestion(suggestions.value[activeIdx.value]);
		};

		const onEnter = () => {
			if (suggestions.value.length) {
				applySuggestion(suggestions.value[activeIdx.value]);
				return;
			}
			submit();
		};

		const suggestionKey = (s: Suggestion) => `${s.profile || ''}::${s.email || s.text}`;

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
			if (!p.description || p.dateError) return;
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
			activeProfile,
			projectTargetProfile,
			hasParsedMeta,
			resolvedAssignee,
			resolvedAssigneeLabel,
			canSubmit,
			displayDate,
			close,
			showDescription,
			onDown,
			onUp,
			onTab,
			onEnter,
			applySuggestion,
			syncCursor,
			submit,
			submitting
		};
	}
});
</script>
