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
  conversation_status:
    | "em_atendimento"
    | "aguardando_cliente"
    | "finalizada"
    | null;
};

type StatusConversa =
  | "em_atendimento"
  | "aguardando_cliente"
  | "finalizada";

type ResumoTelefone = {
  ultimaMensagem: string;
  ultimoHorario: string;
  ultimoRecebidoEm: string | null;
  ultimaRespostaEm: string | null;
  ultimaOrigemResposta: LinhaConversa["response_origin"];
  naoLidas: number;
  statusConversa: StatusConversa | null;
  statusHorario: string | null;
};

type LeadConversa = {
  id: string;
  name: string | null;
  phone_raw: string | null;
  ia_pausada: boolean | null;
  source: string | null;
  interest: string | null;
  interests: string[] | null;
  ai_review_level: "normal" | "attention" | "urgent" | null;
  ai_review_reason: string | null;
  ai_summary: string | null;
  ai_next_action: string | null;
  ai_confidence: number | string | null;
  ai_suggested_stage: string | null;
  ai_last_analyzed_at: string | null;
  stages: Array<{ name: string | null }> | null;
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
      "telefone_cliente, mensagem, resposta, created_at, response_at, response_origin, read_at, conversation_status"
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
        statusConversa: null,
        statusHorario: null,
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

    if (linha.conversation_status) {
      const horarioStatus =
        linha.resposta && linha.response_at ? linha.response_at : linha.created_at;

      if (
        horarioStatus &&
        (!resumo.statusHorario ||
          timestampMs(horarioStatus) > timestampMs(resumo.statusHorario))
      ) {
        resumo.statusConversa = linha.conversation_status;
        resumo.statusHorario = horarioStatus;
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
    .select(
      "id, name, phone_raw, ia_pausada, ultima_intervencao_humana, source, interest, interests, stage_id, ai_review_level, ai_review_reason, ai_summary, ai_next_action, ai_confidence, ai_suggested_stage, ai_last_analyzed_at, stages(name)"
    )
    .or(condicao);

  if (leadsError) {
    console.error("Erro ao buscar leads das conversas:", leadsError);
  }

  const leadsTipados = (leads ?? []) as LeadConversa[];

  const leadsPorTelefone = new Map(
    leadsTipados.map((lead) => [lead.phone_raw, lead])
  );

  const conversas = telefones.map((telefone) => {
    const resumo = porTelefone.get(telefone)!;
    const lead = leadsPorTelefone.get(telefone);

    const ultimoRecebidoMs = timestampMs(resumo.ultimoRecebidoEm);
    const ultimaRespostaMs = timestampMs(resumo.ultimaRespostaEm);

    const aguardandoResposta =
      ultimoRecebidoMs > 0 && ultimoRecebidoMs > ultimaRespostaMs;

    const statusConversa: StatusConversa =
      resumo.statusConversa ??
      (aguardandoResposta ? "em_atendimento" : "aguardando_cliente");

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
      statusConversa,
      leadId: lead?.id ?? null,
      etapa: Array.isArray(lead?.stages)
        ? lead.stages[0]?.name ?? null
        : null,
      origem: lead?.source ?? null,
      interesses:
        Array.isArray(lead?.interests) && lead.interests.length > 0
          ? lead.interests
          : lead?.interest
            ? [lead.interest]
            : [],
      aiReviewLevel: lead?.ai_review_level ?? "normal",
      aiReviewReason: lead?.ai_review_reason ?? null,
      aiSummary: lead?.ai_summary ?? null,
      aiNextAction: lead?.ai_next_action ?? null,
      aiConfidence: lead?.ai_confidence == null ? null : Number(lead.ai_confidence),
      aiSuggestedStage: lead?.ai_suggested_stage ?? null,
      aiLastAnalyzedAt: lead?.ai_last_analyzed_at ?? null,
    };
  });

  conversas.sort(
    (a, b) =>
      new Date(b.ultimoHorario).getTime() - new Date(a.ultimoHorario).getTime()
  );

  return NextResponse.json({ conversas });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const telefone = String(body?.telefone ?? "").trim();
  const status = String(body?.status ?? "").trim() as StatusConversa;
  const action = String(body?.action ?? "").trim();

  const statusValidos: StatusConversa[] = [
    "em_atendimento",
    "aguardando_cliente",
    "finalizada",
  ];

  if (!telefone) {
    return NextResponse.json(
      { error: "Telefone não informado" },
      { status: 400 }
    );
  }

  if (action === "clear_ai_review") {
    const supabase = createSupabaseServerClient();

    const { error: clearError } = await supabase
      .from("leads")
      .update({
        ai_review_level: "normal",
        ai_review_reason: null,
        ai_reviewed_at: new Date().toISOString(),
      })
      .eq("phone_raw", telefone);

    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, aiReviewLevel: "normal" });
  }

  if (!statusValidos.includes(status)) {
    return NextResponse.json(
      { error: "Status de conversa inválido" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: ultimaLinha, error: buscaError } = await supabase
    .from("whatsapp_conversas")
    .select("id")
    .eq("telefone_cliente", telefone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (buscaError) {
    return NextResponse.json({ error: buscaError.message }, { status: 500 });
  }

  if (!ultimaLinha?.id) {
    return NextResponse.json(
      { error: "Conversa não encontrada" },
      { status: 404 }
    );
  }

  const { error: updateError } = await supabase
    .from("whatsapp_conversas")
    .update({ conversation_status: status })
    .eq("id", ultimaLinha.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}
