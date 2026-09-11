const apiKey = "412be3a1-8c01-45cf-811e-b3a0e98a00c2_1dp80jm";
const baseUrl = "https://server.smartlead.ai/api/v1";

async function testSmartleadCampaignFlow() {
  console.log("🚀 Testing Smartlead API Campaign & Dispatch Engine...");

  // 1. Fetch connected mailboxes
  const mbRes = await fetch(`${baseUrl}/email-accounts?api_key=${apiKey}`);
  const mailboxes = await mbRes.json();
  console.log(`✓ Smartlead Connected Mailboxes: ${mailboxes.length}`);
  const mailboxId = mailboxes[0]?.id;
  console.log(`  Selected Mailbox ID: ${mailboxId} (${mailboxes[0]?.from_email})`);

  // 2. Create Campaign in Smartlead
  const fullSignature = `
<br/>
<p style="margin-bottom: 2px;">Kind Regards,</p>
<p style="margin-bottom: 2px;"><strong>Poonam Khate</strong> | HR Executive</p>
<p style="margin-bottom: 2px;">Contact: <a href="tel:+917798851185" style="color: #0b57d0; text-decoration: underline;">+91 7798851185</a></p>
<p style="margin-bottom: 2px;"><strong>TheBoredMonkey</strong></p>
<p style="margin-bottom: 12px;">Website: <a href="https://www.theboredmonkey.com/" target="_blank" style="color: #0b57d0; text-decoration: underline;">https://www.theboredmonkey.com/</a></p>
<div style="display: inline-block; margin-top: 10px; margin-bottom: 10px;">
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 8px; padding: 10px 18px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <span style="color: #38bdf8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 900; font-size: 16px; letter-spacing: 0.5px;">🐵 TheBoredMonkey</span>
    <span style="color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; margin-left: 8px; font-weight: 600;">| Digital Product Studio</span>
  </div>
</div>
<div style="margin-top: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0b57d0; border-radius: 6px; padding: 10px 14px; max-width: 440px;">
  <p style="margin: 0; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 700;">
    🚀 TheBoredMonkey Portfolio &amp; Innovation Lab
  </p>
  <p style="margin: 3px 0 0 0; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px;">
    Building Next-Gen Web, AI &amp; Enterprise Systems · <a href="https://www.theboredmonkey.com/" target="_blank" style="color: #0b57d0; font-weight: 600; text-decoration: underline;">View Portfolio →</a>
  </p>
</div>
`;

  const step1Body = `
<p>Hey {{firstName}},</p>
<p>Greetings of the day!</p>
<p>I’m so happy to share this wonderful news with you that you have officially received a salary increment &amp; promotion, effective <strong>October 1, 2026.</strong></p>
<p>This is a reflection of your consistent hard work and the positive spirit you bring to your role every day. Your dedication and willingness to go the extra mile haven’t gone unnoticed, and we truly appreciate your continued contribution.</p>
<p>Cheers to your growth!</p>
${fullSignature}
`;

  const step2Body = `
<p>Hey {{firstName}},</p>
<p>Wanted to follow up on my previous note to ensure you had a chance to review your updated compensation breakdown and next milestone goals.</p>
<p>Let me know if you have any questions!</p>
${fullSignature}
`;

  console.log("📦 Creating Campaign in Smartlead API...");
  const campRes = await fetch(`${baseUrl}/campaigns/create?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Rajdeep Promotion Campaign ${Date.now()}`,
    }),
  });
  const campData = await campRes.json();
  console.log("✅ Smartlead Campaign Created! ID:", campData.id);
  const smartleadCampaignId = campData.id;

  // Save Sequence Steps to Smartlead Campaign
  console.log("📝 Saving Sequence Steps to Smartlead Campaign...");
  await fetch(`${baseUrl}/campaigns/${smartleadCampaignId}/sequences?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sequences: [
        {
          seq_number: 1,
          seq_delay_details: { delay_in_days: 0 },
          subject: "{{firstName}} Promotion Letter | Effective 01 October 2026 | {{title}}",
          email_body: step1Body,
        },
        {
          seq_number: 2,
          seq_delay_details: { delay_in_days: 0 },
          subject: "",
          email_body: step2Body,
        },
      ],
    }),
  });

  // Attach Mailbox Account to Smartlead Campaign
  console.log("📧 Attaching Mailbox Account to Smartlead Campaign...");
  await fetch(`${baseUrl}/campaigns/${smartleadCampaignId}/accounts?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email_account_ids: [mailboxId],
    }),
  });

  // Add Lead to Smartlead Campaign
  console.log("👤 Adding Lead karim0beldaar@gmail.com to Smartlead Campaign...");
  const leadRes = await fetch(`${baseUrl}/campaigns/${smartleadCampaignId}/leads?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_list: [
        {
          email: "karim0beldaar@gmail.com",
          first_name: "Rajdeep",
          last_name: "More",
          company_name: "TheBoredMonkey",
          custom_fields: {
            title: "Product Executive",
          },
        },
      ],
    }),
  });
  const leadData = await leadRes.json();
  console.log("✅ Lead added to Smartlead! Upload stats:", JSON.stringify(leadData));

  // Also initiate direct send via Smartlead single email API
  console.log("📨 Initiating Single Email Dispatch via Smartlead API...");
  const sendRes = await fetch(`${baseUrl}/send-email/initiate?api_key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: "karim0beldaar@gmail.com",
      fromEmail: mailboxes[0]?.from_email,
      fromName: "Haji Karim",
      subject: "Rajdeep Promotion Letter | Effective 01 October 2026 | Product Executive",
      body: step1Body.replace(/\{\{firstName\}\}/g, "Rajdeep"),
    }),
  });
  const sendData = await sendRes.json();
  console.log("✅ Smartlead Single Email Dispatch Result:", JSON.stringify(sendData));

  console.log("🎉 SMARTLEAD API TEST COMPLETED SUCCESSFULLY!");
}

testSmartleadCampaignFlow().catch((err) => console.error("❌ Smartlead Test Error:", err));
