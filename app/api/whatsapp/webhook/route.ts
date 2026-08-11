import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { normalizePhoneE164 } from "@/lib/phone";
import Anthropic from "@anthropic-ai/sdk";

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>;

type LeadRow = {
  id: string;
  created_at?: string | null;
  name?: string | null;
  phone_raw?: string | null;
  phone_e164?: string | null;
  source?: string | null;
  interest?: string | null;
  stage_id?: string | null;
  ia_pausada?: boolean | null;
  ultima_intervencao_humana?: string | null;
};

type StageRow = {
  id: string;
};

type ConversaRow = {
  mensagem: string | null;
  resposta: string | null;
  created_at?: string | null;
};

type WhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
  image?: {
    caption?: string;
    mime_type?: string;
  };
  video?: {
    caption?: string;
    mime_type?: string;
  };
  audio?: {
    mime_type?: string;
  };
  document?: {
    caption?: string;
    filename?: string;
    mime_type?: string;
  };
  sticker?: {
    mime_type?: string;
  };
  button?: {
    text?: string;
  };
  interactive?: {
    button_reply?: {
      title?: string;
    };
    list_reply?: {
      title?: string;
      description?: string;
    };
  };
  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  };
  contacts?: Array<{
    name?: {
      formatted_name?: string;
    };
  }>;
  referral?: {
    source_url?: string;
    source_type?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
  };
};

type MessageEcho = {
  id?: string;
  to?: string;
  from?: string;
  timestamp?: string;
  type?: string;
};

type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{
          wa_id?: string;
          profile?: {
            name?: string;
          };
        }>;
        messages?: WhatsAppMessage[];
        message_echoes?: MessageEcho[];
        statuses?: Array<unknown>;
      };
    }>;
  }>;
};

type IncomingMessage = {
  messageId: string;
  phoneRaw: string;
  phoneE164: string;
  contactName: string | null;
  message: string;
  timestamp: string | null;
  channel: "whatsapp";
  direction: "inbound";
  campaignName: string | null;
  campaignSourceId: string | null;
};

const FALLBACK_INTEREST = "A definir";
const DEFAULT_SOURCE = "outros";
const DEFAULT_CHANNEL = "whatsapp";
const DEFAULT_DIRECTION = "inbound";
const DEFAULT_CREATED_BY = "18896cbe-849b-4091-9ea3-73ed6f6a6523";
const MAX_HISTORICO_MENSAGENS = 10;
const MARCADOR_HANDOFF = "[HANDOFF_HUMANO]";
const MENSAGEM_HANDOFF =
  "Entendo! Vou chamar alguém da nossa equipe pra te ajudar melhor com isso. Só um momento 🙋‍♀️";
// Formato esperado: [AGENDAMENTO_CONFIRMADO: 2026-08-10T14:30:00-03:00 | Nome do procedimento]
const REGEX_AGENDAMENTO =
  /\[AGENDAMENTO_CONFIRMADO:\s*([^\|]+?)\s*\|\s*([^\]]+?)\s*\]/;
const PAUSA_APOS_HUMANO_MS = 60 * 60 * 1000; // 1 hora

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getWebhookVerifyToken() {
  return (
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    ""
  );
}

