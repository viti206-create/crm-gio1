import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { normalizePhoneE164 } from "@/lib/phone";
import Anthropic from "@anthropic-ai/sdk";

// Rota chamada de hora em hora pelo Supabase (pg_cron).
// Reaborda UMA vez o cliente que nao respondeu a IA, dentro da janela de 24h
// do WhatsApp (usamos 23h de margem), sem chamar quem ja esta resolvido.
//
// SEGURANCA:
//  - exige o header "Authorization: Bearer <REABORDAGEM_SECRET>"
//  - so ENVIA de verdade se REABORDAGEM_ATIVA=true (senao funciona em modo teste)
//  - "?dry=1" na URL forca o modo teste mesmo com REABORDAGEM_ATIVA=true

export const maxDuration = 60;

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>;

const ESPERA_APOS_IA_MS = 3 * 60 * 60 * 1000; // 3 horas
const ESPERA_APOS_ABERTURA_MS = 60 * 60 * 1000; // 1 hora depois de abrir
const JANELA_MAXIMA_MS = 23 * 60 * 60 * 1000; // margem de seguranca das 24h
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000; // UTC-3 (sem horario de verao)
const MAX_POR_EXECUCAO = 5;
const MAX_HISTORICO = 10;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

type ConversaRow = {
  telefone_cliente: string;
  mensagem: string | null;
  resposta: string | null;
  created_at: string;
  response_at: string | null;
  response_origin: string | null;
};

type LeadRow = {
  id: string;
  name: string | null;
  phone_e164: string | null;
  ia_pausada: boolean | null;
  ultima_intervencao_humana: string | null;
  reabordagem_em: string | null;
};

// ---------- horario de funcionamento ----------

// [abre, fecha] em minutos do dia; null = fechado
function horarioDoDia(diaSemana: number): [number, number] | null {
  if (diaSemana === 0) return null;
  if (diaSemana === 6) return [9 * 60, 13 * 60];
  return [11 * 60, 20 * 60];
}

function dentroDoExpediente(instante: Date): boolean {
  const local = new Date(instante.getTime() - OFFSET_BRASILIA_MS);
  const horario = horarioDoDia(local.getUTCDay());
  if (!horario) return false;
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes();
  return minutos >= horario[0] && minutos < horario[1];
}

// Proxima abertura da clinica estritamente depois do instante informado
function proximaAbertura(depoisDe: Date): Date {
  const local = new Date(depoisDe.getTime() - OFFSET_BRASILIA_MS);
  const diaBase = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate()
  );

  for (let i = 0; i <= 8; i++) {
    const dia = new Date(diaBase + i * 24 * 60 * 60 * 1000);
    const horario = horarioDoDia(dia.getUTCDay());
    if (!horario) continue;

    const abertura = new Date(
      dia.getTime() + horario[0] * 60 * 1000 + OFFSET_BRASILIA_MS
    );
    if (abertura.getTime() > depoisDe.getTime()) return abertura;
  }

  return new Date(depoisDe.getTime() + 24 * 60 * 60 * 1000);
}

// Momento em que a reabordagem fica "devida":
//  - 3h depois da ultima mensagem da IA, se isso cair dentro do expediente;
//  - senao, 1h depois da proxima abertura da clinica.
function momentoDevido(ultimaMensagemIA: Date): Date {
  const base = new Date(ultimaMensagemIA.getTime() + ESPERA_APOS_IA_MS);
  if (dentroDoExpediente(base)) return base;

  return new Date(proximaAbertura(base).getTime() + ESPERA_APOS_ABERTURA_MS);
}

// Quando um HUMANO entrou na conversa: so reabordamos no DIA SEGUINTE (dia de
// funcionamento), 1h depois de abrir, sempre antes da janela de 24h fechar
// (deixamos 1h de folga para a execucao horaria nao perder o prazo).
// Retorna null se nao der tempo.
function momentoDevidoAposHumano(
  ultimaLinha: Date,
  ultimoCliente: Date
): Date | null {
  const local = new Date(ultimaLinha.getTime() - OFFSET_BRASILIA_MS);
  const inicioProximoDia = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + 1
    ) + OFFSET_BRASILIA_MS
  );

  const abertura = proximaAbertura(new Date(inicioProximoDia.getTime() - 1));
  const padrao = new Date(abertura.getTime() + ESPERA_APOS_ABERTURA_MS);
  const limite = new Date(
    ultimoCliente.getTime() + JANELA_MAXIMA_MS - 60 * 60 * 1000
  );

  const devido = padrao.getTime() <= limite.getTime() ? padrao : limite;
  if (devido.getTime() < abertura.getTime()) return null;

  return devido;
}

// Linha escrita por um humano (app do celular ou painel do CRM)
function ehLinhaHumana(l: ConversaRow) {
  return (
    l.response_origin === "whatsapp_human" ||
    (l.response_origin == null && l.mensagem == null && l.resposta != null)
  );
}

