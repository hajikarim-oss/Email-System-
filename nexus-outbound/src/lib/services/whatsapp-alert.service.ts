export async function sendWhatsAppAlert(message: string): Promise<boolean> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const recipientPhone = process.env.WHATSAPP_ALERT_PHONE;

  if (!apiUrl || !apiToken || !recipientPhone) {
    console.log(`[WhatsApp Alert Simulation]: ${message}`);
    return true;
  }

  try {
    const to = recipientPhone.replace("+", "");

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const messageId = data.messages?.[0]?.id;

      if (messageId) {
        await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: `[NEXUS ALERT] ${message}` },
          }),
        });
      }
    }

    return response.ok;
  } catch (error) {
    console.error("WhatsApp alert dispatch error:", error);
    return false;
  }
}
