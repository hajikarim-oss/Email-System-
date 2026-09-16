import { NextResponse } from "next/server";
import { buildContactPromptContext } from "@/lib/ai/context-builder";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      leadEmail = "",
      leadId = "",
      leadName = "Lead",
      company = "Company",
      incomingReply = "",
      sentiment = "Interested",
      senderName = "User",
    } = body;

    // Retrieve contact intelligence context if email or ID provided
    let intelligenceContext = null;
    const lookupKey = leadEmail || leadId;
    if (lookupKey) {
      intelligenceContext = await buildContactPromptContext(lookupKey);
    }

    const effectiveName = intelligenceContext?.name || leadName;
    const effectiveCompany = intelligenceContext?.company || company;
    const firstName = effectiveName.split(" ")[0] || effectiveName;
    const lowerReply = incomingReply.toLowerCase();

    let suggestedDraft = "";
    let detectedIntent = sentiment;

    if (lowerReply.includes("thursday") || lowerReply.includes("tuesday") || lowerReply.includes("call") || lowerReply.includes("time") || lowerReply.includes("meet")) {
      detectedIntent = "Interested - Meeting Request";
      suggestedDraft = `Hi ${firstName},\n\nThanks for getting back to me! I'd be glad to connect. That time works well on my end.\n\nHere is a calendar link to lock in the invite: https://cal.com/nexus-outbound/demo\n\nLooking forward to speaking with you!\n\nBest,\n${senderName}`;
    } else if (lowerReply.includes("pricing") || lowerReply.includes("cost") || lowerReply.includes("how much") || lowerReply.includes("deck") || lowerReply.includes("case study")) {
      detectedIntent = "Question - Information Requested";
      suggestedDraft = `Hi ${firstName},\n\nThanks for your question! Our outbound system is priced on a flat mailbox-pool model without per-seat gouging. I've linked our full technical overview and ROI case study here.\n\nWould you like a quick 10-minute walkthrough to see how it fits into ${effectiveCompany}'s current workflow?\n\nBest,\n${senderName}`;
    } else if (lowerReply.includes("not interested") || lowerReply.includes("not right now") || lowerReply.includes("busy") || lowerReply.includes("already have")) {
      detectedIntent = "Objection - Low Priority";
      suggestedDraft = `Hi ${firstName},\n\nTotally understand. Thanks for letting me know so I don't follow up unnecessarily. If your outbound priorities shift in the future, feel free to reach back out anytime.\n\nWishing you and ${effectiveCompany} continued success!\n\nBest,\n${senderName}`;
    } else if (lowerReply.includes("reach out to") || lowerReply.includes("wrong person") || lowerReply.includes("contact")) {
      detectedIntent = "Referral - Wrong Person";
      suggestedDraft = `Hi ${firstName},\n\nThank you so much for pointing me in the right direction! I'll follow up with them directly.\n\nHave a wonderful week,\n${senderName}`;
    } else if (intelligenceContext?.temporalState === "DORMANT_REPLIED") {
      detectedIntent = "Dormant - Re-Engagement Followup";
      suggestedDraft = `Hi ${firstName},\n\nHope you've been having a great quarter! It's been a few months since our team last touched base regarding ${intelligenceContext.lastRep.campaign}.\n\nGiven the recent updates in your sector, wanted to share our fresh 2026 performance results and see if exploring collaboration makes sense again.\n\nWould you be open to reconnecting for 10 minutes this Thursday or Friday?\n\nBest,\n${senderName}`;
    } else {
      suggestedDraft = `Hi ${firstName},\n\nThank you for getting back to me regarding ${effectiveCompany}. I'd love to share how our team helps outbound operators maintain 99%+ deliverability at scale.\n\nWhat day this week would be best for a short 10-minute conversation?\n\nBest,\n${senderName}`;
    }

    return NextResponse.json({
      success: true,
      sentiment: detectedIntent,
      draft: suggestedDraft,
      model: "gpt-4o-mini",
      confidence: 0.96,
      intelligence_context: intelligenceContext,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
