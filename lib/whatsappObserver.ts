import Anthropic from "@anthropic-ai/sdk";

type ReviewLevel = "normal" | "attention" | "urgent";

type StageRow = {
  id: string;
  name: string;
  position: number;
  is_final?: boolean | null;
};

type LeadRow = {
  id: string;
  name: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  interest: string | null;
  interests: string[] | null;
  stage_id: string | null;
  ai_review_level: ReviewLevel | null;
  ai_review_reason: string | null;
};

type ConversationRow = {
  mensagem: string | null;
  resposta: string | null;
  response_origin: "ai" | "crm_human" | "whatsapp_human" | null;
  created_at: string | null;
  response_at: string | null;
};

type ObserverResult = {
  summary: string;
  interest: string | null;
  next_action: string;
  suggested_stage_name: string | null;
  confidence: number;
  review_level: ReviewLevel;
  review_reason: string | null;
};

const anthropicObserver = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function clampConfidence(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cleanNullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function parseObserverJson(raw: string): ObserverResult | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const review = String(parsed.review_level ?? "normal").toLowerCase();
    const reviewLevel: ReviewLevel =
      review === "urgent"
        ? "urgent"
        : review === "attention"
          ? "attention"
          : "normal";

    return {
      summary: String(parsed.summary ?? "").trim().slice(0, 700),
      interest: cleanNullableText(parsed.interest)?.slice(0, 120) ?? null,
      next_action: String(parsed.next_action ?? "").trim().slice(0, 400),
      suggested_stage_name:
        cleanNullableText(parsed.suggested_stage_name)?.slice(0, 120) ?? null,
      confidence: clampConfidence(parsed.confidence),
      review_level: reviewLevel,
      review_reason:
        cleanNullableText(parsed.review_reason)?.slice(0, 500) ?? null,
    };
  } catch {
    return null;
  }
}

function buildTranscript(rows: ConversationRow[]) {
  const parts: string[] = [];

  for (const row of rows) {
    if (row.mensagem) parts.push(`CLIENTE: ${row.mensagem}`);

    if (row.resposta) {
      const who =
        row.response_origin === "ai"
          ? "IA DA CLÍNICA"
          : row.response_origin === "whatsapp_human"
            ? "EQUIPE NO WHATSAPP"
            : row.response_origin === "crm_human"
              ? "EQUIPE NO CRM"
              : "EQUIPE";
      parts.push(`${who}: ${row.resposta}`);
    }
  }

  return parts.join("\n");
}

function stageThreshold(stageName: string) {
  const normalized = normalizeText(stageName);

  if (normalized === "em negociacao") return 0.72;
  if (normalized === "agendado") return 0.9;
  if (normalized === "compareceu") return 0.95;

  return 0.9;
}

function canMoveAutomatically(
  currentStage: StageRow | undefined,
  suggestedStage: StageRow | null,
  confidence: number
) {
  if (!currentStage || !suggestedStage) return false;
  if (suggestedStage.is_final) return false;
  if (suggestedStage.position <= currentStage.position) return false;

  const currentName = normalizeText(currentStage.name);
  const suggestedName = normalizeText(suggestedStage.name);

  if (currentName === "novo" && suggestedName === "em negociacao") {
    return confidence >= 0.72;
  }

  return confidence >= stageThreshold(suggestedStage.name);
}

async function generateAnalysis(
  lead: LeadRow,
  stages: StageRow[],
  transcript: string
): Promise<ObserverResult | null> {
  if (!transcript.trim()) return null;

  const currentStage =
    stages.find((stage) => stage.id === lead.stage_id)?.name ?? null;

  const availableStages = [...stages]
    .sort((a, b) => a.position - b.position)
    .map((stage) => stage.name);

  const system = `Você é uma IA OBSERVADORA de um CRM de uma clínica de estética.
Você NÃO conversa com o cliente e NÃO escreve respostas de atendimento.
Sua função é analisar silenciosamente a conversa entre cliente, equipe humana e eventualmente outra IA.

Retorne SOMENTE JSON válido, sem markdown, exatamente com estas chaves:
{
  "summary": "resumo operacional curto da conversa",
  "interest": "principal procedimento/objetivo do cliente ou null",
  "next_action": "próxima ação operacional recomendada",
  "suggested_stage_name": "nome EXATO de uma etapa disponível ou null",
  "confidence": 0.0,
  "review_level": "normal|attention|urgent",
  "review_reason": "motivo curto ou null"
}

REGRAS DE ETAPA:
- Etapas disponíveis: ${JSON.stringify(availableStages)}
- Etapa atual: ${JSON.stringify(currentStage)}
- Só sugira uma etapa se houver evidência clara na conversa.
- Nunca sugira voltar para uma etapa anterior.
- "Em negociação": há interesse real, conversa sobre preço, procedimento, condições, avaliação ou disponibilidade.
- Se o cliente já demonstrou claramente interesse comercial ou está conversando sobre um procedimento, "Em negociação" pode ter confiança entre 0.75 e 0.89; não precisa reservar 0.90 apenas para essa etapa.
- "Agendado": somente se houver confirmação concreta de dia/horário ou evidência inequívoca de agendamento.
- "Compareceu": somente se houver evidência inequívoca de que o atendimento/avaliação ocorreu.
- Não invente "Fechado" apenas porque o cliente demonstrou interesse. Venda é confirmada por outro sistema.
- Se não houver segurança, suggested_stage_name deve ser null.

REVISÃO HUMANA:
- urgent: reclamação séria, possível reação/problema após procedimento, risco clínico, ameaça, questão jurídica, cliente muito irritado, conflito grave ou situação sensível.
- attention: risco de perda, insatisfação, negociação excepcional, desconto fora do padrão, conversa confusa/contraditória, baixa segurança ou situação que merece conferência.
- normal: atendimento comum sem sinal relevante.
- Se review_level for normal, review_reason deve ser null.

CONFIDENCE:
- Seja conservadora.
- Para "Agendado" e "Compareceu", use confiança alta somente quando houver evidência objetiva.
- Para "Em negociação", interesse comercial claro já é evidência suficiente mesmo que a confiança fique abaixo de 0.90.

Não dê diagnóstico médico. Não invente fatos.`;

  const response = await anthropicObserver.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system,
    messages: [
      {
        role: "user",
        content: `LEAD: ${lead.name ?? "Sem nome"}
INTERESSE ATUAL: ${lead.interest ?? "A definir"}

CONVERSA:
${transcript}`,
      },
    ],
  });

  const block = response.content[0];
  if (block?.type !== "text") return null;

  return parseObserverJson(block.text);
}

