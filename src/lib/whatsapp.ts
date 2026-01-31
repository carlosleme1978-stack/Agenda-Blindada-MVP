export async function sendWhatsAppTemplate({
  to,
  templateName,
  params,
}: {
  to: string;
  templateName: string;
  params: string[];
}) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_TOKEN!;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "pt_PT";

  const body = {
    messaging_product: "whatsapp",
    to: to.replace(/\+/g, ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({
            type: "text",
            text,
          })),
        },
      ],
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();

console.error("WHATSAPP TEMPLATE STATUS:", res.status);
console.error("WHATSAPP TEMPLATE RESPONSE:", JSON.stringify(data, null, 2));

if (!res.ok) {
  throw new Error("WhatsApp template send failed");
}


  return data;
}

