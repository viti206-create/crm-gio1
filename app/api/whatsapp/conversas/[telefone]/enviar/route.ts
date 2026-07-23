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

  await sendWhatsAppMessage(telefone, texto);

  await supabase.from("whatsapp_conversas").insert({
    numero_origem: process.env.WHATSAPP_PHONE_NUMBER_ID,
    telefone_cliente: telefone,
    mensagem: null,
    resposta: texto,
  });

  await supabase
    .from("leads")
    .update({ ultima_intervencao_humana: new Date().toISOString() })
    .eq("phone_raw", telefone);

  return NextResponse.json({ ok: true });
}