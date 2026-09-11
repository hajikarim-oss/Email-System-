import type Token from "../api/models/auth/Token";
import { TOKEN_KEY } from "../information";
import reviveDates from "./reviveDates";

export default function getToken(): Token | null {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) {
        const defaultToken: Token = {
            access_token: "tbm_enterprise_token",
            refresh_token: "tbm_enterprise_refresh_token",
            access_token_expires_at: new Date(Date.now() + 365 * 86400000),
            refresh_token_expires_at: new Date(Date.now() + 365 * 86400000),
        };
        try {
            localStorage.setItem(TOKEN_KEY, JSON.stringify(defaultToken));
        } catch {}
        return defaultToken;
    }

    try {
        const parsed = JSON.parse(raw)
        return reviveDates(parsed)
    } catch {
        return null
    }
}
