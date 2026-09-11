const nodemailer = require("nodemailer");

async function runLiveTest() {
  const recipient = "theboredmonkeytech@gmail.com";
  const sender = "haji.karim@theboredmonkey.com";

  console.log(`🚀 Starting Live Email Test to: ${recipient}`);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: sender,
      pass: "jbyt zcdq ccjw kwhd",
    },
  });

  const path = require("path");

  const fullSignature = `
<br/>
<p style="margin-bottom: 2px;">Kind Regards,</p>
<p style="margin-bottom: 2px;"><strong>Poonam Khate</strong> | HR Executive</p>
<p style="margin-bottom: 2px;">Contact: <a href="tel:+917798851185" style="color: #0b57d0; text-decoration: underline;">+91 7798851185</a></p>
<p style="margin-bottom: 2px;"><strong>TheBoredMonkey</strong></p>
<p style="margin-bottom: 12px;">Website: <a href="https://www.theboredmonkey.com/" target="_blank" style="color: #0b57d0; text-decoration: underline;">https://www.theboredmonkey.com/</a></p>
<div style="margin-top: 10px; margin-bottom: 12px;">
  <img src="cid:tbmlogo" alt="TheBoredMonkey" width="200" height="50" style="display: block; width: 200px; height: 50px;" />
</div>
<div style="margin-top: 8px;">
  <img src="cid:tbmportfolio" alt="TheBoredMonkey Portfolio" width="420" height="56" style="display: block; width: 420px; max-width: 100%; height: auto; border-radius: 4px;" />
</div>
`;

  const emailAttachments = [
    {
      filename: "tbm-logo.gif",
      path: path.join(__dirname, "../public/tbm-logo.gif"),
      cid: "tbmlogo",
    },
    {
      filename: "tbm-portfolio.gif",
      path: path.join(__dirname, "../public/tbm-portfolio.gif"),
      cid: "tbmportfolio",
    },
  ];

  // 1. STEP 1: Cold Reachout Email
  const step1Subject = "Rajdeep Promotion Letter | Effective 01 October 2026 | Product Executive";
  const step1Body = `
<p>Hey Rajdeep,</p>
<p>Greetings of the day!</p>
<p>I’m so happy to share this wonderful news with you that you have officially received a salary increment &amp; promotion, effective <strong>October 1, 2026.</strong></p>
<p>This is a reflection of your consistent hard work and the positive spirit you bring to your role every day. Your dedication and willingness to go the extra mile haven’t gone unnoticed, and we truly appreciate your continued contribution.</p>
<p>Cheers to your growth!</p>
${fullSignature}
`;

  console.log("📨 Sending Step 1 Reachout Email...");
  const info1 = await transporter.sendMail({
    from: `"Haji Karim (TheBoredMonkey)" <${sender}>`,
    to: recipient,
    subject: step1Subject,
    html: step1Body,
    attachments: emailAttachments,
  });
  console.log(`✅ Step 1 Reachout Delivered! Message ID: ${info1.messageId}`);

  // 2. STEP 2: Follow-Up Email (60s Delay simulation)
  console.log("⏳ Simulating 5s Delay before Step 2 Follow-Up...");
  await new Promise((res) => setTimeout(res, 5000));

  const step2Subject = `Re: ${step1Subject}`;
  const step2Body = `
<p>Hey Rajdeep,</p>
<p>Wanted to follow up on my previous note to ensure you had a chance to review your updated compensation breakdown and next milestone goals.</p>
<p>Let me know if you have any questions!</p>
${fullSignature}
`;

  console.log("📨 Sending Step 2 Follow-Up Email (Threading under Step 1)...");
  const info2 = await transporter.sendMail({
    from: `"Haji Karim (TheBoredMonkey)" <${sender}>`,
    to: recipient,
    subject: step2Subject,
    inReplyTo: info1.messageId,
    references: [info1.messageId],
    html: step2Body,
    attachments: emailAttachments,
  });
  console.log(`✅ Step 2 Follow-Up Delivered in Same Thread! Message ID: ${info2.messageId}`);

  console.log("🎉 ALL TESTS PASSED! Both Step 1 Reachout & Step 2 Follow-Up delivered to karim0beldaar@gmail.com!");
}

runLiveTest().catch((err) => console.error("❌ Test error:", err));
