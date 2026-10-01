import { useMutation, useQueryClient } from "@tanstack/react-query";
import inviteMember from "@/lib/api/client/app/organizations/inviteMember";

export default function useInviteMember() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: { email: string; password?: string; role_ids?: string[]; role_id?: string }) => inviteMember(data),
        onSuccess: () => {
            // Granting access creates a roster row immediately — refresh both
            // the member list and the (usually empty) invitations list.
            queryClient.invalidateQueries({
                queryKey: ["organizations", "members"],
            });
            queryClient.invalidateQueries({
                queryKey: ["organizations", "invitations"],
            });
        }
    })
}
