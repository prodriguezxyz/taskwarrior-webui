import { TaskwarriorLib } from 'taskwarrior-lib';

declare module 'koa' {
	interface DefaultState {
		taskwarrior: TaskwarriorLib;
		profileName: string;
	}
}