function toIsoTimestamp(timestamp: string | null | undefined) {
  const raw = String(timestamp ?? "").trim();

  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const asNumber = Number(raw);
    const millis = raw.length <= 10 ? asNumber * 1000 : asNumber;
    const date = new Date(millis);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return raw;
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

// Corrige formatação de negrito para o padrão do WhatsApp
// (WhatsApp usa *texto* para negrito, não **texto** como markdown comum)
function corrigirFormatacaoWhatsApp(texto: string) {
  return texto.replace(/\*\*(.+?)\*\*/g, "*$1*");
}

function extractMessageText(message: WhatsAppMessage) {
  const type = String(message?.type ?? "").trim().toLowerCase();

  if (type === "text") {
    return trimOrNull(message?.text?.body) ?? "[mensagem sem texto]";
  }

  if (type === "button") {
    return trimOrNull(message?.button?.text) ?? "[botao]";
  }

  if (type === "interactive") {
    const buttonReply = trimOrNull(message?.interactive?.button_reply?.title);
    if (buttonReply) return buttonReply;

    const listTitle = trimOrNull(message?.interactive?.list_reply?.title);
    const listDescription = trimOrNull(
      message?.interactive?.list_reply?.description
    );

    if (listTitle && listDescription) return `${listTitle} - ${listDescription}`;
    if (listTitle) return listTitle;
  }

  if (type === "image") {
    return trimOrNull(message?.image?.caption) ?? "[imagem recebida]";
  }

  if (type === "video") {
    return trimOrNull(message?.video?.caption) ?? "[video recebido]";
  }

  if (type === "audio") {
    return "[audio recebido]";
  }

  if (type === "document") {
    const caption = trimOrNull(message?.document?.caption);
    if (caption) return caption;

    const filename = trimOrNull(message?.document?.filename);
    if (filename) return `[documento recebido] ${filename}`;

    return "[documento recebido]";
  }

  if (type === "sticker") {
    return "[sticker recebido]";
  }

  if (type === "location") {
    const name = trimOrNull(message?.location?.name);
    const address = trimOrNull(message?.location?.address);

    if (name && address) return `[localizacao] ${name} - ${address}`;
    if (name) return `[localizacao] ${name}`;
    if (address) return `[localizacao] ${address}`;

    const latitude = message?.location?.latitude;
    const longitude = message?.location?.longitude;

    if (latitude != null && longitude != null) {
      return `[localizacao] ${latitude}, ${longitude}`;
    }

    return "[localizacao recebida]";
  }

  if (type === "contacts") {
    const formattedName = trimOrNull(
      message?.contacts?.[0]?.name?.formatted_name
    );
    return formattedName
      ? `[contato compartilhado] ${formattedName}`
      : "[contato compartilhado]";
  }

  return `[${type || "mensagem"} recebida]`;
}

function extractIncomingMessages(body: WhatsAppWebhookPayload) {
  const events: IncomingMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;

      if (!value?.messages?.length) continue;

      for (const message of value.messages) {
        const messageId = trimOrNull(message.id);
        const phoneRaw =
          trimOrNull(message.from) ?? trimOrNull(value.contacts?.[0]?.wa_id);
        const phoneE164 = normalizePhoneE164(phoneRaw);

        if (!messageId || !phoneRaw || !phoneE164) {
          continue;
        }

        const matchingContact =
          value.contacts?.find((contact) => contact.wa_id === phoneRaw) ??
          value.contacts?.find(
            (contact) => normalizePhoneE164(contact.wa_id) === phoneE164
          ) ??
          value.contacts?.[0];

        events.push({
          messageId,
          phoneRaw,
          phoneE164,
          contactName: trimOrNull(matchingContact?.profile?.name),
          message: extractMessageText(message),
          timestamp: toIsoTimestamp(message.timestamp),
          channel: DEFAULT_CHANNEL,
          direction: DEFAULT_DIRECTION,
          // Se a mensagem veio de um anuncio Click-to-WhatsApp, a Meta manda
          // esses dados junto na PRIMEIRA mensagem da conversa (nao vem em
          // mensagens seguintes do mesmo contato).
          campaignName: trimOrNull(message.referral?.headline),
          campaignSourceId: trimOrNull(message.referral?.source_id),
        });
      }
    }
  }

  return events;
}

// Extrai números de telefone que receberam mensagem de um humano via app
function extractHumanEchoPhones(body: WhatsAppWebhookPayload) {
  const telefones: string[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "smb_message_echoes") continue;

      const echoes = change.value?.message_echoes ?? [];

      for (const echo of echoes) {
        const destino = trimOrNull(echo.to);
        const normalizado = normalizePhoneE164(destino);
        if (normalizado) {
          telefones.push(normalizado);
        }
      }
    }
  }

  return telefones;
}

async function getDefaultStageId(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("stages")
    .select("id")
    .order("position", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`Nao consegui carregar stages: ${error.message}`);
  }

  const stage = (data?.[0] ?? null) as StageRow | null;

  if (!stage?.id) {
    throw new Error("Nenhum stage disponivel para novos leads");
  }

  return stage.id;
}

async function findExistingLead(supabase: SupabaseClient, phoneE164: string) {
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id,created_at,name,phone_raw,phone_e164,source,interest,stage_id,ia_pausada,ultima_intervencao_humana"
    )
    .eq("phone_e164", phoneE164)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Nao consegui buscar lead por telefone: ${error.message}`);
  }

  const leads = (data ?? []) as LeadRow[];
  const lead = leads[0] ?? null;

  return {
    lead,
    duplicatesFound: leads.length,
  };
}

// CORRIGIDO: verifica duplicidade direto na tabela whatsapp_conversas,
// que e a que realmente e preenchida (a tabela "activities" nunca era populada
// com type "contact_whatsapp", entao a checagem antiga nunca encontrava nada
// e mensagens duplicadas do WhatsApp/Dualhook eram sempre processadas de novo).
async function hasProcessedMessage(
  supabase: SupabaseClient,
  messageId: string
) {
  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .select("id")
    .eq("message_id", messageId)
    .limit(1);

  if (error) {
    throw new Error(`Nao consegui validar idempotencia: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

