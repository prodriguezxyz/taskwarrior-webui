<template>
	<div class="tw-calendar">
		<div class="tw-calendar__toolbar">
			<div class="tw-calendar__nav">
				<button
					type="button"
					class="tw-action tw-action--ghost"
					:title="previousLabel"
					:aria-label="previousLabel"
					@click="previousPeriod"
				>
					<v-icon size="18" aria-hidden="true">mdi-chevron-left</v-icon>
				</button>
				<button
					type="button"
					class="tw-action tw-action--ghost"
					title="Today"
					@click="goToday"
				>
					<v-icon size="18" aria-hidden="true">mdi-calendar-today</v-icon>
				</button>
				<button
					type="button"
					class="tw-action tw-action--ghost"
					:title="nextLabel"
					:aria-label="nextLabel"
					@click="nextPeriod"
				>
					<v-icon size="18" aria-hidden="true">mdi-chevron-right</v-icon>
				</button>
				<div class="tw-calendar__period">{{ periodLabel }}</div>
			</div>

			<div class="tw-calendar__actions">
				<nav
					class="tw-tabs tw-calendar__mode"
					role="tablist"
					aria-label="Calendar view"
				>
					<button
						v-for="opt in modeOptions"
						:key="opt.value"
						type="button"
						role="tab"
						:aria-selected="opt.value === calendarViewMode"
						class="tw-tab"
						:class="{ 'tw-tab--active': opt.value === calendarViewMode }"
						@click="setCalendarViewMode(opt.value)"
					>
						<v-icon size="15" class="tw-tab__icon" aria-hidden="true">{{ opt.icon }}</v-icon>
						<span class="tw-tab__label">{{ opt.label }}</span>
					</button>
				</nav>
				<nav
					v-if="hasMembers"
					class="tw-tabs tw-calendar__scope"
					role="tablist"
					aria-label="Calendar scope"
				>
					<button
						v-for="opt in scopeOptions"
						:key="opt.value"
						type="button"
						role="tab"
						:aria-selected="opt.value === calendarScope"
						class="tw-tab"
						:class="{ 'tw-tab--active': opt.value === calendarScope }"
						@click="setCalendarScope(opt.value)"
					>
						<v-icon size="15" class="tw-tab__icon" aria-hidden="true">{{ opt.icon }}</v-icon>
						<span class="tw-tab__label">{{ opt.label }}</span>
					</button>
				</nav>
				<button
					type="button"
					class="tw-action tw-action--ghost"
					title="Refresh"
					aria-label="Refresh tasks"
					@click="refresh"
				>
					<v-icon size="18" aria-hidden="true">mdi-refresh</v-icon>
				</button>
			</div>
		</div>

		<div class="tw-calendar__layout">
			<section
				class="tw-calendar__grid"
				:class="{ 'tw-calendar__grid--week': calendarViewMode === 'week' }"
				:aria-label="calendarViewMode === 'week' ? 'Week calendar' : 'Month calendar'"
			>
				<div
					v-for="day in weekDays"
					:key="day"
					class="tw-calendar__weekday"
				>
					{{ day }}
				</div>
				<button
					v-for="day in visibleDays"
					:key="day.key"
					type="button"
					class="tw-calendar__day"
					:class="[
						{
							'tw-calendar__day--outside': day.isOutside,
							'tw-calendar__day--today': day.isToday,
							'tw-calendar__day--selected': day.key === selectedDayKey
						},
						`tw-calendar__day--${calendarViewMode}`
					]"
					:aria-pressed="day.key === selectedDayKey"
					@click="selectDay(day.key)"
				>
					<span class="tw-calendar__date">{{ day.label }}</span>
					<span class="tw-calendar__items">
						<span
							v-for="item in day.visibleItems"
							:key="`${day.key}-${item.task.uuid || item.task.description}-${item.source}`"
							class="tw-calendar__pill"
							:class="{ 'tw-calendar__pill--timed': !item.allDay }"
						>
							<span v-if="!item.allDay" class="tw-calendar__pill-time">{{ item.start.format('HH:mm') }}</span>
							{{ item.task.description }}
						</span>
						<span
							v-if="day.hiddenCount > 0"
							class="tw-calendar__more"
						>
							+{{ day.hiddenCount }}
						</span>
					</span>
				</button>
			</section>

			<aside class="tw-calendar__agenda" aria-label="Selected day agenda">
				<div class="tw-calendar__agenda-head">
					<div>
						<div class="tw-calendar__agenda-label">{{ selectedDayLabel }}</div>
						<div class="tw-calendar__agenda-count">{{ selectedItems.length }} tasks</div>
					</div>
				</div>

				<div v-if="selectedItems.length" class="tw-calendar__agenda-list">
					<button
						v-for="item in selectedItems"
						:key="`${item.task.uuid || item.task.description}-${item.source}`"
						type="button"
						class="tw-calendar__agenda-item"
						@click="openTask(item.task)"
					>
						<span class="tw-calendar__agenda-time">
							{{ item.allDay ? 'All day' : item.start.format('HH:mm') }}
						</span>
						<span class="tw-calendar__agenda-main">
							<span class="tw-calendar__agenda-title">{{ item.task.description }}</span>
							<span class="tw-calendar__agenda-meta">
								<span>{{ item.source }}</span>
								<span v-if="profileLabel(item.task)">{{ profileLabel(item.task) }}</span>
								<span v-if="item.task.project">{{ item.task.project }}</span>
							</span>
						</span>
					</button>
				</div>
				<div v-else class="tw-calendar__empty">
					No tasks
				</div>
			</aside>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch, useContext, useStore } from '@nuxtjs/composition-api';
