import moment from 'moment';
import { Task } from 'taskwarrior-lib';

export type CalendarTaskSource = 'scheduled' | 'due';

export interface CalendarTaskItem {
	task: Task;
	source: CalendarTaskSource;
	start: moment.Moment;
	allDay: boolean;
}

export function isAllDayTaskDate(value: string | undefined): boolean {
	if (!value) return false;
	const parsed = moment(value);
	if (!parsed.isValid()) return false;
	if (parsed.hour() === 0 && parsed.minute() === 0 && parsed.second() === 0) return true;
	const utc = parsed.clone().utc();
	return utc.hour() === 0 && utc.minute() === 0 && utc.second() === 0;
}

function parseTaskMoment(value: string | undefined): moment.Moment | null {
	if (!value) return null;
	const parsed = moment(value);
	return parsed.isValid() ? parsed : null;
}

export function calendarTaskItem(task: Task): CalendarTaskItem | null {
	if (task.status !== 'pending') return null;
	const scheduled = parseTaskMoment(task.scheduled);
	if (scheduled) {
		return {
			task,
			source: 'scheduled',
			start: scheduled,
			allDay: isAllDayTaskDate(task.scheduled)
		};
	}
	const due = parseTaskMoment(task.due);
	if (!due) return null;
	return {
		task,
		source: 'due',
		start: due,
		allDay: isAllDayTaskDate(task.due)
	};
}

export function calendarTaskItems(tasks: Task[]): CalendarTaskItem[] {
	return tasks
		.map(calendarTaskItem)
		.filter((item): item is CalendarTaskItem => Boolean(item))
		.sort((a, b) => {
			const day = a.start.valueOf() - b.start.valueOf();
			if (day !== 0) return day;
			if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
			return (a.task.description || '').localeCompare(b.task.description || '');
		});
}
