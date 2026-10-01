import type Token from "../api/models/auth/Token";
import { TOKEN_KEY } from "../information";
import reviveDates from "./reviveDates";

export default function getToken(): Token | null {
    const raw = localStorage.getItem(TOKEN_KEY)
    // No fabricated default: an unauthenticated visitor must read as signed
    // out so the app shell guard can bounce them to /auth/login instead of
    // running the whole app on a made-up session.
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw)
        return reviveDates(parsed)
    } catch {
        return null
    }
}