import moment from 'moment';
import { Task } from 'taskwarrior-lib';
import { accessorType, TaskWithProfile } from '../store';
import { calendarTaskItems, CalendarTaskItem } from '../utils/calendar';

type CalendarScope = 'mine' | 'all';
type CalendarViewMode = 'month' | 'week';
type CalendarOption<T extends string> = { value: T, label: string, icon: string };

export default defineComponent({
	props: {
		tasks: {
			type: Array,
			default: () => []
		}
	},

	setup(props) {
		const store = useStore<typeof accessorType>();
		const context = useContext();
		const selectedDay = ref(moment().startOf('day'));
		const currentPeriod = ref(selectedDay.value.clone().startOf('month'));

		const calendarScope = computed<CalendarScope>(() =>
			(store.state.settings as any).calendarScope || 'mine'
		);
		const calendarViewMode = computed<CalendarViewMode>(() =>
			(store.state.settings as any).calendarViewMode === 'week' ? 'week' : 'month'
		);
		const hasMembers = computed(() => store.state.members.length > 1);
		const scopeOptions: Array<CalendarOption<CalendarScope>> = [
			{ value: 'mine', label: 'Mine', icon: 'mdi-account-check-outline' },
			{ value: 'all', label: 'All', icon: 'mdi-account-group-outline' }
		];
		const modeOptions: Array<CalendarOption<CalendarViewMode>> = [
			{ value: 'month', label: 'Month', icon: 'mdi-calendar-month-outline' },
			{ value: 'week', label: 'Week', icon: 'mdi-calendar-week-outline' }
		];

		const scopedTasks = computed(() => {
			const tasks = (props.tasks as Task[]) || [];
			return tasks.filter(task => store.getters.inCalendarScope(task));
		});
		const items = computed(() => calendarTaskItems(scopedTasks.value));
		const visibleItemLimit = computed(() => {
			if (context.$vuetify.breakpoint.xsOnly) return calendarViewMode.value === 'week' ? 2 : 1;
			return calendarViewMode.value === 'week' ? 8 : 3;
		});

		const periodLabel = computed(() => {
			if (calendarViewMode.value === 'week') {
				const start = currentPeriod.value.clone().startOf('isoWeek');
				const end = start.clone().add(6, 'days');
				if (start.isSame(end, 'month')) return `${start.format('D')} - ${end.format('D MMMM YYYY')}`;
				if (start.isSame(end, 'year')) return `${start.format('D MMM')} - ${end.format('D MMM YYYY')}`;
				return `${start.format('D MMM YYYY')} - ${end.format('D MMM YYYY')}`;
			}
			return currentPeriod.value.format('MMMM YYYY');
		});
		const previousLabel = computed(() => calendarViewMode.value === 'week' ? 'Previous week' : 'Previous month');
		const nextLabel = computed(() => calendarViewMode.value === 'week' ? 'Next week' : 'Next month');
		const selectedDayKey = computed(() => selectedDay.value.format('YYYY-MM-DD'));
		const selectedDayLabel = computed(() => selectedDay.value.format('dddd, D MMMM'));
		const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

		const visibleDays = computed(() => {
			const isWeek = calendarViewMode.value === 'week';
			const start = isWeek
				? currentPeriod.value.clone().startOf('isoWeek')
				: currentPeriod.value.clone().startOf('month').startOf('isoWeek');
			const count = isWeek ? 7 : 42;
			const todayKey = moment().format('YYYY-MM-DD');
			const days: Array<{
				key: string;
				label: string;
				isOutside: boolean;
				isToday: boolean;
				items: CalendarTaskItem[];
				visibleItems: CalendarTaskItem[];
				hiddenCount: number;
			}> = [];
			for (let i = 0; i < count; i++) {
				const date = start.clone().add(i, 'days');
				const key = date.format('YYYY-MM-DD');
				const dayItems = items.value.filter(item => item.start.isSame(date, 'day'));
				days.push({
					key,
					label: date.format('D'),
					isOutside: !isWeek && date.month() !== currentPeriod.value.month(),
					isToday: key === todayKey,
					items: dayItems,
					visibleItems: dayItems.slice(0, visibleItemLimit.value),
					hiddenCount: Math.max(0, dayItems.length - visibleItemLimit.value)
				});
			}
			return days;
		});

		const selectedItems = computed(() =>
			items.value.filter(item => item.start.isSame(selectedDay.value, 'day'))
		);

		watch(currentPeriod, period => {
			if (calendarViewMode.value === 'week') {
				if (!selectedDay.value.isSame(period, 'isoWeek')) {
					selectedDay.value = period.clone().startOf('isoWeek');
				}
				return;
			}
			if (!selectedDay.value.isSame(period, 'month')) {
				selectedDay.value = period.clone().startOf('month');
			}
		});

		watch(calendarViewMode, mode => {
			currentPeriod.value = selectedDay.value.clone().startOf(mode === 'week' ? 'isoWeek' : 'month');
		});

		const previousPeriod = () => {
			const unit = calendarViewMode.value === 'week' ? 'week' : 'month';
			currentPeriod.value = currentPeriod.value.clone().subtract(1, unit).startOf(unit === 'week' ? 'isoWeek' : 'month');
		};
		const nextPeriod = () => {
			const unit = calendarViewMode.value === 'week' ? 'week' : 'month';
			currentPeriod.value = currentPeriod.value.clone().add(1, unit).startOf(unit === 'week' ? 'isoWeek' : 'month');
		};
		const goToday = () => {
			selectedDay.value = moment().startOf('day');
			currentPeriod.value = selectedDay.value.clone().startOf(calendarViewMode.value === 'week' ? 'isoWeek' : 'month');
		};
		const selectDay = (key: string) => {
			selectedDay.value = moment(key, 'YYYY-MM-DD');
			if (calendarViewMode.value === 'week') {
				if (!selectedDay.value.isSame(currentPeriod.value, 'isoWeek')) {
					currentPeriod.value = selectedDay.value.clone().startOf('isoWeek');
				}
				return;
			}
			if (!selectedDay.value.isSame(currentPeriod.value, 'month')) {
				currentPeriod.value = selectedDay.value.clone().startOf('month');
			}
		};
		const setCalendarViewMode = (value: CalendarViewMode) => {
			if (value === calendarViewMode.value) return;
			store.dispatch('updateSettings', {
				...store.state.settings,
				calendarViewMode: value
			});
		};
		const setCalendarScope = (value: CalendarScope) => {
			if (value === calendarScope.value) return;
			store.dispatch('updateSettings', {
				...store.state.settings,
				calendarScope: value
			});
		};
		const refresh = () => store.dispatch('fetchTasks');
		const openTask = (task: Task) => store.commit('openEditTaskDialog', task);
		const profileLabel = (task: Task) => (task as TaskWithProfile)._profile || '';

		return {
			calendarScope,
			calendarViewMode,
			hasMembers,
			modeOptions,
			scopeOptions,
			periodLabel,
			previousLabel,
			nextLabel,
			selectedDayKey,
			selectedDayLabel,
			weekDays,
			visibleDays,
			selectedItems,
			previousPeriod,
			nextPeriod,
			goToday,
			selectDay,
			setCalendarViewMode,
			setCalendarScope,
			refresh,
			openTask,
			profileLabel
		};
	}
});
</script>

