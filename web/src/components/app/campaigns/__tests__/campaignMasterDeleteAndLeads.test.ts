import { describe, it, expect, beforeEach } from "vitest";
import { handleStandaloneRequest } from "@/lib/api/standaloneMock";

describe("Campaign Deletion Master-Only & Campaign Leads Persistence", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("prevents team member from deleting campaigns and allows master to delete", async () => {
        // Setup initial campaign
        const testCamp = {
            id: "cmp_test_delete_1",
            name: "Campaign To Delete",
            status: "draft",
            total_leads: 5,
        };
        localStorage.setItem("tbm_core_data_v5_campaigns", JSON.stringify([testCamp]));

        // 1. Team Member attempt to delete
        localStorage.setItem("tbm_core_data_v5_current_user", JSON.stringify({
            id: "usr_team_1",
            email: "team@company.com",
            role: "TEAM_MEMBER",
            is_admin: false,
        }));

        const teamMemberDeleteRes = await handleStandaloneRequest({
            method: "DELETE",
            url: "/campaigns/cmp_test_delete_1",
        });

        expect(teamMemberDeleteRes.status).toBe(403);
        expect(teamMemberDeleteRes.data).toEqual({ error: "Only master can delete campaigns." });

        // Campaign still exists
        const campsStill = JSON.parse(localStorage.getItem("tbm_core_data_v5_campaigns") || "[]");
        expect(campsStill.some((c: any) => c.id === "cmp_test_delete_1")).toBe(true);

        // 2. Master attempt to delete
        localStorage.setItem("tbm_core_data_v5_current_user", JSON.stringify({
            id: "usr_master_1",
            email: "owner@company.com",
            role: "MASTER",
            is_admin: true,
        }));

        const masterDeleteRes = await handleStandaloneRequest({
            method: "DELETE",
            url: "/campaigns/cmp_test_delete_1",
        });

        expect(masterDeleteRes.status).toBe(200);
        expect(masterDeleteRes.data.success).toBe(true);
        expect(masterDeleteRes.data.deleted_id).toBe("cmp_test_delete_1");

        // Campaign successfully removed from storage
        const campsAfter = JSON.parse(localStorage.getItem("tbm_core_data_v5_campaigns") || "[]");
        expect(campsAfter.some((c: any) => c.id === "cmp_test_delete_1")).toBe(false);
    });

    it("securely stores unique contacts in contacts list and displays them in campaign leads", async () => {
        // Create a new campaign
        const newCampRes = await handleStandaloneRequest({
            method: "POST",
            url: "/campaigns",
            data: {
                name: "Unique Outbound Campaign",
                daily_limit: 100,
            },
        });
        expect(newCampRes.status).toBe(200);
        const campId = newCampRes.data.id;

        // Add contacts to this campaign (including duplicate email to verify deduplication)
        const contactsToAdd = [
            {
                email: "alex.smith@acme.com",
                first_name: "Alex",
                last_name: "Smith",
                company: "Acme Corp",
                role: "VP Marketing",
                campaigns: [campId],
            },
            {
                email: "sarah.jones@globex.com",
                first_name: "Sarah",
                last_name: "Jones",
                company: "Globex Inc",
                role: "Director of Sales",
                campaigns: [campId],
            },
            // Duplicate email with updated title
            {
                email: "alex.smith@acme.com",
                first_name: "Alex",
                last_name: "Smith",
                company: "Acme Corp",
                role: "CMO",
                campaigns: [campId],
            },
        ];

        const addRes = await handleStandaloneRequest({
            method: "POST",
            url: "/contacts",
            data: contactsToAdd,
        });
        expect(addRes.status).toBe(200);

        // Verify global contacts list: Alex Smith must appear only once (deduplicated)
        const globalContactsRes = await handleStandaloneRequest({
            method: "GET",
            url: "/contacts",
        });
        const acmeContacts = globalContactsRes.data.data.filter((c: any) => c.email === "alex.smith@acme.com");
        expect(acmeContacts.length).toBe(1);
        expect(acmeContacts[0].title).toBe("CMO");

        // Verify campaign leads: /contacts/search with campaign_ids returns both Alex and Sarah!
        const leadsRes = await handleStandaloneRequest({
            method: "POST",
            url: "/contacts/search",
            data: {
                campaign_ids: [campId],
            },
        });
        expect(leadsRes.status).toBe(200);
        expect(leadsRes.data.data.length).toBe(2);

        const leadEmails = leadsRes.data.data.map((l: any) => l.email);
        expect(leadEmails).toContain("alex.smith@acme.com");
        expect(leadEmails).toContain("sarah.jones@globex.com");
        expect(leadsRes.data.data[0].campaign_lead).toBeDefined();
        expect(leadsRes.data.data[0].campaign_lead.status).toBe("pending");

        // Verify campaign total_leads counter was updated
        const updatedCampRes = await handleStandaloneRequest({
            method: "GET",
            url: `/campaigns/${campId}`,
        });
        expect(updatedCampRes.data.total_leads).toBe(2);
    });
});
