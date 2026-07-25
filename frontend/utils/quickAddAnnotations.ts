export interface QuickAddAnnotation {
	entry: string;
	description: string;
}

export function buildQuickAddAnnotations(
	value: string,
	entry?: string
): QuickAddAnnotation[] {
	const description = value.trim();
	if (!description) return [];
	return [{
		entry: entry ?? new Date().toISOString(),
		description
	}];
}
