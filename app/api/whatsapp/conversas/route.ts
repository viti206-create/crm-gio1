import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type LinhaConversa = {
  telefone_cliente: string | null;
  mensagem: string | null;
  resposta: string | null;
  created_at: string | null;
  response_at: string | null;
  response_origin: "ai" | "crm_human" | "whatsapp_human" | null;
  read_at: string | null;
};

type ResumoTelefone = {
  ultimaMensagem: string;
  ultimoHorario: string;
  ultimoRecebidoEm: string | null;
  ultimaRespostaEm: string | null;
  ultimaOrigemResposta: LinhaConversa["response_origin"];
  naoLidas: number;
};

function timestampMs(valor: string | null | undefined) {
  if (!valor) return 0;
  const ms = new Date(valor).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: mensagens, error } = await supabase
    .from("whatsapp_conversas")
    .select(
      "telefone_cliente, mensagem, resposta, created_at, response_at, response_origin, read_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const porTelefone = new Map<string, ResumoTelefone>();

  for (const linhaBruta of mensagens ?? []) {
    const linha = linhaBruta as LinhaConversa;
    const telefone = linha.telefone_cliente;

    if (!telefone) continue;

    let resumo = porTelefone.get(telefone);

    if (!resumo) {
      const textoResumo = linha.mensagem ?? linha.resposta ?? "";
      resumo = {
        ultimaMensagem: textoResumo,
        ultimoHorario: linha.created_at ?? new Date(0).toISOString(),
        ultimoRecebidoEm: null,
        ultimaRespostaEm: null,
        ultimaOrigemResposta: null,
        naoLidas: 0,
      };
      porTelefone.set(telefone, resumo);
    }

    if (linha.mensagem) {
      if (!resumo.ultimoRecebidoEm) {
        resumo.ultimoRecebidoEm = linha.created_at;
      }

      if (!linha.read_at) {
        resumo.naoLidas += 1;
      }
    }

    if (linha.resposta) {
      const horarioResposta = linha.response_at ?? linha.created_at;

      if (
        horarioResposta &&
        (!resumo.ultimaRespostaEm ||
          timestampMs(horarioResposta) > timestampMs(resumo.ultimaRespostaEm))
      ) {
        resumo.ultimaRespostaEm = horarioResposta;
        resumo.ultimaOrigemResposta = linha.response_origin;
      }
    }
  }

  const telefones = Array.from(porTelefone.keys());

  const condicao =
    telefones.length > 0
      ? telefones.map((telefone) => `phone_raw.eq.${telefone}`).join(",")
      : "phone_raw.eq.__nenhum__";

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("name, phone_raw, ia_pausada, ultima_intervencao_humana")
    .or(condicao);

  if (leadsError) {
    console.error("Erro ao buscar leads das conversas:", leadsError);
  }

  const leadsPorTelefone = new Map(
    (leads ?? []).map((lead) => [lead.phone_raw, lead])
  );

  const conversas = telefones.map((telefone) => {
    const resumo = porTelefone.get(telefone)!;
    const lead = leadsPorTelefone.get(telefone);

    const ultimoRecebidoMs = timestampMs(resumo.ultimoRecebidoEm);
    const ultimaRespostaMs = timestampMs(resumo.ultimaRespostaEm);

    const aguardandoResposta =
      ultimoRecebidoMs > 0 && ultimoRecebidoMs > ultimaRespostaMs;

    return {
      telefone,
      nome: lead?.name ?? telefone,
      ultimaMensagem: resumo.ultimaMensagem,
      ultimoHorario: resumo.ultimoHorario,
      iaPausada: lead?.ia_pausada ?? false,
      aguardandoResposta,
      aguardandoDesde: aguardandoResposta ? resumo.ultimoRecebidoEm : null,
      naoLidas: resumo.naoLidas,
      ultimaOrigemResposta: resumo.ultimaOrigemResposta,
    };
  });

  conversas.sort(
    (a, b) =>
      new Date(b.ultimoHorario).getTime() - new Date(a.ultimoHorario).getTime()
  );

  return NextResponse.json({ conversas });
}
