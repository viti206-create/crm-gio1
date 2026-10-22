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

type ActivityRow = {
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

// NOVA FUNÇÃO: corrige formatação de negrito para o padrão do WhatsApp
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
        });
      }
    }
  }

  return events;
}

// NOVA FUNÇÃO: extrai números de telefone que receberam mensagem de um humano via app
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

async function hasProcessedMessage(
  supabase: SupabaseClient,
  messageId: string
) {
  const { data, error } = await supabase
    .from("activities")
    .select("id")
    .eq("type", "contact_whatsapp")
    .contains("payload", { message_id: messageId })
    .limit(1);

  if (error) {
    throw new Error(`Nao consegui validar idempotencia: ${error.message}`);
  }

  return ((data ?? []) as ActivityRow[]).length > 0;
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

// NOVA FUNÇÃO: marca que um humano acabou de intervir manualmente numa conversa
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

async function buscarContextoClinica(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("clinica_conhecimento")
    .select("titulo, conteudo, categoria")
    .eq("ativo", true);

  if (error || !data) {
    return "";
  }

  // VERSÃO SIMPLES: dos procedimentos vai SÓ O NOME (sem explicações).
  // O restante (horário, endereço, pagamento, convênio) vai completo.
  const CATEGORIAS_PROCEDIMENTO = [
    "corporal",
    "facial",
    "procedimento",
    "depilacao",
    "depilação",
    "laser",
  ];

  const ehProcedimento = (categoria: string | null) =>
    CATEGORIAS_PROCEDIMENTO.includes(String(categoria ?? "").toLowerCase());

  const nomesProcedimentos = data
    .filter((item) => ehProcedimento(item.categoria))
    .map((item) => String(item.titulo).split(" - ")[0].trim())
    .filter((nome, i, lista) => lista.indexOf(nome) === i)
    .join(", ");

  const infoFixa = data
    .filter((item) => !ehProcedimento(item.categoria))
    .map((item) => `${item.titulo}: ${item.conteudo}`)
    .join("\n\n");

  return `${infoFixa}\n\nPROCEDIMENTOS QUE A CLÍNICA REALIZA (apenas os nomes, sem detalhes): ${nomesProcedimentos}`;
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

// Calcula o que a IA deve dizer sobre o contato da avaliadora, conforme o horário de agora.
// Funcionamento: seg-sex 11h-20h, sáb 9h-13h, domingo fechado. O contato acontece
// a partir de 30 minutos após a abertura do próximo dia de funcionamento.
function obterInfoContato(): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const pega = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? "";

  const mapaDias: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const diaSemana = mapaDias[pega("weekday")] ?? 1;
  const minutosAgora = Number(pega("hour")) * 60 + Number(pega("minute"));

  // [abre, fecha] em minutos; null = fechado
  const horarioDoDia = (dia: number): [number, number] | null => {
    if (dia === 0) return null;
    if (dia === 6) return [9 * 60, 13 * 60];
    return [11 * 60, 20 * 60];
  };

  const hoje = horarioDoDia(diaSemana);
  if (hoje && minutosAgora >= hoje[0] && minutosAgora < hoje[1]) {
    return "A avaliadora entrará em contato com você em breve.";
  }

  const nomesDias = [
    "no domingo",
    "na segunda-feira",
    "na terça-feira",
    "na quarta-feira",
    "na quinta-feira",
    "na sexta-feira",
    "no sábado",
  ];

  for (let i = 0; i <= 7; i++) {
    const dia = (diaSemana + i) % 7;
    const horario = horarioDoDia(dia);
    if (!horario) continue;
    if (i === 0 && minutosAgora >= horario[0]) continue; // hoje já passou do horário

    const inicio = horario[0] + 30;
    const hh = Math.floor(inicio / 60);
    const mm = String(inicio % 60).padStart(2, "0");
    const quando = i === 0 ? "hoje" : i === 1 ? "amanhã" : nomesDias[dia];

    return `Estamos fora do horário de atendimento, então a avaliadora entrará em contato com você ${quando}, a partir das ${hh}h${mm}.`;
  }

  return "A avaliadora entrará em contato com você assim que possível.";
}

function montarSystemPrompt(
  contextoClinica: string,
  ehPrimeiraMensagem: boolean,
  nomeConhecido: string | null,
  totalMensagensCliente: number
): string {
  const saudacao = obterSaudacaoPeriodo();
  const infoContato = obterInfoContato();

  return `Você é o assistente virtual da GIO Boituva, uma clínica de estética facial e corporal. Seu papel é APENAS fazer o primeiro atendimento: receber o cliente com simpatia, para que ele nunca fique sem resposta, e encaminhar para a equipe.

TOM: acolhedor, simpático e direto, como uma conversa real de WhatsApp. Pode usar emojis com moderação.

REGRA DE TAMANHO (SEM EXCEÇÕES): no MÁXIMO 2 frases curtas, em um único parágrafo, sem pular linha.

FORMATAÇÃO: para destacar uma palavra use APENAS um asterisco de cada lado (*importante*). NUNCA use dois asteriscos.

${
  ehPrimeiraMensagem
    ? `Esta é a PRIMEIRA mensagem da conversa. Cumprimente com "${saudacao}!" e um emoji adequado, diga que é o assistente da GIO Boituva e pergunte como pode ajudar.`
    : `Esta NÃO é a primeira mensagem — não repita saudação nem apresentação.`
}

NOME DO CLIENTE:
${
  nomeConhecido
    ? `O nome já é conhecido: ${nomeConhecido}. Use de forma natural quando fizer sentido.`
    : `O nome ainda não é conhecido. Pergunte UMA VEZ, de forma gentil. Se a pessoa não responder, siga sem insistir.`
}

SEU OBJETIVO: entender o que o cliente procura para que, quando a avaliadora assumir a conversa, ela já receba tudo bem encaminhado. Você NÃO explica procedimentos nem passa valores: você faz perguntas curtas e acolhedoras.

COMO CONDUZIR (UMA pergunta por mensagem, nunca várias juntas, e nunca repita o que o cliente já respondeu):
1. Nome (se ainda não souber, sem insistir).
2. O que ele(a) busca: qual procedimento, queixa ou objetivo principal.
3. Se já fez algum tratamento para isso ou tem alguma dúvida específica que a avaliadora deva responder.
4. Se prefere avaliação online ou presencial, e o melhor dia e período (dentro do horário de funcionamento).
Adapte a ordem ao que o cliente disser. Se ele já contar tudo de uma vez, não pergunte de novo.

SOBRE A AVALIAÇÃO: a avaliação é feita pela avaliadora da clínica e, na maioria dos casos, pode ser feita ON-LINE, sem precisar vir até a clínica (quando necessário, ela avisa que precisa ser presencial). Pode oferecer isso ao cliente de forma natural, principalmente para quem é de fora ou quer praticidade. Não prometa que será 100% online em todos os casos.

QUANDO ENCERRAR (adicione no final o texto exato "${MARCADOR_HANDOFF}", marcador interno que o cliente não vê). Encerre SOMENTE quando:
- o cliente pedir claramente para falar com uma pessoa/atendente; OU
- o cliente quiser marcar a avaliação ou um horário; OU
- você já souber o que ele busca E já tiver feito pelo menos mais 2 perguntas da condução, depois da resposta dele; OU
- ${totalMensagensCliente} for 7 ou mais (conversa longa), encerre agora com o que tiver.
NÃO encerre só porque o cliente perguntou preço, como funciona ou algo que você não pode responder: nesses casos diga que a avaliadora explica tudo na avaliação (que pode ser on-line) e CONTINUE com a próxima pergunta da condução. Cumprimentos e perguntas simples também não encerram.
Ao encerrar, escreva uma mensagem curta (no máximo 2 frases) agradecendo e informando EXATAMENTE isto sobre o contato da avaliadora: "${infoContato}" Não invente outro dia ou horário e não sugira outro canal.

O QUE VOCÊ PODE RESPONDER: horário de funcionamento, endereço, formas de pagamento e convênio (somente conforme as informações abaixo), e CONFIRMAR se a clínica realiza um procedimento, mas SOMENTE se o nome estiver na lista "PROCEDIMENTOS QUE A CLÍNICA REALIZA". Se não estiver na lista, não confirme nem negue: diga que a avaliadora vai verificar e continue a conduzir.

O QUE VOCÊ NÃO DEVE RESPONDER: não explique procedimentos (como funciona, resultados, indicações, contraindicações, duração, sessões, preparo, cuidados), não dê valores/preços/promoções e nunca fale de pagamento recorrente (cobrança recorrente no cartão, assinatura, mensalidade) nem de boleto, mesmo que apareça abaixo. Se o cliente perguntar sobre boleto, recorrência, parcelamento especial ou qualquer forma de pagamento que não esteja listada abaixo, diga que a equipe passa essa informação. Se o cliente perguntar qualquer um desses pontos, diga em uma frase que a avaliadora passa os detalhes na avaliação (que pode ser on-line) e já siga com a próxima pergunta da condução. Só encerre se uma das condições de encerramento acima for verdadeira.

REGRAS OBRIGATÓRIAS:
- Nunca mencione, recomende ou compare com outras clínicas ou concorrentes.
- Nunca dê conselhos médicos ou diagnósticos.
- Nunca invente informações. Se não está abaixo, encaminhe para a equipe.
- Use o histórico para não repetir perguntas.

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
    nomeConhecido,
    historico.filter((h) => h.mensagem).length + 1
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
    max_tokens: 150,
    system: systemPrompt,
    messages: mensagensParaIA,
  });

  const bloco = resposta.content[0];
  const textoOriginal = bloco.type === "text" ? bloco.text : "";
  return corrigirFormatacaoWhatsApp(textoOriginal);
}

async function marcarComoLidoEDigitando(messageId: string) {
  try {
    await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
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
  } catch (erro) {
    console.error("Erro ao marcar como lido/digitando:", erro);
  }
}

// NOVA FUNÇÃO: calcula um atraso proposital antes de enviar,
// simulando tempo de digitação humana (combina com o indicador "digitando...")
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

async function enviarMensagemWhatsApp(numeroCliente: string, texto: string) {
  await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numeroCliente,
        text: { body: texto },
      }),
    }
  );
}

// NOVA FUNÇÃO: notifica a equipe quando a IA transfere para humano
async function notificarEquipeHandoff(
  numeroCliente: string,
  nomeCliente: string | null,
  resumoConversa: string
) {
  const numeroAdmin = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!numeroAdmin) return;

  const texto = `⚠️ *Atenção necessária*\nCliente: ${
    nomeCliente ?? numeroCliente
  }\nTelefone: ${numeroCliente}\nO que o cliente disse:\n${resumoConversa}\n\nA IA concluiu a pré-triagem: assuma a conversa.`;

  try {
    await enviarMensagemWhatsApp(numeroAdmin, texto);
  } catch (erro) {
    console.error("Erro ao notificar equipe sobre handoff:", erro);
  }
}

async function salvarConversa(
  supabase: SupabaseClient,
  telefoneCliente: string,
  mensagem: string,
  resposta: string
) {
  await supabase.from("whatsapp_conversas").insert({
    numero_origem: process.env.WHATSAPP_PHONE_NUMBER_ID,
    telefone_cliente: telefoneCliente,
    mensagem,
    resposta,
  });
}

// NOVA FUNÇÃO: salva a mensagem do cliente mesmo quando a IA está pausada
// (sem isso, o painel não mostrava nada durante o atendimento humano)
async function salvarMensagemSemResposta(
  supabase: SupabaseClient,
  telefoneCliente: string,
  mensagem: string
) {
  await supabase.from("whatsapp_conversas").insert({
    numero_origem: process.env.WHATSAPP_PHONE_NUMBER_ID,
    telefone_cliente: telefoneCliente,
    mensagem,
    resposta: null,
  });
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

  // Se a IA já foi pausada de vez para esse lead (handoff), não responde mais,
  // mas salva a mensagem do cliente para aparecer no painel
  if (lead.ia_pausada) {
    await salvarMensagemSemResposta(supabase, event.phoneRaw, event.message);
    return {
      processed: true,
      duplicate: false,
      leadId: lead.id,
      dedupeMode: existingLead ? "phone_e164" : "created",
      duplicateLeadsFound: duplicatesFound,
    };
  }

  // Se um humano respondeu manualmente pelo app há menos de 1h, a IA aguarda,
  // mas salva a mensagem do cliente para aparecer no painel
  if (humanoAtivoRecentemente(lead)) {
    await salvarMensagemSemResposta(supabase, event.phoneRaw, event.message);
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
        const textoSemMarcador = respostaIA.replace(MARCADOR_HANDOFF, "").trim();
        respostaIA = textoSemMarcador || MENSAGEM_HANDOFF;
        await pausarIAparaLead(supabase, lead.id);
        const mensagensCliente = [
          ...historico.map((h) => h.mensagem).filter(Boolean),
          event.message,
        ].slice(-8) as string[];
        await notificarEquipeHandoff(
          event.phoneRaw,
          nomeConhecido,
          mensagensCliente.map((m) => `• ${m}`).join("\n")
        );
      }

      const atrasoMs = calcularAtrasoDigitacao(respostaIA);
      await aguardar(atrasoMs);

      await enviarMensagemWhatsApp(event.phoneRaw, respostaIA);
      await salvarConversa(supabase, event.phoneRaw, event.message, respostaIA);
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