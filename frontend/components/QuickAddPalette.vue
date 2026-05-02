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
import moment from 'moment';
import { accessorType } from '../store';

const PRIORITY_MAP: Record<string, 'H' | 'M' | 'L' | undefined> = {
	'1': 'H',
	'2': 'M',
	'3': 'L',
	'4': undefined
};

const DAY_NAMES_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function dayIndexOf(tok: string): number {
	const lower = tok.toLowerCase();
	const full = DAY_NAMES_FULL.indexOf(lower);
	if (full !== -1) return full;
	return DAY_NAMES_SHORT.indexOf(lower);
}

// Date tokens are intentionally date-only (YYYY-MM-DD): the user typed a day,
// not a time, so we don't fabricate one. The list / today filters all treat
// midnight as "all-day"; see hasNoTime() in TaskList.vue.
function dayOfWeekFrom(targetDow: number, weeksAhead = 0): string {
	const m = moment();
	const today = m.day();
	let diff = targetDow - today;
	if (diff <= 0) diff += 7;
	diff += 7 * weeksAhead;
	return m.add(diff, 'day').format('YYYY-MM-DD');
}

function parseDateToken(tok: string): string | undefined {
	const lower = tok.toLowerCase();

	if (lower === 'today') return moment().format('YYYY-MM-DD');
	if (lower === 'tomorrow') return moment().add(1, 'day').format('YYYY-MM-DD');

	if (lower === 'eod') return moment().format('YYYY-MM-DD');
	if (lower === 'eow') return moment().endOf('isoWeek').format('YYYY-MM-DD');
	if (lower === 'eom') return moment().endOf('month').format('YYYY-MM-DD');
	if (lower === 'eoy') return moment().endOf('year').format('YYYY-MM-DD');
	if (lower === 'weekend') return dayOfWeekFrom(6);

	// "next monday", "next mon", "this monday" come in pre-merged as "nextmonday" / "thismon"
	let weekOffset = 0;
	let dayTok = lower;
	if (lower.startsWith('next')) {
		weekOffset = 1;
		dayTok = lower.slice(4);
	}
	else if (lower.startsWith('this')) {
		weekOffset = 0;
		dayTok = lower.slice(4);
	}

	if (weekOffset === 1 && dayTok === 'week') return moment().add(1, 'week').format('YYYY-MM-DD');
	if (weekOffset === 1 && dayTok === 'month') return moment().add(1, 'month').format('YYYY-MM-DD');

	const dayIdx = dayIndexOf(dayTok);
	if (dayIdx !== -1) return dayOfWeekFrom(dayIdx, weekOffset);

	const relMatch = /^\+(\d+)([dwmy])$/.exec(lower);
	if (relMatch) {
		const n = parseInt(relMatch[1], 10);
		const unitMap: Record<string, moment.unitOfTime.DurationConstructor> = {
			d: 'days',
			w: 'weeks',
			m: 'months',
			y: 'years'
		};
		return moment().add(n, unitMap[relMatch[2]]).format('YYYY-MM-DD');
	}

	if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
		const m = moment(lower, 'YYYY-MM-DD', true);
		if (m.isValid()) return lower;
	}

	return undefined;
}

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

		const projects = computed(() => {
			const set = new Set<string>();
			for (const p of store.getters.projects as string[]) {
				if (p) set.add(p);
			}
			return Array.from(set).sort();
		});

		const tags = computed(() => store.getters.tags as string[]);

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
			try {
				await store.dispatch('updateTasks', [{
					description: p.description,
					project: p.project,
					tags: p.tags.length ? p.tags : undefined,
					priority: p.priority,
					due: p.due,
					annotations: []
				}]);
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