// NOVO: "reivindica" a mensagem no banco IMEDIATAMENTE, antes de qualquer
// processamento demorado (IA, atraso de digitacao, envio). Isso fecha a janela
// de corrida: se dois webhooks para a MESMA mensagem chegarem quase juntos
// (comum quando a Meta reenvia por demora na resposta), o segundo vai bater
// na restricao UNIQUE(message_id) do banco e sabemos que e duplicata --
// mesmo que os dois tenham passado pela checagem "hasProcessedMessage" antes
// de qualquer um terminar de salvar.
async function claimMessage(
  supabase: SupabaseClient,
  telefoneCliente: string,
  mensagem: string,
  messageId: string
) {
  const { error } = await supabase.from("whatsapp_conversas").insert({
    numero_origem: process.env.WHATSAPP_PHONE_NUMBER_ID,
    telefone_cliente: telefoneCliente,
    mensagem,
    resposta: null,
    message_id: messageId,
  });

  if (error) {
    // codigo 23505 = violacao de restricao UNIQUE no Postgres/Supabase
    if (error.code === "23505") {
      return { claimed: false };
    }
    throw new Error(`Nao consegui reivindicar mensagem: ${error.message}`);
  }

  return { claimed: true };
}

// NOVO: atualiza a resposta da IA na mesma linha ja reivindicada,
// em vez de inserir uma linha nova (evita duplicar a mensagem do cliente)
async function atualizarRespostaConversa(
  supabase: SupabaseClient,
  messageId: string,
  resposta: string
) {
  await supabase
    .from("whatsapp_conversas")
    .update({ resposta })
    .eq("message_id", messageId);
}