// ---------- utilidades ----------

const REGEX_NAO_QUER =
  /\b(pare|parar|n[aã]o quero|n[aã]o tenho interesse|sem interesse|sair|descadastr\w*|remover|spam|bloquear|me tire|n[aã]o me chame)\b/i;

async function iaPausadaGlobalmente(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("global_settings")
    .select("ia_pausada_globalmente")
    .eq("id", 1)
    .single();

  if (error) {
    // Por seguranca, se nao conseguimos checar, NAO reabordamos
    console.error("Reabordagem: erro ao checar pausa global:", error);
    return true;
  }

  return Boolean(data?.ia_pausada_globalmente);
}

async function enviarMensagemWhatsApp(numeroCliente: string, texto: string) {
  const response = await fetch(
    `https://api.dualhook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DUALHOOK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numeroCliente,
        type: "text",
        text: { body: texto },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Falha ao enviar reabordagem: ${response.status} - ${errorBody}`
    );
  }
}

async function gerarMensagemReabordagem(
  historico: ConversaRow[],
  nome: string | null
) {
  const system = `Você é a assistente virtual da GIO Boituva, uma clínica de estética. Você está retomando uma conversa de WhatsApp em que o cliente parou de responder.

Escreva UMA mensagem curta (no máximo 2 frases, em um único parágrafo) retomando de forma leve e simpática o último assunto da conversa, convidando o cliente a continuar. ${
    nome ? `O nome do cliente é ${nome}; use-o uma vez, com naturalidade.` : ""
  }

Regras:
- Tom acolhedor, educado e profissional. No máximo 1 emoji.
- Não pressione, não use urgência nem promoções.
- Não repita a apresentação nem a saudação inicial.
- Não explique procedimentos, não fale de preços, boleto ou pagamento recorrente.
- Não invente informações. Não mencione outras clínicas.
- NUNCA use negrito nem asteriscos. Só texto simples.
- Responda apenas com o texto da mensagem.`;

  const mensagens: Anthropic.MessageParam[] = [];

  for (const item of historico) {
    if (item.mensagem) mensagens.push({ role: "user", content: item.mensagem });
    if (item.resposta) {
      mensagens.push({ role: "assistant", content: item.resposta });
    }
  }

  mensagens.push({
    role: "user",
    content:
      "[Instrução interna: o cliente não respondeu. Escreva a mensagem de retomada agora.]",
  });

  const resposta = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    system,
    messages: mensagens,
  });

  const bloco = resposta.content[0];
  const texto = bloco.type === "text" ? bloco.text : "";

  return texto.replace(/\*+/g, "").trim();
}

// ---------- rota ----------

export async function POST(req: NextRequest) {
  return executar(req);
}

export async function GET(req: NextRequest) {
  return executar(req);
}

