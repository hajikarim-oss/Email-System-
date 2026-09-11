import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action = "simulate" } = body;

    if (action === "simulate") {
      // Simulate email sending and webhook events
      const results = {
        sent: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
      };

      // Get active leads
      const leads = await prisma.lead.findMany({
        where: { status: "ACTIVE" },
        take: 5,
      });

      if (leads.length === 0) {
        return NextResponse.json({ 
          error: "No active leads found. Please seed test data first." 
        }, { status: 400 });
      }

      // Simulate sending emails to each lead
      for (const lead of leads) {
        // Create email event (sent)
        await prisma.emailEvent.create({
          data: {
            leadId: lead.id,
            eventType: "sent",
            providerEventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            rawPayload: {
              lead_email: lead.email,
              subject: "Quick question about your growth",
              status: "sent",
            },
          },
        });
        results.sent++;

        // Simulate some opens (50% chance)
        if (Math.random() > 0.5) {
          await prisma.emailEvent.create({
            data: {
              leadId: lead.id,
              eventType: "opened",
              providerEventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              rawPayload: {
                lead_email: lead.email,
                status: "opened",
              },
            },
          });
          results.opened++;

          // Update lead's open tracking
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              openCount: { increment: 1 },
              firstOpenAt: lead.firstOpenAt || new Date(),
              lastOpenAt: new Date(),
            },
          });
        }

        // Simulate some replies (20% chance)
        if (Math.random() > 0.8) {
          await prisma.emailEvent.create({
            data: {
              leadId: lead.id,
              eventType: "replied",
              providerEventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              rawPayload: {
                lead_email: lead.email,
                reply_text: "Thanks for reaching out! I'd be interested in learning more.",
                status: "replied",
              },
            },
          });
          results.replied++;

          // Update lead status
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "REPLIED", repliedAt: new Date() },
          });
        }

        // Simulate some bounces (10% chance)
        if (Math.random() > 0.9) {
          await prisma.emailEvent.create({
            data: {
              leadId: lead.id,
              eventType: "bounced",
              providerEventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              rawPayload: {
                lead_email: lead.email,
                bounce_type: "soft",
                status: "bounced",
              },
            },
          });
          results.bounced++;

          // Update lead bounce tracking
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              bounceCount: { increment: 1 },
              bounceType: "soft",
            },
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: "Email transaction simulation completed",
        results,
        details: {
          leadsProcessed: leads.length,
          eventsCreated: results.sent + results.opened + results.replied + results.bounced,
        },
      });
    }

    if (action === "status") {
      // Get email event statistics
      const totalEvents = await prisma.emailEvent.count();
      const sentEvents = await prisma.emailEvent.count({ where: { eventType: "sent" } });
      const openedEvents = await prisma.emailEvent.count({ where: { eventType: "opened" } });
      const repliedEvents = await prisma.emailEvent.count({ where: { eventType: "replied" } });
      const bouncedEvents = await prisma.emailEvent.count({ where: { eventType: "bounced" } });

      const totalLeads = await prisma.lead.count();
      const activeLeads = await prisma.lead.count({ where: { status: "ACTIVE" } });
      const repliedLeads = await prisma.lead.count({ where: { status: "REPLIED" } });

      return NextResponse.json({
        success: true,
        statistics: {
          events: {
            total: totalEvents,
            sent: sentEvents,
            opened: openedEvents,
            replied: repliedEvents,
            bounced: bouncedEvents,
          },
          leads: {
            total: totalLeads,
            active: activeLeads,
            replied: repliedLeads,
          },
          rates: {
            openRate: sentEvents > 0 ? ((openedEvents / sentEvents) * 100).toFixed(1) : "0",
            replyRate: sentEvents > 0 ? ((repliedEvents / sentEvents) * 100).toFixed(1) : "0",
            bounceRate: sentEvents > 0 ? ((bouncedEvents / sentEvents) * 100).toFixed(1) : "0",
          },
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
