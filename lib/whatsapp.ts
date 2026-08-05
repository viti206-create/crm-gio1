export async function sendWhatsAppMessage(to: string, texto: string) {
  await fetch(
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
        text: { body: texto },
      }),
    }
  );
}