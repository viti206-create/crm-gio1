export async function sendWhatsAppMessage(to: string, texto: string) {
  const response = await fetch(
    `https://api.dualhook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DUALHOOK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: texto },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      `Falha ao enviar mensagem WhatsApp (status ${response.status}):`,
      errorBody
    );
    throw new Error(
      `Falha ao enviar mensagem WhatsApp: ${response.status} - ${errorBody}`
    );
  }

  return response.json();
}