async function createLead(
  supabase: SupabaseClient,
  event: IncomingMessage,
  defaultStageId: string
) {
  const insertPayload = {
    name: event.contactName ?? event.phoneRaw,
    phone_raw: event.phoneRaw,
    phone_e164: event.phoneE164,
    source: DEFAULT_SOURCE,
    interest: FALLBACK_INTEREST,
    stage_id: defaultStageId,
    created_by: DEFAULT_CREATED_BY,
    campaign: event.campaignName ?? event.campaignSourceId ?? null,
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(insertPayload)
    .select(
      "id,created_at,name,phone_raw,phone_e164,source,interest,stage_id,ia_pausada,ultima_intervencao_humana"
    )
    .single();

  if (error) {
    throw new Error(`Nao consegui criar lead: ${error.message}`);
  }

  return data as LeadRow;
}

async function updateLead(
  supabase: SupabaseClient,
  lead: LeadRow,
  event: IncomingMessage,
  defaultStageId: string
) {
  const updatePayload: Record<string, string> = {};

  if (event.phoneRaw && event.phoneRaw !== lead.phone_raw) {
    updatePayload.phone_raw = event.phoneRaw;
  }

  if (event.phoneE164 && event.phoneE164 !== lead.phone_e164) {
    updatePayload.phone_e164 = event.phoneE164;
  }

  if (!trimOrNull(lead.name) && event.contactName) {
    updatePayload.name = event.contactName;
  }

  if (!trimOrNull(lead.source)) {
    updatePayload.source = DEFAULT_SOURCE;
  }

  if (!trimOrNull(lead.interest)) {
    updatePayload.interest = FALLBACK_INTEREST;
  }

  if (!trimOrNull(lead.stage_id)) {
    updatePayload.stage_id = defaultStageId;
  }

  if (Object.keys(updatePayload).length === 0) {
    return lead;
  }

  const { data, error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", lead.id)
    .select(
      "id,created_at,name,phone_raw,phone_e164,source,interest,stage_id,ia_pausada,ultima_intervencao_humana"
    )
    .single();

  if (error) {
    throw new Error(`Nao consegui atualizar lead: ${error.message}`);
  }

  return data as LeadRow;
}

async function pausarIAparaLead(supabase: SupabaseClient, leadId: string) {
  await supabase.from("leads").update({ ia_pausada: true }).eq("id", leadId);
}

// Extrai o marcador [AGENDAMENTO_CONFIRMADO: ...] da resposta da IA, removendo-o
// do texto que sera enviado ao cliente (ele nunca deve ver esse texto tecnico).
function extrairAgendamento(respostaIA: string) {
  const match = respostaIA.match(REGEX_AGENDAMENTO);

  if (!match) {
    return { textoLimpo: respostaIA, agendamento: null };
  }

  const dataHoraStr = match[1].trim();
  const procedimento = match[2].trim();
  const textoLimpo = respostaIA.replace(REGEX_AGENDAMENTO, "").trim();

  const dataHora = new Date(dataHoraStr);

  if (Number.isNaN(dataHora.getTime())) {
    console.error(
      "Marcador de agendamento com data invalida, ignorando:",
      dataHoraStr
    );
    return { textoLimpo, agendamento: null };
  }

  return {
    textoLimpo,
    agendamento: {
      scheduledAt: dataHora.toISOString(),
      procedure: procedimento,
    },
  };
}

// PROTECAO INDEPENDENTE DA IA: valida o horario no CODIGO, nao so confiando
// que a IA seguiu a regra do prompt corretamente (modelos de linguagem podem
// falhar em regras numericas/condicionais, mesmo bem escritas no prompt).
// Retorna true se o horario esta dentro do expediente permitido para agendamento.
function horarioDentroDoExpediente(dataHoraISO: string): boolean {
  const dataHoraBrasilia = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(dataHoraISO));

  const partes: Record<string, string> = {};
  for (const parte of dataHoraBrasilia) {
    partes[parte.type] = parte.value;
  }

  const diaSemana = partes.weekday; // "Mon", "Tue", ..., "Sat", "Sun"
  const hora = Number(partes.hour);
  const minuto = Number(partes.minute);
  const minutosDoDia = hora * 60 + minuto;

  const SEGUNDA_A_SEXTA = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const INICIO_SEMANA = 11 * 60; // 11:00
  const FIM_SEMANA = 19 * 60 + 30; // 19:30
  const INICIO_SABADO = 9 * 60; // 09:00
  const FIM_SABADO = 13 * 60; // 13:00

  if (SEGUNDA_A_SEXTA.includes(diaSemana)) {
    return minutosDoDia >= INICIO_SEMANA && minutosDoDia <= FIM_SEMANA;
  }

  if (diaSemana === "Sat") {
    return minutosDoDia >= INICIO_SABADO && minutosDoDia <= FIM_SABADO;
  }

  return false; // domingo nunca e valido
}

// PROTECAO EXTRA: compara o dia da semana que o CLIENTE mencionou na mensagem
// (ex: "sexta-feira", "quinta") com o dia da semana REAL da data que a IA
// confirmou no marcador. Se o cliente mencionou um dia da semana especifico e
// ele nao bate com a data escolhida, e sinal de que a IA calculou errado.
function diaSemanaMencionadoBateComData(
  mensagemCliente: string,
  dataHoraISO: string
): boolean {
  const DIAS: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    terça: 2,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sábado: 6,
    sabado: 6,
  };

  const textoLower = mensagemCliente.toLowerCase();
  let diaMencionado: number | null = null;

  for (const [nome, indice] of Object.entries(DIAS)) {
    if (textoLower.includes(nome)) {
      diaMencionado = indice;
      break;
    }
  }

  // Cliente nao mencionou nenhum dia da semana por nome (so disse "amanha",
  // "dia 15", etc.) -- nao ha o que cruzar, entao consideramos valido.
  if (diaMencionado === null) return true;

  const diaReal = new Date(dataHoraISO).toLocaleString("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  });

  const DIAS_EN: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  return DIAS_EN[diaReal] === diaMencionado;
}

// Cria o registro na tabela appointments quando a IA confirma um agendamento.
// Isso e o que faz o compromisso aparecer no feed ICS/Google Agenda.
async function criarAgendamento(
  supabase: SupabaseClient,
  leadId: string,
  scheduledAt: string,
  procedure: string,
  notes: string | null = null
) {
  const { error } = await supabase.from("appointments").insert({
    lead_id: leadId,
    scheduled_at: scheduledAt,
    procedure,
    status: "agendado",
    created_by: DEFAULT_CREATED_BY,
    notes,
  });

  if (error) {
    console.error("Erro ao criar agendamento:", error);
  }
}

// Marca que um humano acabou de intervir manualmente numa conversa
async function marcarIntervencaoHumana(
  supabase: SupabaseClient,
  phoneE164: string
) {
  await supabase
    .from("leads")
    .update({ ultima_intervencao_humana: new Date().toISOString() })
    .eq("phone_e164", phoneE164);
}

function humanoAtivoRecentemente(lead: LeadRow) {
  if (!lead.ultima_intervencao_humana) return false;

  const ultimaIntervencao = new Date(lead.ultima_intervencao_humana).getTime();
  const agora = Date.now();

  return agora - ultimaIntervencao < PAUSA_APOS_HUMANO_MS;
}

// Verifica se a IA foi pausada globalmente pelo painel do CRM (afeta TODAS
// as conversas, inclusive novas, ate alguem reativar manualmente).
async function iaPausadaGlobalmente(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("global_settings")
    .select("ia_pausada_globalmente")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Erro ao checar pausa global da IA:", error);
    return false; // em caso de erro, nao bloqueia o atendimento por seguranca
  }

  return Boolean(data?.ia_pausada_globalmente);
}