<style scoped>
.tw-calendar {
	width: 100%;
	max-width: none;
	margin: 0 auto;
	padding: 0 28px 28px;
}

.tw-calendar__toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 12px;
}

.tw-calendar__nav,
.tw-calendar__actions {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.tw-calendar__period {
	font-size: 15px;
	font-weight: 600;
	color: var(--tw-text);
	margin-left: 4px;
	white-space: nowrap;
}

.tw-calendar__layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(320px, 18vw);
	gap: 18px;
	align-items: start;
}

.tw-calendar__grid {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	border: 1px solid var(--tw-border);
	border-radius: 8px;
	overflow: hidden;
	background: var(--tw-surface);
}

.tw-calendar__grid--week {
	grid-auto-rows: minmax(0, auto);
}

.tw-calendar__weekday {
	padding: 10px 12px;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	color: var(--tw-text-muted);
	background: var(--tw-surface);
	border-right: 1px solid var(--tw-border);
}

.tw-calendar__weekday:nth-child(7) {
	border-right: 0;
}

.tw-calendar__day {
	position: relative;
	display: flex;
	flex-direction: column;
	min-height: clamp(118px, calc((100vh - 265px) / 6), 156px);
	padding: 10px;
	text-align: left;
	border: 0;
	border-top: 1px solid var(--tw-border);
	border-right: 1px solid var(--tw-border);
	background: var(--tw-surface);
	color: var(--tw-text);
	cursor: pointer;
	overflow: hidden;
}

