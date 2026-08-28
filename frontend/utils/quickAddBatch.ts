const BULLET_PREFIX = /^\s*(?:(?:[-*•])|(?:\d+[.)]))\s+/;

export function quickAddBatchUuid(source?: Uint8Array): string {
	const bytes = source ? new Uint8Array(source) : new Uint8Array(16);
	if (bytes.length !== 16) throw new Error('UUID source must contain exactly 16 bytes');
	if (!source) {
		const cryptoApi = window.crypto;
		if (!cryptoApi?.getRandomValues) throw new Error('Secure random UUID generation is unavailable');
		cryptoApi.getRandomValues(bytes);
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function quickAddPasteLines(value: string): string[] {
	return value
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(line => line.replace(BULLET_PREFIX, '').trim())
		.filter(Boolean);
}

export function composeQuickAddBatch(
	current: string,
	selectionStart: number,
	selectionEnd: number,
	pastedLines: string[]
): string[] {
	const before = current.slice(0, selectionStart).trim();
	const after = current.slice(selectionEnd).trim();
	return pastedLines.map(line => [before, line, after].filter(Boolean).join(' '));
}

export function composeQuickAddSingle(
	current: string,
	selectionStart: number,
	selectionEnd: number,
	pastedLines: string[]
): string {
	const insertion = pastedLines.join('; ');
	return current.slice(0, selectionStart) + insertion + current.slice(selectionEnd);
}
