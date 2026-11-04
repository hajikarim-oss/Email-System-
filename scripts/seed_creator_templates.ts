import { pgQuery } from "../server/pg";

export const CREATOR_TEMPLATE_PRESETS = [
    {
        id: "tpl_creator_paid_collab",
        workspaceId: "org_troops_outreach",
        name: "Paid Brand Collaboration Invitation",
        subject: "Paid Collaboration: {{.Brand}} x {{.Handle}} 💛",
        bodyHtml: `<p>Hi {{.CreatorName}},</p>
<p>We came across your incredible content in <strong>{{.Category}}</strong> on <strong>{{.Handle}}</strong>—our creative team at TheBoredMonkey absolutely loves your storytelling!</p>
<p>We are currently onboarding select creators for an upcoming paid campaign with <strong>{{.Brand}}</strong>. We'd love to partner with you for dedicated Reel and Story deliverables.</p>
<p>To confirm your availability, locked commercial rates, and delivery address for PR gifting, please complete your quick 20-second creator profile here:</p>
<p style="margin: 24px 0;"><a href="{{.IntakeFormUrl}}" style="background-color: #18181B; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">👉 Lock Your Campaign Slot & Details</a></p>
<p>Looking forward to creating something iconic together!</p>
<p>Best regards,<br/><strong>Creator Scouting Team</strong><br/>TheBoredMonkey Studios</p>`,
        category: "COLLABORATION",
        orderIndex: 0,
    },
    {
        id: "tpl_creator_pr_gifting",
        workspaceId: "org_troops_outreach",
        name: "PR Gifting & Product Seeding",
        subject: "Sending you the new {{.Brand}} collection 🎁",
        bodyHtml: `<p>Hey {{.CreatorName}},</p>
<p>We have an exclusive, curated PR hamper from <strong>{{.Brand}}</strong> ready to ship to you! No compulsory deliverable mandates—just pure product love for your genuine review.</p>
<p>Drop your shipping address and contact details in 20 seconds so our logistics desk can dispatch your hamper:</p>
<p style="margin: 24px 0;"><a href="{{.IntakeFormUrl}}" style="background-color: #18181B; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">🎁 Enter Shipping Address for Delivery</a></p>
<p>Warmly,<br/><strong>Brand Logistics & PR Desk</strong><br/>TheBoredMonkey</p>`,
        category: "GIFTING",
        orderIndex: 1,
    },
    {
        id: "tpl_creator_roster_deadline",
        workspaceId: "org_troops_outreach",
        name: "Campaign Roster Final Call / Intake Reminder",
        subject: "Follow-up: Final slots for {{.Brand}} campaign",
        bodyHtml: `<p>Hey {{.CreatorName}},</p>
<p>Just following up on our previous note regarding the <strong>{{.Brand}}</strong> campaign. We are finalizing our creator roster by end-of-day tomorrow.</p>
<p>If you're interested in partnering with us, please lock in your rates and details here before slots close:</p>
<p style="margin: 24px 0;"><a href="{{.IntakeFormUrl}}" style="background-color: #F59E0B; color: #000000; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block;">⚡ Complete 20-Second Intake (Final Call)</a></p>
<p>Best,<br/><strong>Creator Partnerships</strong><br/>TheBoredMonkey</p>`,
        category: "FOLLOW_UP",
        orderIndex: 2,
    },
    {
        id: "tpl_creator_network_welcome",
        workspaceId: "org_troops_outreach",
        name: "Welcome to TBM Creator Network",
        subject: "Welcome to TheBoredMonkey Creator Roster! 🚀",
        bodyHtml: `<p>Hey {{.CreatorName}},</p>
<p>Thank you for submitting your details! Your profile on <strong>{{.Handle}}</strong> is now officially locked into our active brand scouting roster.</p>
<p>Whenever a brand campaign in <strong>{{.Category}}</strong> aligns with your audience, our team will reach out directly on WhatsApp with the brief, deliverable timeline, and purchase order.</p>
<p>Stay iconic,<br/><strong>TheBoredMonkey Creator Desk</strong></p>`,
        category: "ONBOARDING",
        orderIndex: 3,
    },
];

async function seed() {
    console.log("[Seed] Seeding CreatorTemplate presets...");
    for (const t of CREATOR_TEMPLATE_PRESETS) {
        await pgQuery(`
            INSERT INTO "CreatorTemplate" ("id", "workspaceId", "name", "subject", "bodyHtml", "category", "orderIndex")
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT ("id") DO UPDATE SET
                "name" = EXCLUDED."name",
                "subject" = EXCLUDED."subject",
                "bodyHtml" = EXCLUDED."bodyHtml",
                "category" = EXCLUDED."category",
                "orderIndex" = EXCLUDED."orderIndex",
                "updatedAt" = NOW();
        `, [t.id, t.workspaceId, t.name, t.subject, t.bodyHtml, t.category, t.orderIndex]);
    }
    console.log("[Seed] ✓ CreatorTemplate presets seeded successfully.");
}

seed()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[Seed] Error:", err);
        process.exit(1);
    });

