export async function sendWhatsApp(to: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  // Support both env names (some projects used WHATSAPP_TOKEN previously)
  const token = process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is missing");
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN/WHATSAPP_TOKEN is missing");

  const toDigits = String(to).replace(/\D/g, "");
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }
}
