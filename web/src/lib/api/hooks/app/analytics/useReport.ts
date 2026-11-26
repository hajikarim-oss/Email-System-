import { keepPreviousData, useQuery } from "@tanstack/react-query";
import getReport from "@/lib/api/client/app/analytics/getReport";
import type SystemReport from "@/lib/api/models/app/analytics/SystemReport";

const lsReportKey = (member = "all") => `tbm_report_v1_${member}`;

export default function useReport(member_id?: string) {
    const key = lsReportKey(member_id ?? "all");
    const initialData = ((): SystemReport | undefined => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw) as SystemReport;
        } catch {}
        return undefined;
    })();

    return useQuery({
        queryKey: ["analytics", "report", member_id ?? "all"],
        queryFn: async () => {
            const data = await getReport(member_id);
            try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
            return data;
        },
        initialData,
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        placeholderData: keepPreviousData,
        retry: 2,
    });
}
