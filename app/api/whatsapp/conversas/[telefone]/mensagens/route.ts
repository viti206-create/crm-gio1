import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ telefone: string }> }
) {
  const { telefone } = await params;
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .select("mensagem, resposta, created_at")
    .eq("telefone_cliente", telefone)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bolhas: Array<{
    tipo: "recebida" | "enviada";
    texto: string;
    horario: string;
  }> = [];

  for (const linha of data ?? []) {
    if (linha.mensagem) {
      bolhas.push({
        tipo: "recebida",
        texto: linha.mensagem,
        horario: linha.created_at,
      });
    }
    if (linha.resposta) {
      bolhas.push({
        tipo: "enviada",
        texto: linha.resposta,
        horario: linha.created_at,
      });
    }
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("name, ia_pausada")
    .eq("phone_raw", telefone)
    .maybeSingle();

  return NextResponse.json({
    bolhas,
    nome: lead?.name ?? telefone,
    iaPausada: lead?.ia_pausada ?? false,
  });
}