async function executar(req: NextRequest) {
  const secret = process.env.REABORDAGEM_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const modoTeste =
    process.env.REABORDAGEM_ATIVA !== "true" ||
    req.nextUrl.searchParams.get("dry") === "1";

  const agora = new Date();
  const supabase = createSupabaseServerClient();

  // Fora do expediente nunca enviamos
  if (!dentroDoExpediente(agora)) {
    return NextResponse.json({ ok: true, motivo: "fora_do_expediente" });
  }

  if (await iaPausadaGlobalmente(supabase)) {
    return NextResponse.json({ ok: true, motivo: "ia_pausada_globalmente" });
  }

  // Conversas das ultimas 26h (a janela do WhatsApp e de 24h)
  const desde = new Date(agora.getTime() - 26 * 60 * 60 * 1000).toISOString();

  const { data: linhas, error } = await supabase
    .from("whatsapp_conversas")
    .select(
      "telefone_cliente, mensagem, resposta, created_at, response_at, response_origin"
    )
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Agrupa por telefone (cada lista fica da mais nova para a mais antiga)
  const porTelefone = new Map<string, ConversaRow[]>();
  for (const linha of (linhas ?? []) as ConversaRow[]) {
    const lista = porTelefone.get(linha.telefone_cliente) ?? [];
    lista.push(linha);
    porTelefone.set(linha.telefone_cliente, lista);
  }

  type Candidato = {
    telefone: string;
    phoneE164: string;
    ultimaIA: Date;
    ultimoCliente: Date;
    devido: Date;
    historico: ConversaRow[];
    ultimaMensagemCliente: string;
  };

  const candidatos: Candidato[] = [];

  for (const [telefone, lista] of porTelefone.entries()) {
    const ultima = lista[0];

    // A ultima coisa da conversa tem que ser uma resposta (da IA ou de um humano)
    // e o cliente nao pode ter respondido depois.
    const ultimaEhHumana = ehLinhaHumana(ultima);
    if (!ultima.resposta) continue;
    if (!ultimaEhHumana && ultima.response_origin !== "ai") continue;

    // Nunca se ja houve reabordagem
    if (lista.some((l) => l.response_origin === "ai_reabordagem")) continue;

    const humanoEntrou = lista.some(ehLinhaHumana);

    const linhaCliente = lista.find((l) => l.mensagem);
    if (!linhaCliente) continue;

    const phoneE164 = normalizePhoneE164(telefone);
    if (!phoneE164) continue;

    if (REGEX_NAO_QUER.test(linhaCliente.mensagem ?? "")) continue;

    const ultimaMensagem = new Date(ultima.response_at ?? ultima.created_at);
    const ultimoCliente = new Date(linhaCliente.created_at);

    const devido = humanoEntrou
      ? momentoDevidoAposHumano(ultimaMensagem, ultimoCliente)
      : momentoDevido(ultimaMensagem);

    if (!devido) continue;

    // Ainda nao chegou a hora
    if (agora.getTime() < devido.getTime()) continue;

    // Janela do WhatsApp quase fechando (ou fechada): nao da mais para enviar
    if (agora.getTime() > ultimoCliente.getTime() + JANELA_MAXIMA_MS) continue;

    candidatos.push({
      telefone,
      phoneE164,
      ultimaIA: ultimaMensagem,
      ultimoCliente,
      devido,
      historico: [...lista].reverse().slice(-MAX_HISTORICO),
      ultimaMensagemCliente: linhaCliente.mensagem ?? "",
    });
  }

  if (candidatos.length === 0) {
    return NextResponse.json({ ok: true, modoTeste, candidatos: 0 });
  }

  // Dados dos leads
  const { data: leadsData, error: leadsError } = await supabase
    .from("leads")
    .select(
      "id, name, phone_e164, ia_pausada, ultima_intervencao_humana, reabordagem_em"
    )
    .in(
      "phone_e164",
      candidatos.map((c) => c.phoneE164)
    );

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const leadPorTelefone = new Map<string, LeadRow>();
  for (const lead of (leadsData ?? []) as LeadRow[]) {
    if (lead.phone_e164 && !leadPorTelefone.has(lead.phone_e164)) {
      leadPorTelefone.set(lead.phone_e164, lead);
    }
  }

  // Quem ja tem agendamento nunca e reabordado
  const idsLeads = [...leadPorTelefone.values()].map((l) => l.id);
  const comAgendamento = new Set<string>();

  if (idsLeads.length > 0) {
    const { data: agendamentos } = await supabase
      .from("appointments")
      .select("lead_id")
      .in("lead_id", idsLeads);

    for (const a of agendamentos ?? []) {
      comAgendamento.add(a.lead_id as string);
    }
  }

  const resultado: Array<Record<string, unknown>> = [];
  let enviados = 0;

  for (const c of candidatos) {
    const lead = leadPorTelefone.get(c.phoneE164);

    const motivoDescarte = !lead
      ? "lead_nao_encontrado"
      : lead.ia_pausada
        ? "ia_pausada_no_lead"
        : lead.reabordagem_em
            ? "ja_reabordado"
            : comAgendamento.has(lead.id)
              ? "ja_tem_agendamento"
              : null;

    if (motivoDescarte || !lead) {
      resultado.push({ telefone: c.telefone, descartado: motivoDescarte });
      continue;
    }

    if (enviados >= MAX_POR_EXECUCAO) {
      resultado.push({ telefone: c.telefone, adiado: "limite_por_execucao" });
      continue;
    }

    if (modoTeste) {
      resultado.push({
        telefone: c.telefone,
        nome: lead.name,
        seria_reabordado: true,
        devido_em: c.devido.toISOString(),
        ultima_msg_cliente: c.ultimaMensagemCliente.slice(0, 80),
      });
      continue;
    }

    try {
      const texto = await gerarMensagemReabordagem(c.historico, lead.name);
      if (!texto) {
        resultado.push({ telefone: c.telefone, erro: "mensagem_vazia" });
        continue;
      }

      await enviarMensagemWhatsApp(c.telefone, texto);

      const agoraIso = new Date().toISOString();

      await supabase.from("whatsapp_conversas").insert({
        numero_origem: process.env.WHATSAPP_PHONE_NUMBER_ID,
        telefone_cliente: c.telefone,
        mensagem: null,
        resposta: texto,
        response_at: agoraIso,
        response_origin: "ai_reabordagem",
        conversation_status: "aguardando_cliente",
      });

      await supabase
        .from("leads")
        .update({ reabordagem_em: agoraIso })
        .eq("id", lead.id);

      enviados++;
      resultado.push({ telefone: c.telefone, enviado: true });
    } catch (erro) {
      console.error("Erro na reabordagem de", c.telefone, erro);
      resultado.push({
        telefone: c.telefone,
        erro: erro instanceof Error ? erro.message : "erro_desconhecido",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    modoTeste,
    candidatos: candidatos.length,
    enviados,
    resultado,
  });
}