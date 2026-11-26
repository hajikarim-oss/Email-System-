import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Single source of truth for "sent today".
 *
 * The sidebar (30d dashboard), the hero quota card and the capacity tracker
 * (7d / custom dashboard) each hold their own dashboard query, refreshed at
 * different moments, so they could disagree by a send or two. This hook reads
 * every cached dashboard payload for the same member scope and returns the
 * today_sent from the most recently fetched one, so all views always show the
 * exact same number.
 */
export default function useLiveTodaySent(memberId: string = "all"): number | undefined {
    const queryClient = useQueryClient();
    const cache = queryClient.getQueryCache();

    const read = (): number | undefined => {
        let best: { at: number; value: number } | undefined;
        for (const q of cache.findAll({ queryKey: ["analytics", "dashboard"] })) {
            const key = q.queryKey as unknown[];
            if (String(key[5] ?? "all") !== memberId) continue;
            const data = q.state.data as { today_sent?: number } | undefined;
            if (typeof data?.today_sent !== "number") continue;
            const at = q.state.dataUpdatedAt || 0;
            if (!best || at > best.at) best = { at, value: data.today_sent };
        }
        return best?.value;
    };

    return useSyncExternalStore(
        (onChange) => cache.subscribe(onChange),
        read,
        read,
    );
}
