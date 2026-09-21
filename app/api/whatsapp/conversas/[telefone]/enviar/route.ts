import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ telefone: string }> }
) {
  const { telefone } = await params;
  const { texto } = await req.json();

  if (!texto || !String(texto).trim()) {
    return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const textoLimpo = String(texto).trim();

  await sendWhatsAppMessage(telefone, textoLimpo);

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
      conversation_status: "aguardando_cliente",
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

  const { error: leadError } = await supabase
    .from("leads")
    .update({ ultima_intervencao_humana: responseAt })
    .eq("phone_raw", telefone);

  if (leadError) {
    console.error("Erro ao registrar intervenção humana no lead:", leadError);
  }

  return NextResponse.json({ ok: true });
}