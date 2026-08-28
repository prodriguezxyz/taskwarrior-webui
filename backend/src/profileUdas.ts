import * as fs from 'fs';
import * as path from 'path';

const PROFILE_UDA_SETTINGS: ReadonlyArray<readonly [string, string]> = [
	['uda.assignee.type', 'string'],
	['uda.assignee.label', 'Assigned to'],
	['uda.twui_reminder.type', 'date'],
	['uda.twui_reminder.label', 'Reminder'],
	['uda.twui_duration.type', 'duration'],
	['uda.twui_duration.label', 'Duration']
];

export function renderProfileUdas(content: string): string {
	let lines = content.replace(/\r\n?/g, '\n').split('\n');
	for (const [key] of PROFILE_UDA_SETTINGS) {
		const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const existing = new RegExp(`^\\s*${escaped}\\s*=`);
		lines = lines.filter(line => !existing.test(line));
	}
	while (lines.length && !lines[lines.length - 1]) lines.pop();
	for (const [key, value] of PROFILE_UDA_SETTINGS) lines.push(`${key}=${value}`);
	return `${lines.join('\n')}\n`;
}

function syncDirectory(directory: string): void {
	let fd: number | undefined;
	try {
		fd = fs.openSync(directory, 'r');
		fs.fsyncSync(fd);
	}
	catch (_) {
		// Some filesystems do not allow fsync on directories. The file itself was
		// already synced, so this is a durability enhancement rather than a blocker.
	}
	finally {
		if (fd !== undefined) fs.closeSync(fd);
	}
}

function syncFile(file: string): void {
	const fd = fs.openSync(file, 'r');
	try {
		fs.fsyncSync(fd);
	}
	finally {
		fs.closeSync(fd);
	}
}

export function writeProfileUdas(taskrc: string, content: string): void {
	const target = fs.existsSync(taskrc) ? fs.realpathSync(taskrc) : taskrc;
	const directory = path.dirname(target);
	fs.mkdirSync(directory, { recursive: true });
	const stat = fs.existsSync(target) ? fs.statSync(target) : undefined;
	const temporary = path.join(directory, `.${path.basename(target)}.twui-${process.pid}-${Date.now()}`);
	let fd: number | undefined;
	try {
		fd = fs.openSync(temporary, 'wx', stat?.mode ?? 0o600);
		fs.writeFileSync(fd, content, 'utf8');
		fs.fsyncSync(fd);
		fs.closeSync(fd);
		fd = undefined;
		if (stat) {
			fs.chmodSync(temporary, stat.mode);
			try {
				fs.chownSync(temporary, stat.uid, stat.gid);
			}
			catch (_) {
				// Ownership is best-effort for unprivileged containers.
			}
		}
		try {
			fs.renameSync(temporary, target);
		}
		catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== 'EBUSY' && code !== 'EXDEV') throw err;
			// Bind-mounted files cannot be replaced with rename. Copying the fully
			// synced temporary file preserves the mounted inode and its ownership.
			fs.copyFileSync(temporary, target);
			syncFile(target);
			fs.unlinkSync(temporary);
		}
		syncDirectory(directory);
	}
	finally {
		if (fd !== undefined) fs.closeSync(fd);
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
	}
}
