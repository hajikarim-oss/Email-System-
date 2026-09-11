"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function fetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorData.error || "API error");
  }
  return res.json();
}

// Health check
export function useHealthCheck() {
  return useQuery<{ status: string }>({
    queryKey: ["healthCheck"],
    queryFn: () => fetcher("/api/healthz"),
    refetchInterval: 30000,
  });
}

// Dashboard Overview
export function useGetDashboardOverview() {
  return useQuery<any>({
    queryKey: ["dashboardOverview"],
    queryFn: () => fetcher("/api/dashboard/overview"),
  });
}

// Dashboard Activity
export function useGetDashboardActivity() {
  return useQuery<any[]>({
    queryKey: ["dashboardActivity"],
    queryFn: () => fetcher("/api/dashboard/activity"),
  });
}

// Campaigns List
export function useGetCampaigns(params?: { status?: string }) {
  const url = params?.status && params.status !== "ALL" ? `/api/campaigns?status=${params.status}` : "/api/campaigns";
  return useQuery<any[]>({
    queryKey: ["campaigns", params],
    queryFn: () => fetcher(url),
  });
}

export const useListCampaigns = useGetCampaigns;

// Campaign Detail
export function useGetCampaign(id: string) {
  return useQuery<any>({
    queryKey: ["campaign", id],
    queryFn: () => fetcher(`/api/campaigns/${id}`),
    enabled: !!id,
  });
}

// Create Campaign
export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { name: string; mailboxIds: string[]; sequence: any[] }>({
    mutationFn: (data) =>
      fetcher("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

// Update Campaign
export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string; data: { name?: string; status?: string; sequence?: any[] } }>({
    mutationFn: ({ id, data }) =>
      fetcher(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
  });
}

// Launch Campaign
export function useLaunchCampaign() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string }>({
    mutationFn: ({ id }) =>
      fetcher(`/api/campaigns/${id}/launch`, {
        method: "POST",
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
  });
}

// Get Leads
export function useGetLeads(params?: { search?: string; category?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.status) searchParams.set("status", params.status);

  const queryStr = searchParams.toString();
  const url = `/api/leads${queryStr ? `?${queryStr}` : ""}`;

  return useQuery<any[]>({
    queryKey: ["leads", params],
    queryFn: () => fetcher(url),
  });
}

// Create Lead
export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { data: { name: string; email: string; company: string; category?: string; source?: string } }>({
    mutationFn: ({ data }) =>
      fetcher("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// Update Lead
export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string; data: { name?: string; company?: string; category?: string; status?: string } }>({
    mutationFn: ({ id, data }) =>
      fetcher(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// Bulk Update Leads
export function useBulkUpdateLeads() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { data: { ids: string[]; category: string } }>({
    mutationFn: ({ data }) =>
      fetcher("/api/leads/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export const useListLeads = useGetLeads;

// Get Mailboxes
export function useGetMailboxes() {
  return useQuery<any[]>({
    queryKey: ["mailboxes"],
    queryFn: () => fetcher("/api/mailboxes"),
  });
}

export const useListMailboxes = useGetMailboxes;

// Update Mailbox Status
export function useUpdateMailboxStatus() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string; data: { status: string; pausedReason?: string } }>({
    mutationFn: ({ id, data }) =>
      fetcher(`/api/mailboxes/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });
}

// Delete Mailbox
export function useDeleteMailbox() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string }>({
    mutationFn: ({ id }) =>
      fetcher(`/api/mailboxes?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });
}

// Get Inbox
export function useGetInbox() {
  return useQuery<any[]>({
    queryKey: ["inbox"],
    queryFn: () => fetcher("/api/inbox"),
  });
}

// Update Draft
export function useUpdateDraft() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string; data: { draft: string } }>({
    mutationFn: ({ id, data }) =>
      fetcher(`/api/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
}

// Send Draft
export function useSendDraft() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string }>({
    mutationFn: ({ id }) =>
      fetcher(`/api/drafts/${id}/send`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
}

// Users & Team Accounts
export function useGetUsers() {
  return useQuery<any[]>({
    queryKey: ["users"],
    queryFn: () => fetcher("/api/users"),
  });
}

export function useAddUser() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { name?: string; email: string; role?: string; smartleadApiKey?: string }>({
    mutationFn: (data) =>
      fetcher("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
  });
}

// Campaign Control (pause/resume/stop)
export function useCampaignControl() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { id: string; action: "pause" | "resume" | "stop" }>({
    mutationFn: ({ id, action }) =>
      fetcher(`/api/campaigns/${id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
  });
}

// Individual Lead Control (stop/resume)
export function useLeadControl() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { campaignId: string; leadId: string; action: "stop" | "resume" }>({
    mutationFn: ({ campaignId, leadId, action }) =>
      fetcher(`/api/campaigns/${campaignId}/leads/${leadId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaignEvents", campaignId] });
    },
  });
}

// Campaign Events Timeline
export function useCampaignEvents(campaignId: string) {
  return useQuery<any>({
    queryKey: ["campaignEvents", campaignId],
    queryFn: () => fetcher(`/api/campaigns/${campaignId}/events?limit=100`),
    enabled: !!campaignId,
    refetchInterval: 15000,
  });
}

// Webhook Test
export function useWebhookTest() {
  return useMutation<any, Error, { eventType?: string; email?: string }>({
    mutationFn: (data) =>
      fetcher("/api/webhooks/smartlead/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

// Webhook Health
export function useWebhookHealth() {
  return useQuery<any>({
    queryKey: ["webhookHealth"],
    queryFn: () => fetcher("/api/webhooks/smartlead/test"),
    refetchInterval: 30000,
  });
}

// Sync campaign from Smartlead
export function useCampaignSync() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, string>({
    mutationFn: (campaignId: string) =>
      fetcher(`/api/campaigns/${campaignId}/sync`, {
        method: "POST",
      }),
    onSuccess: (_data, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
}

