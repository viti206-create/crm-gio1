import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ telefone: string }> }
) {
  const { telefone } = await params;
  const body = await req.json().catch(() => null);
  const textoLimpo = String(body?.texto ?? "").trim();

  if (!textoLimpo) {
    return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  try {
    await sendWhatsAppMessage(telefone, textoLimpo);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao enviar mensagem";

    return NextResponse.json({ error: message }, { status: 500 });
  }

  const responseAt = new Date().toISOString();

  const { error: insertError } = await supabase
    .from("whatsapp_conversas")
    .insert({
      numero_origem: process.env.WHATSAPP_PHONE_NUMBER_ID,
      telefone_cliente: telefone,
      mensagem: null,
      resposta: textoLimpo,
      created_at: responseAt,
      response_at: responseAt,
      response_origin: "crm_human",
    });

  if (insertError) {
    console.error("Erro ao registrar mensagem enviada pelo CRM:", insertError);

    return NextResponse.json(
      {
        error:
          "A mensagem foi enviada pelo WhatsApp, mas não foi registrada no histórico do CRM.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
