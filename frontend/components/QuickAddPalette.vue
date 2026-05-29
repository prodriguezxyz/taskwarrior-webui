<template>
	<v-dialog
		v-model="open"
		max-width="640"
		content-class="tw-palette__dialog"
		transition="fade-transition"
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
					@keydown.down.prevent="onDown"
					@keydown.up.prevent="onUp"
					@keydown.tab.prevent="onTab"
					@keydown.enter.prevent="onEnter"
					@keyup="syncCursor"
					@click="syncCursor"
					@select="syncCursor"
				/>
			</div>

			<div v-if="suggestions.length" class="tw-palette__results" role="listbox">
				<button
					v-for="(s, i) in suggestions"
					:key="suggestionKey(s)"
					type="button"
					role="option"
					:aria-selected="i === activeIdx"
					class="tw-palette__item"
					:class="{ 'tw-palette__item--active': i === activeIdx }"
					@mouseenter="activeIdx = i"
					@mousedown.prevent="applySuggestion(s)"
				>
					<v-icon size="14" class="tw-palette__item-icon" aria-hidden="true">
						{{ suggestionType === 'project' ? 'mdi-folder-outline' : 'mdi-tag-outline' }}
					</v-icon>
					<span class="tw-palette__item-desc">{{ s.text }}</span>
					<span v-if="s.profile" class="tw-palette__item-profile">{{ s.profile }}</span>
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
			</div>

			<div class="tw-palette__hint">
				<span class="tw-palette__hint-keys">
					<kbd>#</kbd>project
					<kbd>@</kbd>tag
					<kbd>p1-p4</kbd>
					<kbd>today</kbd>
					<kbd>mañana</kbd>
					<kbd>lunes</kbd>
					<kbd>next mon</kbd>
					<kbd>+3d</kbd>
					<kbd>eow</kbd>
					<kbd>a las 5</kbd>
					<kbd>3pm</kbd>
					<kbd>15:00</kbd>
				</span>
				<span class="tw-palette__hint-keys">
					<kbd>↵</kbd>
					add
					<kbd>Esc</kbd>
					close
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
	deaccent,
	mergeDatePhrases,
	parseDateToken,
	parseTimeToken,
	parseBareHour,
	isTimeLike,
	dayPartOf,
	applyDayPart,
	combineDateTime
} from '../utils/dateParse';

const PRIORITY_MAP: Record<string, 'H' | 'M' | 'L' | undefined> = {
	'1': 'H',
	'2': 'M',
	'3': 'L',
	'4': undefined
};

interface Parsed {
	description: string;
	project?: string;
	tags: string[];
	priority?: 'H' | 'M' | 'L';
	due?: string;
}

interface Suggestion {
	text: string;
	profile?: string;
}

// Merges date phrases (shared with the reschedule popover via mergeDatePhrases), then
// joins clock times split across tokens ("3 pm" -> "3pm"). The time merge is quick-add
// only; "a las"/"at" prepositions are handled in the main loop, not here.
function mergePhrases(raw: string[]): string[] {
	const dated = mergeDatePhrases(raw);
	const tokens: string[] = [];
	for (let i = 0; i < dated.length; i++) {
		const cur = dated[i];
		const lower = cur.toLowerCase();
		const peek = dated[i + 1]?.toLowerCase();
		if (/^\d{1,2}(:\d{2})?$/.test(lower) && (peek === 'am' || peek === 'pm')) {
			tokens.push(`${lower}${peek}`);
			i++;
			continue;
		}
		tokens.push(cur);
	}
	return tokens;
}

