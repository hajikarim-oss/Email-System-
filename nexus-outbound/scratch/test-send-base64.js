const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

async function sendBase64TestEmail() {
  const recipient = "karim0beldaar@gmail.com";
  const sender = "haji.karim@theboredmonkey.com";

  console.log(`🚀 Sending Base64 Embedded Image Email to: ${recipient}`);

  const logoPath = path.join(process.cwd(), "public", "tbm-logo.gif");
  const bannerPath = path.join(process.cwd(), "public", "signature-banner.png");

  const logoBase64 = fs.readFileSync(logoPath).toString("base64");
  const bannerBase64 = fs.readFileSync(bannerPath).toString("base64");

  const logoDataUri = `data:image/gif;base64,${logoBase64}`;
  const bannerDataUri = `data:image/png;base64,${bannerBase64}`;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: sender,
      pass: "jbyt zcdq ccjw kwhd",
    },
  });

  const fullSignature = `
<br/>
<p style="margin-bottom: 2px; font-family: sans-serif;">Kind Regards,</p>
<p style="margin-bottom: 2px; font-family: sans-serif;"><strong>Poonam Khate</strong> | HR Executive</p>
<p style="margin-bottom: 2px; font-family: sans-serif;">Contact: <a href="tel:+917798851185" style="color: #0b57d0; text-decoration: underline;">+91 7798851185</a></p>
<p style="margin-bottom: 2px; font-family: sans-serif;"><strong>TheBoredMonkey</strong></p>
<p style="margin-bottom: 12px; font-family: sans-serif;">Website: <a href="https://www.theboredmonkey.com/" target="_blank" style="color: #0b57d0; text-decoration: underline;">https://www.theboredmonkey.com/</a></p>
<div style="margin-top: 10px; margin-bottom: 12px;">
  <img src="${logoDataUri}" alt="TheBoredMonkey" width="200" height="50" style="display: block; width: 200px; height: 50px;" />
</div>
<div style="margin-top: 8px;">
  <img src="${bannerDataUri}" alt="TheBoredMonkey Portfolio" width="420" style="display: block; width: 420px; max-width: 100%; height: auto; border-radius: 4px;" />
</div>
`;

  const step1Subject = "Rajdeep Promotion Letter | Effective 01 October 2026 | Product Executive";
  const step1Body = `
<div style="font-family: sans-serif; font-size: 14px; color: #1f1f1f;">
<p>Hey Rajdeep,</p>
<p>Greetings of the day!</p>
<p>I’m so happy to share this wonderful news with you that you have officially received a salary increment &amp; promotion, effective <strong>October 1, 2026.</strong></p>
<p>This is a reflection of your consistent hard work and the positive spirit you bring to your role every day. Your dedication and willingness to go the extra mile haven’t gone unnoticed, and we truly appreciate your continued contribution.</p>
<p>Cheers to your growth!</p>
${fullSignature}
</div>
`;

  const info = await transporter.sendMail({
    from: `"Haji Karim (TheBoredMonkey)" <${sender}>`,
    to: recipient,
    subject: step1Subject,
    html: step1Body,
  });

  console.log(`✅ Base64 Image Email Sent Successfully! Message ID: ${info.messageId}`);
}

sendBase64TestEmail().catch((err) => console.error("❌ Send error:", err));