function chooseReviewLevel(
  currentLevel: ReviewLevel | null,
  currentReason: string | null,
  nextLevel: ReviewLevel,
  nextReason: string | null
) {
  const currentIsOpen =
    currentLevel === "attention" || currentLevel === "urgent";

  if (currentIsOpen && nextLevel === "normal") {
    return { level: currentLevel, reason: currentReason };
  }

  if (currentLevel === "urgent" && nextLevel === "attention") {
    return { level: currentLevel, reason: currentReason };
  }

  return { level: nextLevel, reason: nextReason };
}

export async function analyzeWhatsAppConversationSilently(
  supabase: any,
  input: { phoneRaw: string; phoneE164: string }
) {
  try {
    const { data: leadData, error: leadError } = await supabase
      .from("leads")
      .select(
        "id,name,phone_raw,phone_e164,interest,interests,stage_id,ai_review_level,ai_review_reason"
      )
      .eq("phone_e164", input.phoneE164)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (leadError || !leadData?.id) {
      if (leadError) {
        console.error("IA OBSERVADORA - erro ao buscar lead:", leadError);
      }
      return;
    }

    const lead = leadData as LeadRow;

    const [
      { data: stagesData, error: stagesError },
      { data: historyData, error: historyError },
    ] = await Promise.all([
      supabase
        .from("stages")
        .select("id,name,position,is_final")
        .order("position", { ascending: true }),
      supabase
        .from("whatsapp_conversas")
        .select("mensagem,resposta,response_origin,created_at,response_at")
        .eq("telefone_cliente", input.phoneRaw)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (stagesError || historyError) {
      console.error(
        "IA OBSERVADORA - erro ao carregar contexto:",
        stagesError ?? historyError
      );
      return;
    }

    const stages = (stagesData ?? []) as StageRow[];
    const history = ((historyData ?? []) as ConversationRow[]).reverse();
    const transcript = buildTranscript(history);

    const analysis = await generateAnalysis(lead, stages, transcript);
    if (!analysis) return;

    const currentStage = stages.find((stage) => stage.id === lead.stage_id);
    const suggestedStage: StageRow | null = analysis.suggested_stage_name
      ? stages.find(
          (stage) =>
            normalizeText(stage.name) ===
            normalizeText(analysis.suggested_stage_name)
        ) ?? null
      : null;

    const review = chooseReviewLevel(
      lead.ai_review_level,
      lead.ai_review_reason,
      analysis.review_level,
      analysis.review_reason
    );

    const update: Record<string, unknown> = {
      ai_summary: analysis.summary || null,
      ai_next_action: analysis.next_action || null,
      ai_confidence: analysis.confidence,
      ai_suggested_stage: analysis.suggested_stage_name,
      ai_last_analyzed_at: new Date().toISOString(),
      ai_review_level: review.level,
      ai_review_reason: review.reason,
    };

    const shouldMoveStage = canMoveAutomatically(
      currentStage,
      suggestedStage,
      analysis.confidence
    );

    if (shouldMoveStage && suggestedStage) {
      update.stage_id = suggestedStage.id;
    }

    if (analysis.interest && analysis.confidence >= 0.8) {
      const existingInterests = Array.isArray(lead.interests)
        ? lead.interests.filter(Boolean)
        : [];

      const alreadyExists = existingInterests.some(
        (item) => normalizeText(item) === normalizeText(analysis.interest)
      );

      if (!alreadyExists) {
        update.interests = [...existingInterests, analysis.interest];
      }

      if (!lead.interest || normalizeText(lead.interest) === "a definir") {
        update.interest = analysis.interest;
      }
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update(update)
      .eq("id", lead.id)
      .select("id,stage_id")
      .maybeSingle();

    if (updateError) {
      console.error("IA OBSERVADORA - erro ao atualizar lead:", updateError);
      return;
    }

    if (
      shouldMoveStage &&
      suggestedStage &&
      updatedLead?.stage_id !== suggestedStage.id
    ) {
      console.error(
        "IA OBSERVADORA - stage_id nao foi confirmado apos update:",
        {
          leadId: lead.id,
          esperado: suggestedStage.id,
          recebido: updatedLead?.stage_id ?? null,
          etapaSugerida: suggestedStage.name,
          confidence: analysis.confidence,
        }
      );
    }
  } catch (error) {
    console.error("IA OBSERVADORA - erro inesperado:", error);
  }
}
