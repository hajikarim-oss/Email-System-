export default function reviveDates<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj

    if (typeof obj === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(obj)) {
        const iso = obj.trim().replace(" ", "T");
        const utcIso = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(iso) ? iso : `${iso}Z`;
        return new Date(utcIso) as unknown as T
    }

    if (Array.isArray(obj)) {
        return obj.map((v) => reviveDates(v)) as unknown as T
    }

    if (typeof obj === "object") {
        const entries = Object.entries(obj as Record<string, unknown>).map(
            ([key, value]) => [key, reviveDates(value)]
        )
        return Object.fromEntries(entries) as T
    }

    return obj
}
