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
					placeholder="Buy milk #shopping @errands tomorrow p2…"
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
					:key="s"
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
					<span class="tw-palette__item-desc">{{ s }}</span>
				</button>
			</div>

			<div v-if="hasParsedMeta" class="tw-quickadd__preview">
				<span v-if="parsed.project" class="tw-quickadd__chip">
					<v-icon size="12" aria-hidden="true">mdi-folder-outline</v-icon>
					{{ parsed.project }}
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
					<kbd>tomorrow</kbd>
					<kbd>monday</kbd>
					<kbd>next mon</kbd>
					<kbd>+3d</kbd>
					<kbd>eow</kbd>
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
import { dayIndexOf, parseDateToken } from '../utils/dateParse';

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

function parseQuickAdd(input: string): Parsed {
	const out: Parsed = { description: '', tags: [] };
	const raw = input.split(/\s+/).filter(Boolean);

	// Merge "next <day|week|month>" and "this <day>" into one token so parseDateToken can handle them.
	const tokens: string[] = [];
	for (let i = 0; i < raw.length; i++) {
		const cur = raw[i];
		const lower = cur.toLowerCase();
		const peek = raw[i + 1]?.toLowerCase();
		if ((lower === 'next' || lower === 'this') && peek) {
			const isDay = dayIndexOf(peek) !== -1;
			const isPeriod = lower === 'next' && (peek === 'week' || peek === 'month');
			if (isDay || isPeriod) {
				tokens.push(`${lower}${peek}`);
				i++;
				continue;
			}
		}
		tokens.push(cur);
	}

	const remaining: string[] = [];

	for (const tok of tokens) {
		if (!tok) continue;
		const proj = /^#([\p{L}\p{N}_.-]+)$/u.exec(tok);
		if (proj) {
			out.project = proj[1];
			continue;
		}
		const tag = /^@([\p{L}\p{N}_-]+)$/u.exec(tok);
		if (tag) {
			if (!out.tags.includes(tag[1])) out.tags.push(tag[1]);
			continue;
		}
		const pri = /^p([1-4])$/i.exec(tok);
		if (pri) {
			out.priority = PRIORITY_MAP[pri[1]];
			continue;
		}
		const due = parseDateToken(tok);
		if (due) {
			out.due = due;
			continue;
		}
		remaining.push(tok);
	}

	out.description = remaining.join(' ').trim();
	return out;
}

function displayDate(str?: string) {
	if (!str) return '';
	const date = moment(str);
	const today = moment().startOf('day');
	const diffDays = date.startOf('day').diff(today, 'days');
	if (diffDays === 0) return 'today';
	if (diffDays === 1) return 'tomorrow';
	if (diffDays === -1) return 'yesterday';
	if (diffDays > 1 && diffDays < 7) return date.format('dddd');
	return date.format('YYYY-MM-DD');
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

		// Suggestions are scoped to the active profile in multi-profile mode so
		// projects/tags from other profiles don't leak into the picker (and don't
		// confuse the user into committing a project that won't exist where the
		// task actually lands).
		const projects = computed(() => {
			const set = new Set<string>();
			for (const t of store.getters.ownTasks as Task[]) {
				if (t.project) set.add(t.project);
			}
			return Array.from(set).sort();
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

		const suggestions = computed((): string[] => {
			const t = currentToken.value;
			if (!t) return [];
			const list = t.sigil === '#' ? projects.value : tags.value;
			const prefix = t.prefix.toLowerCase();
			const parsed = parseQuickAdd(text.value);
			const used = t.sigil === '@' ? new Set(parsed.tags) : new Set<string>();
			return list
				.filter(item => {
					if (used.has(item)) return false;
					if (!prefix) return true;
					return item.toLowerCase().includes(prefix);
				})
				.slice(0, 6);
		});

		const parsed = computed(() => parseQuickAdd(text.value));

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
				await nextTick();
				inputRef.value?.focus();
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

		const applySuggestion = (s: string) => {
			const t = currentToken.value;
			if (!t) return;
			const before = text.value.slice(0, t.start);
			const after = text.value.slice(cursorPos.value);
			const insert = `${t.sigil}${s} `;
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
			// Route the write to the active profile. Without this the backend
			// falls back to the user's first allowed profile, which can differ
			// from the one the user is looking at.
			const payload: TaskWithProfile = {
				_profile: store.state.settings.profile || undefined,
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
			activeIdx,
			parsed,
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
