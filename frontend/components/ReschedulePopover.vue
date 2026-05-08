<template>
	<v-menu
		v-model="open"
		:position-x="positionX"
		:position-y="positionY"
		:close-on-content-click="false"
		:nudge-bottom="4"
		absolute
		offset-y
		min-width="280"
		max-width="280"
		transition="fade-transition"
		content-class="tw-reschedule__menu"
	>
		<div
			class="tw-reschedule"
			role="dialog"
			aria-label="Reschedule task"
			@keydown.esc.stop.prevent="close"
		>
			<div class="tw-reschedule__inputwrap">
				<v-icon size="16" class="tw-reschedule__icon" aria-hidden="true">mdi-calendar</v-icon>
				<input
					ref="inputRef"
					v-model="text"
					type="text"
					class="tw-reschedule__input"
					placeholder="tomorrow, +3d, mon…"
					autocomplete="off"
					spellcheck="false"
					aria-label="Reschedule date"
					@keydown.enter.prevent="onInputEnter"
					@keydown.down.prevent="focusPreset(0)"
				/>
			</div>

			<div
				class="tw-reschedule__hint"
				:class="{ 'tw-reschedule__hint--invalid': text && !parsed }"
				aria-live="polite"
				aria-atomic="true"
			>
				<template v-if="parsed">→ {{ parsedLabel }}</template>
				<template v-else-if="text">Unrecognized date</template>
				<template v-else>&nbsp;</template>
			</div>

			<div class="tw-reschedule__presets" role="listbox">
				<button
					v-for="(p, idx) in presets"
					:key="p.label"
					ref="presetRefs"
					type="button"
					role="option"
					class="tw-reschedule__preset"
					@click="apply(p.value)"
					@keydown.down.prevent="focusPreset(idx + 1)"
					@keydown.up.prevent="focusPrev(idx)"
				>
					<span class="tw-reschedule__preset-label">{{ p.label }}</span>
					<span class="tw-reschedule__preset-hint">{{ p.hint }}</span>
				</button>
			</div>
		</div>
	</v-menu>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch, nextTick, PropType } from '@nuxtjs/composition-api';
import { Task } from 'taskwarrior-lib';
import moment from 'moment';
import { parseDateInput, dayOfWeekFrom } from '../utils/dateParse';

interface Preset {
	label: string;
	hint: string;
	value: string | undefined;
}

function todayStr() {
	return moment().format('YYYY-MM-DD');
}
function shortLabel(d?: string) {
	if (!d) return '';
	const m = moment(d);
	const today = moment().startOf('day');
	const diff = m.clone().startOf('day').diff(today, 'days');
	if (diff === 0) return 'today';
	if (diff === 1) return 'tomorrow';
	if (diff > 1 && diff < 7) return m.format('ddd');
	return m.format('MMM D');
}

export default defineComponent({
	props: {
		value: { type: Boolean, default: false },
		task: { type: Object as PropType<Task | null>, default: null },
		positionX: { type: Number, default: 0 },
		positionY: { type: Number, default: 0 }
	},

	setup(props, ctx) {
		const open = computed({
			get: () => props.value,
			set: v => ctx.emit('input', v)
		});

		const text = ref('');
		const inputRef = ref<HTMLInputElement | null>(null);
		const presetRefs = ref<HTMLButtonElement[]>([]);

		const presets = computed<Preset[]>(() => [
			{ label: 'Today', hint: shortLabel(todayStr()), value: todayStr() },
			{ label: 'Tomorrow', hint: shortLabel(moment().add(1, 'day').format('YYYY-MM-DD')), value: moment().add(1, 'day').format('YYYY-MM-DD') },
			{ label: 'Next Monday', hint: shortLabel(dayOfWeekFrom(1)), value: dayOfWeekFrom(1) },
			{ label: 'Weekend', hint: shortLabel(dayOfWeekFrom(6)), value: dayOfWeekFrom(6) },
			{ label: 'No date', hint: '—', value: undefined }
		]);

		const parsed = computed(() => parseDateInput(text.value));
		const parsedLabel = computed(() => {
			if (!parsed.value) return '';
			return moment(parsed.value).format('dddd, MMM D');
		});

		const close = () => {
			open.value = false;
		};

		const apply = (due: string | undefined) => {
			if (!props.task) {
				close(); return;
			}
			ctx.emit('apply', { task: props.task, due });
			close();
		};

		const onInputEnter = () => {
			if (!parsed.value) return;
			apply(parsed.value);
		};

		const focusPreset = async (idx: number) => {
			await nextTick();
			const list = presetRefs.value;
			if (!list.length) return;
			const i = Math.max(0, Math.min(list.length - 1, idx));
			list[i]?.focus();
		};

		const focusPrev = (idx: number) => {
			if (idx === 0) inputRef.value?.focus();
			else focusPreset(idx - 1);
		};

		watch(open, v => {
			if (!v) return;
			text.value = '';
			// v-menu uses fade-transition; the input element is mounted
			// immediately but the menu container is briefly opacity:0 and
			// not focusable. requestAnimationFrame after nextTick lets the
			// transition's first paint pass before we steal focus.
			nextTick(() => {
				requestAnimationFrame(() => inputRef.value?.focus());
			});
		});

		return {
			open,
			text,
			inputRef,
			presetRefs,
			presets,
			parsed,
			parsedLabel,
			apply,
			close,
			onInputEnter,
			focusPreset,
			focusPrev
		};
	}
});
</script>

<style>
.tw-reschedule__menu {
	border-radius: 8px;
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
	overflow: hidden;
}
.theme--dark .tw-reschedule__menu {
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>

<style scoped>
.tw-reschedule {
	background: #fff;
	border: 1px solid rgba(0, 0, 0, 0.08);
	border-radius: 8px;
	overflow: hidden;
	font-size: 13px;
}
.theme--dark .tw-reschedule {
	background: #1f1f1f;
	border-color: rgba(255, 255, 255, 0.08);
}

.tw-reschedule__inputwrap {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 10px 12px 6px;
}
.tw-reschedule__icon {
	opacity: 0.55;
}
.tw-reschedule__input {
	flex: 1;
	border: none;
	outline: none;
	background: transparent;
	font: inherit;
	color: inherit;
	min-width: 0;
}
.tw-reschedule__input::placeholder {
	opacity: 0.45;
}

.tw-reschedule__hint {
	padding: 0 12px 8px;
	font-size: 11px;
	opacity: 0.7;
	min-height: 18px;
	line-height: 1.4;
	font-variant-numeric: tabular-nums;
}
.tw-reschedule__hint--invalid {
	opacity: 0.55;
	color: #c62828;
}
.theme--dark .tw-reschedule__hint--invalid {
	color: #ef9a9a;
}

.tw-reschedule__presets {
	display: flex;
	flex-direction: column;
	border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.theme--dark .tw-reschedule__presets {
	border-top-color: rgba(255, 255, 255, 0.06);
}

.tw-reschedule__preset {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	padding: 8px 12px;
	border: none;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color 0.08s ease;
}
.tw-reschedule__preset:hover,
.tw-reschedule__preset:focus-visible {
	background: rgba(0, 0, 0, 0.05);
	outline: none;
}
.theme--dark .tw-reschedule__preset:hover,
.theme--dark .tw-reschedule__preset:focus-visible {
	background: rgba(255, 255, 255, 0.06);
}
.tw-reschedule__preset-label {
	font-size: 13px;
}
.tw-reschedule__preset-hint {
	font-size: 11px;
	opacity: 0.55;
	font-variant-numeric: tabular-nums;
}
</style>
