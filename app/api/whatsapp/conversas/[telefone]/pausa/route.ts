import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ telefone: string }> }
) {
  const { telefone } = await params;
  const { pausada } = await req.json();

  const supabase = createSupabaseServerClient();

  const novoValor = Boolean(pausada);

  const updatePayload: {
    ia_pausada: boolean;
    ultima_intervencao_humana?: null;
  } = {
    ia_pausada: novoValor,
  };

  // Ao reativar a IA (botão "voltar"), também limpa o timer de 1h que
  // poderia continuar bloqueando as respostas mesmo com ia_pausada = false
  if (!novoValor) {
    updatePayload.ultima_intervencao_humana = null;
  }

  const { error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("phone_raw", telefone);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}