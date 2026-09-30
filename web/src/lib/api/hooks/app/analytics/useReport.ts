import { useQuery } from "@tanstack/react-query";
import getReport from "@/lib/api/client/app/analytics/getReport";

export default function useReport() {
    return useQuery({
        queryKey: ["analytics", "report"],
        queryFn: () => getReport(),
        staleTime: 60_000,
    })
}
