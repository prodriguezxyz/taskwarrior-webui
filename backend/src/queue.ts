// Per-profile async mutex. taskwarrior-lib shells out to `task` synchronously
// against the profile's TASKDATA dir, so concurrent writes on the same profile
// can corrupt the data files. Profiles are independent on disk, so the lock
// scope is per profile name — different profiles still run in parallel.
type Job<T> = () => Promise<T> | T;

class Mutex {
	private chain: Promise<unknown> = Promise.resolve();

	run<T>(job: Job<T>): Promise<T> {
		const next = this.chain.then(() => job());
		// Detach errors from the chain so a rejected job doesn't poison
		// the next one waiting in line.
		this.chain = next.catch(() => undefined);
		return next;
	}
}

const locks = new Map<string, Mutex>();

export function withProfileLock<T>(profile: string, job: Job<T>): Promise<T> {
	let m = locks.get(profile);
	if (!m) {
		m = new Mutex();
		locks.set(profile, m);
	}
	return m.run(job);
}
