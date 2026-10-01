// Multi-account Smartlead API credentials (supporting up to 10 accounts).
// Resolves from SMARTLEAD_API_KEY_1..10, with backward compatibility for
// SMARTLEAD_API_KEY (account 1) and SMARTLEAD_SECONDARY_API_KEY (account 2).

import fs from "node:fs";
import path from "node:path";

const STALE_PREFIX = "412be3a1";

function readEnvFile(file: string, name: string): string | null {
    try {
        const content = fs.readFileSync(file, "utf8");
        const match = content.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, "m"));
        if (!match) return null;
        return match[1].trim().replace(/^["']|["']$/g, "") || null;
    } catch {
        return null;
    }
}

export function resolveKey(name: string): string {
    const fromProcess = process.env[name]?.trim();
    if (fromProcess && !fromProcess.startsWith(STALE_PREFIX)) return fromProcess;

    const roots = [process.cwd(), path.resolve(process.cwd(), "..")];
    for (const root of roots) {
        for (const file of [".env.local", ".env"]) {
            const value = readEnvFile(path.join(root, file), name);
            if (value && !value.startsWith(STALE_PREFIX)) return value;
        }
    }
    return "";
}

/** Account 1 / Primary shared sending account */
export function smartleadPrimary(): string {
    return resolveKey("SMARTLEAD_API_KEY_1") || resolveKey("SMARTLEAD_API_KEY");
}

/** Account 2 / Secondary sending account */
export function smartleadSecondary(): string {
    return resolveKey("SMARTLEAD_API_KEY_2") || resolveKey("SMARTLEAD_SECONDARY_API_KEY");
}

/** Get key for specific account index (1..10) */
export function smartleadKeyByIndex(index: number): string {
    if (index === 1) return smartleadPrimary();
    if (index === 2) return smartleadSecondary();
    return resolveKey(`SMARTLEAD_API_KEY_${index}`);
}

/** Retrieve all configured Smartlead account keys (up to 10) */
export function getAllSmartleadKeys(): { index: number; key: string }[] {
    const accounts: { index: number; key: string }[] = [];
    for (let i = 1; i <= 10; i++) {
        const key = smartleadKeyByIndex(i);
        if (key && !key.startsWith(STALE_PREFIX)) {
            accounts.push({ index: i, key });
        }
    }
    return accounts;
}

/**
 * Route sender to appropriate Smartlead account key.
 * Explicit key always takes precedence.
 */
export function smartleadKeyForSender(sender: string, explicit?: string | null): string {
    if (explicit && !explicit.startsWith(STALE_PREFIX)) return explicit;
    const lower = (sender || "").toLowerCase();
    
    // Check known account mappings
    if (lower.includes("preeti")) {
        const sec = smartleadSecondary();
        if (sec) return sec;
    }
    
    // Check numbered account matches (e.g. sender matching account 3..10)
    for (let i = 1; i <= 10; i++) {
        const key = smartleadKeyByIndex(i);
        if (key && (lower.includes(`acc${i}`) || lower.includes(`pool${i}`))) {
            return key;
        }
    }

    return smartleadPrimary() || smartleadSecondary();
}
