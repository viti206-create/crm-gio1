import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: mensagens, error } = await supabase
    .from("whatsapp_conversas")
    .select("telefone_cliente, mensagem, resposta, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const porTelefone = new Map<
    string,
    { ultimaMensagem: string; ultimoHorario: string }
  >();

  for (const linha of mensagens ?? []) {
    if (!porTelefone.has(linha.telefone_cliente)) {
      const textoResumo = linha.mensagem ?? linha.resposta ?? "";
      porTelefone.set(linha.telefone_cliente, {
        ultimaMensagem: textoResumo,
        ultimoHorario: linha.created_at,
      });
    }
  }

  const telefones = Array.from(porTelefone.keys());

  const condicao =
    telefones.length > 0
      ? telefones.map((telefone) => `phone_raw.eq.${telefone}`).join(",")
      : "phone_raw.eq.__nenhum__";

  const { data: leads } = await supabase
    .from("leads")
    .select("name, phone_raw, ia_pausada, ultima_intervencao_humana")
    .or(condicao);

  const leadsPorTelefone = new Map(
    (leads ?? []).map((lead) => [lead.phone_raw, lead])
  );

  const conversas = telefones.map((telefone) => {
    const resumo = porTelefone.get(telefone)!;
    const lead = leadsPorTelefone.get(telefone);
    return {
      telefone,
      nome: lead?.name ?? telefone,
      ultimaMensagem: resumo.ultimaMensagem,
      ultimoHorario: resumo.ultimoHorario,
      iaPausada: lead?.ia_pausada ?? false,
    };
  });

  conversas.sort(
    (a, b) =>
      new Date(b.ultimoHorario).getTime() - new Date(a.ultimoHorario).getTime()
  );

  return NextResponse.json({ conversas });
}