.tw-calendar__day--week {
	min-height: clamp(260px, calc(100vh - 265px), 560px);
}

.tw-calendar__day:nth-child(7n) {
	border-right: 0;
}

.tw-calendar__day:hover,
.tw-calendar__day:focus-visible {
	background: var(--tw-surface-hover);
	outline: none;
}

.tw-calendar__day--outside {
	background: var(--tw-bg);
	color: var(--tw-text-faint);
}

.tw-calendar__day--selected {
	box-shadow: inset 0 0 0 2px var(--tw-accent);
	z-index: 1;
}

.tw-calendar__date {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 999px;
	font-size: 12px;
	font-weight: 600;
	margin-bottom: 7px;
}

.tw-calendar__day--today .tw-calendar__date {
	background: var(--tw-st-today);
	color: white;
}

.tw-calendar__items {
	display: flex;
	flex-direction: column;
	gap: 5px;
	min-width: 0;
}

.tw-calendar__pill {
	display: block;
	min-height: 22px;
	padding: 3px 7px;
	border-radius: 5px;
	background: var(--tw-accent-soft);
	color: var(--tw-accent);
	font-size: 12px;
	line-height: 16px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tw-calendar__pill--timed {
	background: var(--tw-st-today-soft);
	color: var(--tw-st-today);
}

.tw-calendar__pill-time {
	font-weight: 700;
	margin-right: 4px;
}

.tw-calendar__more {
	font-size: 12px;
	color: var(--tw-text-muted);
	padding-left: 2px;
}

.tw-calendar__agenda {
	border: 1px solid var(--tw-border);
	border-radius: 8px;
	background: var(--tw-surface);
	overflow: auto;
	position: sticky;
	top: 72px;
	max-height: calc(100vh - 96px);
}

.tw-calendar__agenda-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 18px;
	border-bottom: 1px solid var(--tw-border);
	background: var(--tw-surface);
}

.tw-calendar__agenda-label {
	font-size: 15px;
	font-weight: 600;
	color: var(--tw-text);
}

.tw-calendar__agenda-count {
	font-size: 12px;
	color: var(--tw-text-muted);
	margin-top: 2px;
}

.tw-calendar__agenda-list {
	display: flex;
	flex-direction: column;
}

.tw-calendar__agenda-item {
	display: grid;
	grid-template-columns: 64px minmax(0, 1fr);
	gap: 12px;
	padding: 14px 16px;
	border: 0;
	border-bottom: 1px solid var(--tw-border);
	background: transparent;
	color: var(--tw-text);
	text-align: left;
	cursor: pointer;
}

.tw-calendar__agenda-item:hover,
.tw-calendar__agenda-item:focus-visible {
	background: var(--tw-surface-hover);
	outline: none;
}

.tw-calendar__agenda-time {
	font-size: 11px;
	font-weight: 600;
	color: var(--tw-text-muted);
	padding-top: 1px;
}

.tw-calendar__agenda-main {
	min-width: 0;
}

.tw-calendar__agenda-title {
	display: block;
	font-size: 14px;
	font-weight: 600;
	color: var(--tw-text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tw-calendar__agenda-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 4px;
	font-size: 11px;
	color: var(--tw-text-muted);
}

.tw-calendar__empty {
	padding: 28px 16px;
	text-align: center;
	color: var(--tw-text-muted);
	font-size: 13px;
}

@media (max-width: 960px) {
	.tw-calendar__toolbar,
	.tw-calendar__actions {
		align-items: stretch;
		flex-direction: column;
	}

	.tw-calendar__nav {
		width: 100%;
	}

	.tw-calendar__period {
		margin-left: auto;
	}

	.tw-calendar__mode,
	.tw-calendar__scope {
		width: 100%;
	}

	.tw-calendar__layout {
		grid-template-columns: 1fr;
	}

	.tw-calendar__agenda {
		position: static;
		max-height: none;
	}

	.tw-calendar__day {
		min-height: 92px;
		padding: 6px;
	}

	.tw-calendar__day--week {
		min-height: 150px;
	}

	.tw-calendar__pill {
		font-size: 10px;
		padding: 1px 4px;
	}
}

@media (max-width: 640px) {
	.tw-calendar {
		padding: 0 12px 20px;
	}

	.tw-calendar__weekday {
		padding: 7px 4px;
		text-align: center;
	}

	.tw-calendar__day {
		min-height: 74px;
	}

	.tw-calendar__day--week {
		min-height: 112px;
	}

	.tw-calendar__date {
		width: 20px;
		height: 20px;
		font-size: 11px;
	}

}
</style>
