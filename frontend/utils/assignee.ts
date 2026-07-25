export interface ProfileMember {
	email: string;
	name: string;
}

export function memberLabel(member: ProfileMember): string {
	return member.name || member.email.split('@')[0];
}

function normalize(value: string): string {
	return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036F\s]/g, '');
}

export function resolveAssignee(
	token: string | undefined,
	members: ProfileMember[]
): string | undefined {
	if (!token) return undefined;
	const needle = normalize(token);

	const emailMatch = members.find(member => normalize(member.email) === needle);
	if (emailMatch) return emailMatch.email;

	const exactMatches = members.filter(member =>
		normalize(member.email.split('@')[0]) === needle
		|| normalize(memberLabel(member)) === needle
	);
	if (exactMatches.length === 1) return exactMatches[0].email;
	if (exactMatches.length > 1) return undefined;

	const partialMatches = members.filter(member =>
		normalize(member.email).includes(needle)
		|| normalize(member.email.split('@')[0]).includes(needle)
		|| normalize(memberLabel(member)).includes(needle)
	);
	return partialMatches.length === 1 ? partialMatches[0].email : undefined;
}
