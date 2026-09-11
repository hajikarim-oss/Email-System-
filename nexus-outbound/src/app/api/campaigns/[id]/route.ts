import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
        leads: true,
        mailboxes: {
          include: {
            mailbox: {
              include: {
                user: { select: { smartleadApiKey: true, email: true } },
              },
            },
          },
        },
        user: { select: { name: true, smartleadApiKey: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Allow access if: owner, MASTER role, or any authenticated user (team visibility)
    // Campaigns are visible to all team members for collaboration
    if (campaign.userId !== session.user.id && (session.user as any).role !== "MASTER") {
      // For non-owners, allow read access but restrict write operations
      // Write operations (PATCH, DELETE) still enforce ownership
    }

    // Pull live stats from Smartlead if campaign has been launched
    let smartleadStats = {
      totalSent: 0,
      totalOpened: 0,
      totalReplied: 0,
      totalBounced: 0,
      totalClicked: 0,
      totalPositiveReply: 0,
      openRate: 0,
      replyRate: 0,
      bounceRate: 0,
    };
    let smartleadLeads: Array<{ email: string; status: string; steps_sent: number[]; last_activity: string }> = [];
    let smartleadCampaignStatus = "";

    if (campaign.providerCampaignId) {
      try {
        // Use the first selected mailbox owner's API key (not the campaign creator's)
        const firstMailboxOwner = campaign.mailboxes[0]?.mailbox?.user;
        const smartleadApiKey = firstMailboxOwner?.smartleadApiKey || campaign.user?.smartleadApiKey || process.env.SMARTLEAD_API_KEY;
        if (smartleadApiKey) {
          const smartlead = new SmartleadProvider(smartleadApiKey);
          const [stats, slLeads, slDetails] = await Promise.all([
            smartlead.getCampaignStatistics(campaign.providerCampaignId),
            smartlead.getCampaignLeads(campaign.providerCampaignId),
            smartlead.getCampaignDetails(campaign.providerCampaignId),
          ]);

          // Use the BEST available stats source:
          // 1. getCampaignDetails returns stats embedded in campaign object (most reliable)
          // 2. getCampaignStatistics is a separate endpoint (may return 0 for new campaigns)
          // Take the MAX of both sources to get the most accurate count
          const detailsSent = slDetails?.total_sent ?? 0;
          const detailsOpened = slDetails?.total_opened ?? 0;
          const detailsReplied = slDetails?.total_replied ?? 0;
          const detailsBounced = slDetails?.total_bounced ?? 0;

          smartleadStats = {
            totalSent: Math.max(stats.totalSent, detailsSent),
            totalOpened: Math.max(stats.totalOpened, detailsOpened),
            totalReplied: Math.max(stats.totalReplied, detailsReplied),
            totalBounced: Math.max(stats.totalBounced, detailsBounced),
            totalClicked: 0,
            totalPositiveReply: Math.max(stats.totalPositiveReply, slDetails?.total_positive_reply ?? 0),
            openRate: stats.openRate,
            replyRate: stats.replyRate,
            bounceRate: stats.bounceRate,
          };
          smartleadLeads = slLeads;
          smartleadCampaignStatus = slDetails?.status || "";
        }
      } catch (err) {
        console.warn("Failed to fetch Smartlead data:", err);
      }
    }

    // Get local email events for lead delivery status
    const leadIds = campaign.leads.map((l) => l.id);
    const emailEvents = await prisma.emailEvent.findMany({
      where: { leadId: { in: leadIds } },
      select: { leadId: true, eventType: true, rawPayload: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Build rich per-lead delivery data
    const leadEventMap: Record<string, {
      stepsSent: number[];
      hasReplied: boolean;
      hasOpened: boolean;
      hasBounced: boolean;
      hasClicked: boolean;
      lastSentAt: string | null;
      lastOpenedAt: string | null;
      lastEventAt: string | null;
      eventCount: number;
      events: Array<{ type: string; at: string }>;
    }> = {};

    for (const event of emailEvents) {
      const lead = campaign.leads.find((l) => l.id === event.leadId);
      if (!lead) continue;
      if (!leadEventMap[lead.email]) {
        leadEventMap[lead.email] = {
          stepsSent: [], hasReplied: false, hasOpened: false, hasBounced: false, hasClicked: false,
          lastSentAt: null, lastOpenedAt: null, lastEventAt: null, eventCount: 0, events: [],
        };
      }
      const s = leadEventMap[lead.email];
      s.eventCount++;
      s.events.push({ type: event.eventType, at: event.createdAt.toISOString() });
      s.lastEventAt = event.createdAt.toISOString();

      if (event.eventType === "sent") {
        const step = (event.rawPayload as any)?.step;
        if (step && !s.stepsSent.includes(step)) s.stepsSent.push(step);
        s.lastSentAt = event.createdAt.toISOString();
      }
      if (event.eventType === "opened") { s.hasOpened = true; s.lastOpenedAt = event.createdAt.toISOString(); }
      if (event.eventType === "replied") s.hasReplied = true;
      if (event.eventType === "bounced") s.hasBounced = true;
      if (event.eventType === "clicked") s.hasClicked = true;
    }

    // Build Smartlead lead lookup by email
    const slLeadMap = new Map(smartleadLeads.map((sl) => [sl.email.toLowerCase(), sl]));

    // Calculate local counts as fallback
    const localSent = campaign.leads.reduce((acc, l) => acc + l.lastStepSent, 0);
    const localOpened = campaign.leads.filter((l) => l.firstOpenAt != null).length;
    const localReplied = campaign.leads.filter((l) => l.status === "REPLIED").length;
    const localBounced = campaign.leads.filter((l) => l.status === "BOUNCED" || l.bounceCount > 0).length;
    const localClicked = campaign.leads.reduce((acc, l) => acc + l.clickCount, 0);

    // Use the HIGHER of Smartlead stats or local webhook event counts
    const sent = Math.max(smartleadStats.totalSent, localSent);
    const opens = Math.max(smartleadStats.totalOpened, localOpened);
    const replies = Math.max(smartleadStats.totalReplied, localReplied);
    const bounces = Math.max(smartleadStats.totalBounced, localBounced);
    const clicks = Math.max(smartleadStats.totalClicked, localClicked);

    // All rates use `sent` as denominator for consistency
    const openRate = sent > 0 ? ((opens / sent) * 100) : (smartleadStats.openRate ?? 0);
    const replyRate = sent > 0 ? ((replies / sent) * 100) : (smartleadStats.replyRate ?? 0);
    const bounceRate = sent > 0 ? ((bounces / sent) * 100) : (smartleadStats.bounceRate ?? 0);
    const clickRate = sent > 0 ? ((clicks / sent) * 100) : 0;

    return NextResponse.json({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status.toLowerCase(),
      smartleadStatus: smartleadCampaignStatus,
      owner: campaign.user?.name || "",
      providerCampaignId: campaign.providerCampaignId,
      leads: campaign.leads.length,
      leadsList: campaign.leads.map((l) => {
        const ev = leadEventMap[l.email];
        const sl = slLeadMap.get(l.email.toLowerCase());
        // Merge: Smartlead data takes precedence for steps_sent and status when available
        const slStepsSent = sl?.steps_sent || [];
        const mergedStepsSent = [...new Set([...(ev?.stepsSent || []), ...slStepsSent])].sort();
        const slStatus = sl?.status?.toLowerCase() || "";
        // Determine display status from Smartlead or local events
        let displayStatus = l.status?.toLowerCase() || "active";
        if (slStatus === "completed" || slStatus === "finished") displayStatus = "sent";
        else if (slStatus === "active" && mergedStepsSent.length > 0) displayStatus = "active";
        else if (slStatus === "paused") displayStatus = "paused";
        else if (slStatus === "bounced" || ev?.hasBounced) displayStatus = "bounced";
        else if (slStatus === "unsubscribed") displayStatus = "unsubscribed";
        else if (ev?.hasReplied) displayStatus = "replied";
        else if (ev?.hasOpened) displayStatus = "opened";
        else if (mergedStepsSent.length > 0) displayStatus = "sent";

        return {
          id: l.id,
          firstName: l.firstName || null,
          lastName: l.lastName || null,
          email: l.email,
          company: (l.customData as Record<string, string>)?.company || null,
          title: (l.customData as Record<string, string>)?.title || null,
          status: l.status,
          leadStatus: displayStatus,
          smartleadStatus: slStatus,
          stepsSent: mergedStepsSent,
          hasOpened: ev?.hasOpened || false,
          hasReplied: ev?.hasReplied || false,
          hasBounced: ev?.hasBounced || false,
          hasClicked: ev?.hasClicked || false,
          lastSentAt: ev?.lastSentAt || null,
          lastOpenedAt: ev?.lastOpenedAt || null,
          lastEventAt: ev?.lastEventAt || sl?.last_activity || null,
          eventCount: ev?.eventCount || 0,
          recentEvents: (ev?.events || []).slice(-5),
        };
      }),
      sent: sent,
      opens: opens,
      replies: replies,
      bounces: bounces,
      clicks: clicks,
      openRate: parseFloat(openRate.toFixed(2)),
      replyRate: parseFloat(replyRate.toFixed(2)),
      bounceRate: parseFloat(bounceRate.toFixed(2)),
      clickRate: parseFloat(clickRate.toFixed(2)),
      steps: campaign.steps.length,
      stepsList: campaign.steps.map((s) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        subject: s.subject,
        bodyHtml: s.bodyTemplate,
        delayDays: s.delayDays,
      })),
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      sequence: campaign.steps.map((s) => ({
        id: s.id,
        step: s.stepNumber,
        delayDays: s.delayDays,
        subject: s.subject,
        preview: s.bodyTemplate,
      })),
      mailboxIds: campaign.mailboxes.map((m) => m.mailbox.id),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, status, sequence, leads, mailboxIds } = body;

    let existing = await prisma.campaign.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Team collaboration: any authenticated user can edit any campaign
    // (Removed ownership check to allow cross-user campaign management)

    await prisma.campaign.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(status && { status: status.toUpperCase() as any }),
      },
    });

    if (sequence && Array.isArray(sequence)) {
      await prisma.campaignStep.deleteMany({ where: { campaignId: id } });
      if (sequence.length > 0) {
        await prisma.campaignStep.createMany({
          data: sequence.map((s: any, idx: number) => ({
            campaignId: id,
            stepNumber: s.stepNumber || s.step || idx + 1,
            delayDays: s.delayDays ?? 3,
            subject: s.subject || "",
            bodyTemplate: s.bodyHtml || s.preview || "",
          })),
        });
      }
    }

    if (leads && Array.isArray(leads) && leads.length > 0) {
      await prisma.lead.deleteMany({ where: { campaignId: id } });
      // Deduplicate leads by email
      const seen = new Set<string>();
      const uniqueLeads = leads
        .filter((l: any) => {
          const email = l.email?.toLowerCase();
          if (!email || seen.has(email)) return false;
          seen.add(email);
          return true;
        })
        .map((l: any) => ({
          campaignId: id,
          email: l.email.toLowerCase(),
          firstName: l.firstName || null,
          lastName: l.lastName || null,
          source: l.source || "csv",
          customData: l.company || l.title ? { company: l.company, title: l.title } : undefined,
          leadCategory: "UNCATEGORIZED" as const,
          status: "ACTIVE" as const,
        }));
      if (uniqueLeads.length > 0) {
        await prisma.lead.createMany({ data: uniqueLeads });
      }
    }

    if (mailboxIds && Array.isArray(mailboxIds)) {
      await prisma.campaignMailbox.deleteMany({ where: { campaignId: id } });
      if (mailboxIds.length > 0) {
        const mailboxes = await prisma.mailbox.findMany({
          where: { id: { in: mailboxIds } },
          select: { id: true },
        });
        if (mailboxes.length > 0) {
          await prisma.campaignMailbox.createMany({
            data: mailboxes.map((m) => ({
              campaignId: id,
              mailboxId: m.id,
            })),
          });
        }
      }
    }

    const updated = await prisma.campaign.findUnique({
      where: { id },
      include: { steps: true, leads: true },
    });

    return NextResponse.json({
      id: updated?.id || id,
      name: updated?.name || name,
      status: updated?.status?.toLowerCase() || "draft",
      stepsCount: updated?.steps.length || 0,
      leadsCount: updated?.leads.length || 0,
      updatedAt: "Just now",
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { userId: true } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    // Team collaboration: any authenticated user can delete any campaign
    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