async function buscarContextoClinica(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("clinica_conhecimento")
    .select("titulo, conteudo")
    .eq("ativo", true);

  if (error || !data) {
    return "";
  }

  return data.map((item) => `${item.titulo}: ${item.conteudo}`).join("\n\n");
}

async function buscarHistoricoConversa(
  supabase: SupabaseClient,
  telefoneCliente: string
) {
  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .select("mensagem, resposta, created_at")
    .eq("telefone_cliente", telefoneCliente)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORICO_MENSAGENS);

  if (error || !data) {
    return [];
  }

  return (data as ConversaRow[]).reverse();
}

function obterSaudacaoPeriodo(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date())
  );

  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function obterDataHojeFormatada(): string {
  const hoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const isoHoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return `${hoje} (${isoHoje})`;
}

function montarSystemPrompt(
  contextoClinica: string,
  ehPrimeiraMensagem: boolean,
  nomeConhecido: string | null
): string {
  const saudacao = obterSaudacaoPeriodo();
  const dataHoje = obterDataHojeFormatada();

  return `Você é o assistente virtual da GIO Boituva, uma clínica de estética facial e corporal. Sempre que se apresentar ou for perguntado, informe que você atende pela GIO Boituva.

Hoje é ${dataHoje}, horário de Brasília. Use essa informação para calcular corretamente datas relativas simples que o cliente mencionar (ex: "amanhã", "depois de amanhã").

REGRA IMPORTANTE SOBRE DIA DA SEMANA: NUNCA afirme ou mencione qual dia da semana corresponde a uma data (nunca diga "isso cai numa sexta-feira", "que é terça", etc.) — calcular isso de cabeça é fácil de errar. Ao confirmar um agendamento, mencione APENAS a data (dia/mês) e o horário, sem nomear o dia da semana. Se o cliente disser um dia da semana (ex: "quero sexta-feira"), apenas repita a data que ele mesmo informar ou pedir a data exata (dia/mês) para confirmar, sem você mesma calcular ou declarar qual dia da semana é.

Responda de forma breve e direta, como uma conversa real de WhatsApp — frases curtas, tom acolhedor, educado e profissional, podendo usar emojis com moderação. Evite gírias e cumprimentos excessivamente informais como "Opa", "Hey", "E aí" — prefira aberturas mais educadas como "Olá", "Oi", "Bom dia/Boa tarde/Boa noite".

REGRA DE TAMANHO (MUITO IMPORTANTE): seja extremamente objetiva. Use no máximo 2 a 4 frases curtas por resposta. Nunca escreva parágrafos longos. Se o cliente perguntar sobre um problema (ex: "tem tratamento pra mancha?"), cite NO MÁXIMO 1 ou 2 procedimentos relevantes, com uma frase curta cada — não liste 3, 4 ou mais opções de uma vez, e não explique tecnicamente como cada um funciona, a menos que o cliente peça mais detalhes especificamente. Termine com uma pergunta curta apenas se fizer sentido continuar o assunto, não em toda mensagem.

FORMATAÇÃO: se quiser destacar uma palavra, use APENAS um asterisco de cada lado, no padrão do WhatsApp (exemplo: *importante*). NUNCA use dois asteriscos de cada lado (like **importante**), isso não é o formato correto do WhatsApp. Use negrito com moderação, não é necessário em toda mensagem.

${
  ehPrimeiraMensagem
    ? `Esta é a PRIMEIRA mensagem dessa conversa. Cumprimente usando "${saudacao}!" seguido de um emoji apropriado ao período do dia, se apresente como assistente da GIO Boituva 💜 (sempre inclua esse coração roxo logo após "GIO Boituva" na apresentação), e pergunte como pode ajudar.`
    : `Esta NÃO é a primeira mensagem — não repita a saudação inicial nem a apresentação completa de novo.`
}

REGRA SOBRE PERGUNTAR O NOME:
${
  nomeConhecido
    ? `O nome do cliente já é conhecido: ${nomeConhecido}. Use o nome dele(a) na conversa quando fizer sentido, de forma natural.`
    : `O nome do cliente ainda não é conhecido. Pergunte o nome dele(a) UMA VEZ, de forma natural e gentil, preferencialmente logo no início da conversa. Se a pessoa não responder o nome ou preferir não informar, continue o atendimento normalmente sem insistir ou perguntar de novo.`
}

REGRA SOBRE OFERECER AVALIAÇÃO/AGENDAMENTO:
Não ofereça agendamento de avaliação em toda mensagem — isso soa insistente e incomoda o cliente. Só sugira agendar uma avaliação quando fizer sentido no contexto: quando o cliente já tirou as dúvidas principais e parece pronto para avançar, quando ele demonstrar interesse claro em algum procedimento, ou quando a pergunta dele exigir avaliação presencial para ser respondida com precisão.

REGRA SOBRE AGENDAMENTO DE HORÁRIO:
Se o cliente quiser marcar um horário, verifique se o horário pedido está dentro do funcionamento da clínica para AGENDAMENTOS: segunda a sexta, das 11h às 19h30 (último horário aceito é 19h30, pois a clínica encerra o expediente às 20h e precisa desse intervalo) — não atendemos fora desses dias/horários, exceto sábado das 9h às 13h conforme informado abaixo (nesse caso, o último horário aceito no sábado é 13h). Se o cliente pedir exatamente 20h ou depois, explique que o último horário do dia é 19h30 e pergunte se esse ou um horário mais cedo funciona para ele.

Quando o cliente confirmar um dia e horário válidos (dentro da faixa acima) E o procedimento de interesse já estiver claro na conversa, adicione ao FINAL da sua resposta o texto exato no formato: [AGENDAMENTO_CONFIRMADO: AAAA-MM-DDTHH:MM:00-03:00 | Nome do procedimento] — isso é um marcador interno, o cliente NUNCA deve ver esse texto, e você nunca deve mencioná-lo na conversa. Use sempre o ano correto com base na data de hoje, e o fuso -03:00 (horário de Brasília). Se o cliente não disse o ano, assuma o próximo dia/mês válido a partir de hoje. Depois de adicionar esse marcador, informe ao cliente de forma natural que o agendamento foi registrado e que a recepção da clínica vai entrar em contato para confirmar os detalhes finais.

Se o cliente quiser agendar mas ainda não ficou claro qual procedimento ele quer, pergunte isso primeiro antes de confirmar o agendamento — não gere o marcador sem saber o procedimento.

REGRA SOBRE TRANSFERIR PARA ATENDIMENTO HUMANO:
Se você não souber responder algo com base nas informações da clínica abaixo, se o cliente pedir explicitamente para falar com uma pessoa/atendente, ou se a pergunta exigir avaliação/julgamento humano que você não pode dar com segurança, você deve ENCERRAR o atendimento automatizado. Nesse caso, NUNCA diga que vai "passar o contato" ou sugerir outro canal — o cliente já está no canal de atendimento correto. Ao invés disso, adicione o texto exato "${MARCADOR_HANDOFF}" no final da sua resposta (isso é um marcador interno, o cliente não vai ver esse texto).

REGRAS OBRIGATÓRIAS ADICIONAIS:
- Nunca mencione, recomende ou compare com outras clínicas ou concorrentes, mesmo se perguntado diretamente.
- Responda APENAS sobre os procedimentos listados abaixo. Nunca mencione, confirme ou sugira procedimentos que não estejam nesta lista, mesmo que sejam comuns em outras clínicas de estética.
- Nunca dê conselhos médicos, diagnósticos ou opiniões técnicas sobre procedimentos.
- Use o histórico da conversa para entender o contexto e não repetir perguntas já respondidas.

INFORMAÇÕES DA CLÍNICA:
${contextoClinica}`;
}

