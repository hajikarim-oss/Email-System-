import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth-options";
import { SmartleadProvider } from "@/lib/providers/smartlead";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return ALL campaigns across all users so team members can see each other's work
    const campaigns = await prisma.campaign.findMany({
      include: {
        steps: true,
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
        user: { select: { name: true, id: true, smartleadApiKey: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Batch-fetch live Smartlead stats for launched campaigns
    const launchedCampaigns = campaigns.filter((c) => c.providerCampaignId);
    const smartleadStatsMap: Record<string, { totalSent: number; totalOpened: number; totalReplied: number; totalBounced: number }> = {};

    // Try each user's API key for their own campaigns, fall back to env key
    const smartleadApiKey = process.env.SMARTLEAD_API_KEY;

    if (launchedCampaigns.length > 0) {
      await Promise.all(
        launchedCampaigns.map(async (c) => {
          try {
            // Use the first selected mailbox owner's API key (not the campaign creator's)
            const firstMailboxOwner = c.mailboxes[0]?.mailbox?.user;
            const apiKey = firstMailboxOwner?.smartleadApiKey || c.user?.smartleadApiKey || smartleadApiKey;
            if (!apiKey) return;

            const smartlead = new SmartleadProvider(apiKey);
            const stats = await smartlead.getCampaignStatistics(c.providerCampaignId!);
            smartleadStatsMap[c.providerCampaignId!] = {
              totalSent: stats.totalSent,
              totalOpened: stats.totalOpened,
              totalReplied: stats.totalReplied,
              totalBounced: stats.totalBounced,
            };
          } catch {
            // Silently fall back to local counts
          }
        })
      );
    }

    const formatted = campaigns.map((c) => {
      const slStats = c.providerCampaignId ? smartleadStatsMap[c.providerCampaignId] : null;
      return {
        id: c.id,
        name: c.name,
        status: c.status.toLowerCase(),
        owner: c.user?.name || "",
        leadsCount: c.leads.length,
        sent: slStats?.totalSent || c.leads.reduce((acc, l) => acc + l.lastStepSent, 0),
        opens: slStats?.totalOpened || c.leads.filter((l) => l.firstOpenAt != null).length,
        replies: slStats?.totalReplied || c.leads.filter((l) => l.status === "REPLIED").length,
        bounces: slStats?.totalBounced || 0,
        openRate: c.leads.length > 0 ? ((slStats?.totalOpened || c.leads.filter((l) => l.firstOpenAt != null).length) / c.leads.length) * 100 : 0,
        replyRate: c.leads.length > 0 ? ((slStats?.totalReplied || c.leads.filter((l) => l.status === "REPLIED").length) / c.leads.length) * 100 : 0,
        steps: c.steps.length,
        updatedAt: c.updatedAt.toLocaleDateString(),
        leads: c.leads.map((l) => ({
          id: l.id,
          email: l.email,
          name: `${l.firstName || ""} ${l.lastName || ""}`.trim() || l.email,
          firstName: l.firstName || "",
          lastName: l.lastName || "",
          company: (l.customData as any)?.company || "",
          title: (l.customData as any)?.title || "",
          phone: (l.customData as any)?.phone || "",
          step: l.lastStepSent ? `Step ${l.lastStepSent}` : "Step 1",
          status: l.status.toLowerCase(),
          sentiment: l.aiSentiment ? l.aiSentiment.toLowerCase() : "neutral",
          lastActivity: l.updatedAt.toLocaleDateString(),
        })),
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const loggedUserId = session?.user?.id;
    const userRole = (session?.user as any)?.role;

    if (!loggedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, mailboxIds = [], sequence = [], leads = [], activeUserId } = body;

    // MASTER users can create campaigns on behalf of team members
    let userId = loggedUserId;
    if (activeUserId && userRole === "MASTER" && activeUserId !== loggedUserId) {
      // Verify the target user exists
      const targetUser = await prisma.user.findUnique({ where: { id: activeUserId } });
      if (targetUser) {
        userId = activeUserId;
      }
    }

    // Check for duplicate campaign name by this user
    const existing = await prisma.campaign.findFirst({
      where: { userId, name: name || "New Campaign" },
    });
    if (existing) {
      return NextResponse.json({ id: existing.id, name: existing.name, duplicate: true });
    }

    let campaign;
    try {
      campaign = await prisma.campaign.create({
        data: {
          name: name || "New Campaign",
          userId,
          status: "DRAFT",
          steps: {
            create: sequence.map((s: any, idx: number) => ({
              stepNumber: s.stepNumber || s.step || idx + 1,
              delayDays: s.delayDays ?? 3,
              subject: s.subject || "",
              bodyTemplate: s.bodyHtml || s.preview || "",
            })),
          },
          ...(leads.length > 0 && {
            leads: {
              create: (() => {
                // Deduplicate leads by email within this campaign
                const seen = new Set<string>();
                return leads
                  .filter((l: any) => {
                    const email = l.email?.toLowerCase();
                    if (!email || seen.has(email)) return false;
                    seen.add(email);
                    return true;
                  })
                  .map((l: any) => ({
                    email: l.email.toLowerCase(),
                    firstName: l.firstName || null,
                    lastName: l.lastName || null,
                    source: l.source || "csv",
                    customData: l.company || l.title ? { company: l.company, title: l.title } : undefined,
                    leadCategory: "UNCATEGORIZED" as const,
                    status: "ACTIVE" as const,
                  }));
              })(),
            },
          }),
          ...(mailboxIds.length > 0 && {
            mailboxes: {
              create: mailboxIds.map((id: string) => ({ mailboxId: id })),
            },
          }),
        },
        include: { steps: true, leads: true, mailboxes: true },
      });
    } catch (err: any) {
      // Handle unique constraint violation (race condition)
      if (err?.code === "P2002") {
        const duplicate = await prisma.campaign.findFirst({
          where: { userId, name: name || "New Campaign" },
        });
        if (duplicate) {
          return NextResponse.json({ id: duplicate.id, name: duplicate.name, duplicate: true });
        }
      }
      throw err;
    }

    const campaignOwner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

    return NextResponse.json({
      id: campaign.id,
      name: campaign.name,
      status: "draft",
      owner: campaignOwner?.name || "User",
      leads: campaign.leads.length,
      sent: 0,
      opens: 0,
      replies: 0,
      openRate: 0,
      replyRate: 0,
      steps: campaign.steps.length,
      updatedAt: "Just now",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
