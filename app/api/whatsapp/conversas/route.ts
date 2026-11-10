import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

type LinhaConversa = {
  telefone_cliente: string | null;
  nome_cliente: string | null;
  mensagem: string | null;
  resposta: string | null;
  created_at: string | null;
  response_at: string | null;
  read_at: string | null;
};

type ResumoTelefone = {
  nome: string | null;
  ultimaMensagem: string;
  ultimoHorario: string;
  naoLidas: number;
};

function timestampMs(value: string | null | undefined) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .select(
      "telefone_cliente,nome_cliente,mensagem,resposta,created_at,response_at,read_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const porTelefone = new Map<string, ResumoTelefone>();

  for (const raw of data ?? []) {
    const row = raw as LinhaConversa;
    const telefone = row.telefone_cliente;
    if (!telefone) continue;

    const horarioLinha =
      row.response_at ?? row.created_at ?? new Date(0).toISOString();
    const textoLinha = row.resposta ?? row.mensagem ?? "";

    let resumo = porTelefone.get(telefone);

    if (!resumo) {
      resumo = {
        nome: row.nome_cliente,
        ultimaMensagem: textoLinha,
        ultimoHorario: horarioLinha,
        naoLidas: 0,
      };
      porTelefone.set(telefone, resumo);
    }

    if (!resumo.nome && row.nome_cliente) {
      resumo.nome = row.nome_cliente;
    }

    if (timestampMs(horarioLinha) > timestampMs(resumo.ultimoHorario)) {
      resumo.ultimaMensagem = textoLinha;
      resumo.ultimoHorario = horarioLinha;
    }

    if (row.mensagem && !row.read_at) {
      resumo.naoLidas += 1;
    }
  }

  const conversas = Array.from(porTelefone.entries())
    .map(([telefone, resumo]) => ({
      telefone,
      nome: resumo.nome ?? telefone,
      ultimaMensagem: resumo.ultimaMensagem,
      ultimoHorario: resumo.ultimoHorario,
      naoLidas: resumo.naoLidas,
    }))
    .sort(
      (a, b) =>
        timestampMs(b.ultimoHorario) - timestampMs(a.ultimoHorario)
    );

  return NextResponse.json({ conversas });
}