function parseQuickAdd(input: string): Parsed {
	const out: Parsed = { description: '', tags: [] };
	const tokens = mergePhrases(input.split(/\s+/).filter(Boolean));

	const remaining: string[] = [];
	let dueDate: string | undefined;
	let dueTime: { hours: number; minutes: number } | undefined;

	let i = 0;
	while (i < tokens.length) {
		const tok = tokens[i];
		const lower = tok.toLowerCase();
		const plain = deaccent(lower);

		const proj = /^#([\p{L}\p{N}_.-]+)$/u.exec(tok);
		if (proj) {
			out.project = proj[1];
			i++;
			continue;
		}
		const tag = /^@([\p{L}\p{N}_-]+)$/u.exec(tok);
		if (tag) {
			if (!out.tags.includes(tag[1])) out.tags.push(tag[1]);
			i++;
			continue;
		}
		const pri = /^p([1-4])$/i.exec(tok);
		if (pri) {
			out.priority = PRIORITY_MAP[pri[1]];
			i++;
			continue;
		}

		// Time preposition: "at <time>", "a las <time>", "a la <time>". Only consumed when
		// a time actually follows, so plain prose ("voy a la tienda") keeps its words. This
		// is what lets a bare hour like "a las 5" register — parseBareHour accepts the marker-
		// less number once the preposition vouches for it.
		const next = tokens[i + 1]?.toLowerCase();
		if (lower === 'at' && isTimeLike(tokens[i + 1])) {
			dueTime = parseTimeToken(tokens[i + 1]) ?? parseBareHour(tokens[i + 1]);
			i += 2;
			continue;
		}
		if (lower === 'a' && (next === 'las' || next === 'la') && isTimeLike(tokens[i + 2])) {
			dueTime = parseTimeToken(tokens[i + 2]) ?? parseBareHour(tokens[i + 2]);
			i += 3;
			continue;
		}

		// Daypart phrase "de/por la <mañana|tarde|noche|madrugada>": shifts an already-parsed
		// time (5 -> 17 for "de la tarde"). With no time yet it's just prose — keep the words
		// verbatim so "mañana" inside it isn't mistaken for tomorrow.
		if ((plain === 'de' || plain === 'por') && deaccent(next ?? '') === 'la' && dayPartOf(tokens[i + 2])) {
			if (dueTime) dueTime = applyDayPart(dueTime, dayPartOf(tokens[i + 2])!);
			else remaining.push(tok, tokens[i + 1], tokens[i + 2]);
			i += 3;
			continue;
		}

		const date = parseDateToken(lower);
		if (date) {
			dueDate = date;
			i++;
			continue;
		}
		const time = parseTimeToken(lower);
		if (time) {
			dueTime = time;
			i++;
			continue;
		}

		remaining.push(tok);
		i++;
	}

	// A bare time ("3pm") with no day attaches to today; "tomorrow 3pm" combines both.
	if (dueTime) out.due = combineDateTime(dueDate ?? moment().format('YYYY-MM-DD'), dueTime);
	else if (dueDate) out.due = dueDate;

	out.description = remaining.join(' ').trim();
	return out;
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

		const open = computed({
			get: () => store.state.quickAddOpen,
			set: val => store.commit('setQuickAddOpen', val)
		});

		const text = ref('');
		const cursorPos = ref(0);
		const activeIdx = ref(0);
		const submitting = ref(false);
		const inputRef = ref<HTMLInputElement | null>(null);
		const selectedProject = ref<{ project: string, profile: string } | null>(null);
		const activeProfile = computed(() => store.state.settings.profile);

		const projectSuggestions = computed((): Suggestion[] => {
			const seen = new Set<string>();
			const byProfile = new Map<string, Set<string>>();
			for (const t of store.state.tasks as TaskWithProfile[]) {
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
			const m = /([#@])([\p{L}\p{N}_.-]*)$/u.exec(before);
			if (!m) return null;
			return {
				sigil: m[1] as '#' | '@',
				prefix: m[2],
				start: pos - m[0].length
			};
		});

		const suggestionType = computed(() => {
			const t = currentToken.value;
			if (!t) return null;
			return t.sigil === '#' ? 'project' : 'tag';
		});

		const suggestions = computed((): Suggestion[] => {
			const t = currentToken.value;
			if (!t) return [];
			const list = t.sigil === '#'
				? projectSuggestions.value
				: tags.value.map(text => ({ text }));
			const prefix = t.prefix.toLowerCase();
			const parsed = parseQuickAdd(text.value);
			const used = t.sigil === '@' ? new Set(parsed.tags) : new Set<string>();
			return list
				.filter(item => {
					if (used.has(item.text)) return false;
					if (!prefix) return true;
					return item.text.toLowerCase().includes(prefix);
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
			|| parsed.value.tags.length > 0
			|| Boolean(parsed.value.priority)
			|| Boolean(parsed.value.due)
		);

		watch(suggestions, () => {
			activeIdx.value = 0;
		});

		watch(open, async val => {
			if (val) {
				text.value = '';
				cursorPos.value = 0;
				activeIdx.value = 0;
				submitting.value = false;
				selectedProject.value = null;
				await nextTick();
				inputRef.value?.focus();
			}
		});

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
			open.value = false;
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

		const suggestionKey = (s: Suggestion) => `${s.profile || ''}::${s.text}`;

		const applySuggestion = (s: Suggestion) => {
			const t = currentToken.value;
			if (!t) return;
			const before = text.value.slice(0, t.start);
			const after = text.value.slice(cursorPos.value);
			const insert = `${t.sigil}${s.text} `;
			if (t.sigil === '#' && s.profile) {
				selectedProject.value = { project: s.text, profile: s.profile };
			}
			text.value = before + insert + after;
			nextTick(() => {
				const el = inputRef.value;
				if (!el) return;
				const newPos = t.start + insert.length;
				el.focus();
				el.setSelectionRange(newPos, newPos);
				cursorPos.value = newPos;
			});
		};

		const submit = async () => {
			if (submitting.value) return;
			const p = parsed.value;
			if (!p.description) return;
			submitting.value = true;
			// Route the write explicitly; otherwise the backend falls back to the
			// user's first allowed profile, which can differ from the intended one.
			const payload: TaskWithProfile = {
				_profile: projectTargetProfile.value || activeProfile.value || undefined,
				description: p.description,
				project: p.project,
				tags: p.tags.length ? p.tags : undefined,
				priority: p.priority,
				due: p.due,
				annotations: []
			};
			try {
				await store.dispatch('updateTasks', [payload]);
				store.commit('setNotification', {
					color: 'success',
					text: 'Task added'
				});
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
			inputRef,
			suggestions,
			suggestionType,
			suggestionKey,
			activeIdx,
			parsed,
			activeProfile,
			projectTargetProfile,
			hasParsedMeta,
			displayDate,
			close,
			onDown,
			onUp,
			onTab,
			onEnter,
			applySuggestion,
			syncCursor
		};
	}
});
</script>
