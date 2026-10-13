export function asRecord(input: unknown): Record<string, unknown> {
	return input !== null && typeof input === "object" && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {};
}

export function asString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function asBoolean(value: unknown): boolean {
	return value === true || value === "true" || value === 1 || value === "1";
}

export function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

export function asStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(asString).filter(Boolean);
	}
	const text = asString(value);
	if (!text) return [];
	return text
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export function parseJson<T>(value: unknown, fallback: T): T {
	if (typeof value === "object" && value !== null) return value as T;
	const text = asString(value);
	if (!text) return fallback;
	try {
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
}

export function nowIso(): string {
	return new Date().toISOString();
}

export type Row = Record<string, unknown> & { id: string };

/** Flatten a storage query result into plain rows carrying their id. */
export function rows(result: { items: Array<{ id: string; data: unknown }> }): Row[] {
	return result.items.map((item) => ({ ...asRecord(item.data), id: item.id }));
}