async function gerarRespostaIA(
  mensagemCliente: string,
  contextoClinica: string,
  historico: ConversaRow[],
  nomeConhecido: string | null
) {
  const ehPrimeiraMensagem = historico.length === 0;
  const systemPrompt = montarSystemPrompt(
    contextoClinica,
    ehPrimeiraMensagem,
    nomeConhecido
  );

  const mensagensParaIA: Anthropic.MessageParam[] = [];

  for (const item of historico) {
    if (item.mensagem) {
      mensagensParaIA.push({ role: "user", content: item.mensagem });
    }
    if (item.resposta) {
      mensagensParaIA.push({ role: "assistant", content: item.resposta });
    }
  }

  mensagensParaIA.push({ role: "user", content: mensagemCliente });

  const resposta = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 180,
    system: systemPrompt,
    messages: mensagensParaIA,
  });

  const bloco = resposta.content[0];
  const textoOriginal = bloco.type === "text" ? bloco.text : "";
  return corrigirFormatacaoWhatsApp(textoOriginal);
}

// CORRIGIDO: agora envia via Dualhook (proxy oficial de coexistencia) em vez de
// direto para graph.facebook.com, e verifica se a resposta deu erro.
async function marcarComoLidoEDigitando(messageId: string) {
  try {
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
          status: "read",
          message_id: messageId,
          typing_indicator: { type: "text" },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Falha ao marcar como lido/digitando (status ${response.status}):`,
        errorBody
      );
    }
  } catch (erro) {
    console.error("Erro ao marcar como lido/digitando:", erro);
  }
}

// Calcula um atraso proposital antes de enviar,
// simulando tempo de digitacao humana (combina com o indicador "digitando...")
function calcularAtrasoDigitacao(texto: string) {
  const MINIMO_MS = 3000;
  const MAXIMO_MS = 8000;
  const msPorCaractere = 40;

  const calculado = texto.length * msPorCaractere;
  return Math.min(MAXIMO_MS, Math.max(MINIMO_MS, calculado));
}

function aguardar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// CORRIGIDO: agora envia via Dualhook (proxy oficial de coexistencia) em vez de
// direto para graph.facebook.com, e lanca erro explicito se a resposta falhar
// (antes falhava em silencio e a IA parecia simplesmente "nao responder").
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
    console.error(
      `Falha ao enviar mensagem WhatsApp (status ${response.status}):`,
      errorBody
    );
    throw new Error(
      `Falha ao enviar mensagem WhatsApp: ${response.status} - ${errorBody}`
    );
  }
}

// Notifica a equipe quando a IA transfere para humano
async function notificarEquipeHandoff(
  numeroCliente: string,
  nomeCliente: string | null,
  ultimaMensagem: string
) {
  const numeroAdmin = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!numeroAdmin) return;

  const texto = `⚠️ *Atenção necessária*\nCliente: ${
    nomeCliente ?? numeroCliente
  }\nTelefone: ${numeroCliente}\nÚltima mensagem: "${ultimaMensagem}"\n\nA IA identificou que esse atendimento precisa de um humano.`;

  try {
    await enviarMensagemWhatsApp(numeroAdmin, texto);
  } catch (erro) {
    console.error("Erro ao notificar equipe sobre handoff:", erro);
  }
}

async function processIncomingMessage(
  supabase: SupabaseClient,
  event: IncomingMessage,
  defaultStageId: string
) {
  const alreadyProcessed = await hasProcessedMessage(supabase, event.messageId);

  if (alreadyProcessed) {
    return {
      processed: false,
      duplicate: true,
      leadId: null as string | null,
      dedupeMode: "message_id",
      duplicateLeadsFound: 0,
    };
  }

  // Reivindica a mensagem JA, antes de qualquer processamento demorado.
  // Se outra requisicao paralela (reenvio da Meta) ja reivindicou essa mesma
  // mensagem entre a checagem acima e agora, "claimed" vem false e paramos aqui
  // -- isso e o que realmente elimina a duplicacao, nao so a checagem inicial.
  const { claimed } = await claimMessage(
    supabase,
    event.phoneRaw,
    event.message,
    event.messageId
  );

  if (!claimed) {
    return {
      processed: false,
      duplicate: true,
      leadId: null as string | null,
      dedupeMode: "message_id_race",
      duplicateLeadsFound: 0,
    };
  }

  const { lead: existingLead, duplicatesFound } = await findExistingLead(
    supabase,
    event.phoneE164
  );

  let lead: LeadRow;

  if (existingLead) {
    lead = await updateLead(supabase, existingLead, event, defaultStageId);
  } else {
    lead = await createLead(supabase, event, defaultStageId);
  }

  // Se a IA ja foi pausada de vez para esse lead (handoff), nao responde mais.
  // A mensagem do cliente ja foi salva pelo claimMessage acima, entao so
  // paramos por aqui.
  if (lead.ia_pausada) {
    return {
      processed: true,
      duplicate: false,
      leadId: lead.id,
      dedupeMode: existingLead ? "phone_e164" : "created",
      duplicateLeadsFound: duplicatesFound,
    };
  }

  // Pausa global do painel do CRM: afeta TODAS as conversas, inclusive essa,
  // mesmo que o lead individualmente nao esteja pausado.
  if (await iaPausadaGlobalmente(supabase)) {
    return {
      processed: true,
      duplicate: false,
      leadId: lead.id,
      dedupeMode: existingLead ? "phone_e164" : "created",
      duplicateLeadsFound: duplicatesFound,
    };
  }

  // Se um humano respondeu manualmente pelo app ha menos de 1h, a IA aguarda.
  // A mensagem do cliente ja foi salva pelo claimMessage acima.
  if (humanoAtivoRecentemente(lead)) {
    return {
      processed: true,
      duplicate: false,
      leadId: lead.id,
      dedupeMode: existingLead ? "phone_e164" : "created",
      duplicateLeadsFound: duplicatesFound,
    };
  }

  try {
    await marcarComoLidoEDigitando(event.messageId);

    const contextoClinica = await buscarContextoClinica(supabase);
    const historico = await buscarHistoricoConversa(supabase, event.phoneRaw);
    const nomeConhecido = trimOrNull(lead.name) ?? event.contactName;

    let respostaIA = await gerarRespostaIA(
      event.message,
      contextoClinica,
      historico,
      nomeConhecido
    );

    if (respostaIA) {
      const precisaHumano = respostaIA.includes(MARCADOR_HANDOFF);

      if (precisaHumano) {
        respostaIA = MENSAGEM_HANDOFF;
        await pausarIAparaLead(supabase, lead.id);
        await notificarEquipeHandoff(
          event.phoneRaw,
          nomeConhecido,
          event.message
        );
      } else {
        const { textoLimpo, agendamento } = extrairAgendamento(respostaIA);
        respostaIA = textoLimpo;

        if (agendamento) {
          const horarioValido = horarioDentroDoExpediente(
            agendamento.scheduledAt
          );

          if (!horarioValido) {
            // Fora do expediente: isso continua bloqueando, pois nao tem como
            // a recepcao "resolver" um horario que a clinica nem abre.
            console.error(
              "IA tentou agendar fora do expediente, bloqueado pelo codigo:",
              agendamento.scheduledAt
            );
            respostaIA =
              "Esse horário não está dentro do nosso expediente para agendamentos (segunda a sexta, 11h às 19h30, ou sábado das 9h às 13h). Consegue me indicar outro horário dentro desses períodos?";
          } else {
            // Dentro do expediente: cria normalmente. Se o cliente mencionou
            // um dia da semana que nao bate com a data calculada, nao trava a
            // conversa nem incomoda o cliente -- so deixa uma nota interna
            // para a recepcao conferir na hora de confirmar por telefone.
            const diaSemanaBate = diaSemanaMencionadoBateComData(
              event.message,
              agendamento.scheduledAt
            );
            const notas = diaSemanaBate
              ? null
              : "⚠️ Cliente mencionou um dia da semana que pode não bater com a data calculada pela IA — conferir ao confirmar.";

            await criarAgendamento(
              supabase,
              lead.id,
              agendamento.scheduledAt,
              agendamento.procedure,
              notas
            );
          }
        }
      }

      const atrasoMs = calcularAtrasoDigitacao(respostaIA);
      await aguardar(atrasoMs);

      await enviarMensagemWhatsApp(event.phoneRaw, respostaIA);
      await atualizarRespostaConversa(supabase, event.messageId, respostaIA);
    }
  } catch (iaError) {
    console.error("ERRO AO GERAR/ENVIAR RESPOSTA DA IA:", iaError);
  }

  return {
    processed: true,
    duplicate: false,
    leadId: lead.id,
    dedupeMode: existingLead ? "phone_e164" : "created",
    duplicateLeadsFound: duplicatesFound,
  };
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const verifyToken = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expectedVerifyToken = getWebhookVerifyToken();

  if (!mode || !verifyToken || !challenge) {
    return jsonError("Parametros de verificacao ausentes", 400);
  }

  if (!expectedVerifyToken) {
    return jsonError("Webhook verify token nao configurado", 500);
  }

  if (mode === "subscribe" && verifyToken === expectedVerifyToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return jsonError("Verificacao do webhook falhou", 403);
}

export async function POST(req: NextRequest) {
  let body: WhatsAppWebhookPayload;

  try {
    body = (await req.json()) as WhatsAppWebhookPayload;
  } catch {
    return jsonError("Body JSON invalido", 400);
  }

  const supabase = createSupabaseServerClient();

  // LOG TEMPORARIO: para identificar o formato exato do campo "referral"
  // enviado pela Meta em mensagens vindas de anuncios Click-to-WhatsApp.
  // Remover depois de confirmar o formato.
  console.log("PAYLOAD COMPLETO DO WEBHOOK:", JSON.stringify(body, null, 2));

  // Processa avisos de mensagens enviadas manualmente por humano (via app)
  const telefonesComIntervencaoHumana = extractHumanEchoPhones(body);
  for (const telefone of telefonesComIntervencaoHumana) {
    await marcarIntervencaoHumana(supabase, telefone);
  }

  const events = extractIncomingMessages(body);

  if (events.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        processed: 0,
        duplicates: 0,
        ignored: true,
        reason: "no_incoming_messages",
      },
      { status: 200 }
    );
  }

  try {
    const defaultStageId = await getDefaultStageId(supabase);
    const results: Array<{
      processed: boolean;
      duplicate: boolean;
      leadId: string | null;
      dedupeMode: string;
      duplicateLeadsFound: number;
    }> = [];

    for (const event of events) {
      results.push(await processIncomingMessage(supabase, event, defaultStageId));
    }

    const processed = results.filter((item) => item.processed).length;
    const duplicates = results.filter((item) => item.duplicate).length;

    return NextResponse.json(
      {
        ok: true,
        processed,
        duplicates,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("WHATSAPP WEBHOOK ERROR:", error);

    const message =
      error instanceof Error ? error.message : "Erro interno ao processar webhook";

    return jsonError(message, 500);
  }
}