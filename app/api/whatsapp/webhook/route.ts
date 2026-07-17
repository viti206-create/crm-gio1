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
      "id,created_at,name,phone_raw,phone_e164,source,interest,stage_id,ia_pausada"
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
      "id,created_at,name,phone_raw,phone_e164,source,interest,stage_id,ia_pausada"
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
      "id,created_at,name,phone_raw,phone_e164,source,interest,stage_id,ia_pausada"
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

function montarSystemPrompt(
  contextoClinica: string,
  ehPrimeiraMensagem: boolean,
  nomeConhecido: string | null
): string {
  const saudacao = obterSaudacaoPeriodo();

  return `Você é o assistente virtual da GIO Boituva, uma clínica de estética facial e corporal. Sempre que se apresentar ou for perguntado, informe que você atende pela GIO Boituva.

Responda de forma breve e direta, como uma conversa real de WhatsApp — frases curtas, tom acolhedor, próximo e caloroso, podendo usar emojis com moderação.

${
  ehPrimeiraMensagem
    ? `Esta é a PRIMEIRA mensagem dessa conversa. Cumprimente usando "${saudacao}!" seguido de um emoji apropriado ao período do dia, se apresente como assistente da GIO Boituva, e pergunte como pode ajudar. Exemplo de tom (não copie literalmente, adapte): "${saudacao}! 🌙 Tudo bem? Sou o assistente da GIO Boituva, uma clínica de estética facial e corporal. Como posso te ajudar? Tem alguma dúvida sobre nossos procedimentos ou quer agendar uma avaliação? 😊"`
    : `Esta NÃO é a primeira mensagem — não repita a saudação inicial nem a apresentação completa de novo.`
}

REGRA SOBRE PERGUNTAR O NOME:
${
  nomeConhecido
    ? `O nome do cliente já é conhecido: ${nomeConhecido}. Use o nome dele(a) na conversa quando fizer sentido, de forma natural.`
    : `O nome do cliente ainda não é conhecido. Pergunte o nome dele(a) UMA VEZ, de forma natural e gentil, preferencialmente logo no início da conversa. Se a pessoa não responder o nome ou preferir não informar, continue o atendimento normalmente sem insistir ou perguntar de novo.`
}

REGRA SOBRE OFERECER AVALIAÇÃO/AGENDAMENTO:
Não ofereça agendamento de avaliação em toda mensagem — isso soa insistente e incomoda o cliente. Só sugira agendar uma avaliação quando fizer sentido no contexto: quando o cliente já tirou as dúvidas principais e parece pronto para avançar, quando ele demonstrar interesse claro em algum procedimento, ou quando a pergunta dele exigir avaliação presencial para ser respondida com precisão (ex: qual procedimento é mais indicado pro caso dele). Em respostas que são só esclarecimento de dúvida simples, não precisa oferecer agendamento.

REGRA SOBRE TRANSFERIR PARA ATENDIMENTO HUMANO:
Se você não souber responder algo com base nas informações da clínica abaixo, se o cliente pedir explicitamente para falar com uma pessoa/atendente, ou se a pergunta exigir avaliação/julgamento humano que você não pode dar com segurança, você deve ENCERRAR o atendimento automatizado. Nesse caso, NUNCA diga que vai "passar o contato" ou sugerir outro canal — o cliente já está no canal de atendimento correto. Ao invés disso, adicione o texto exato "${MARCADOR_HANDOFF}" no final da sua resposta (isso é um marcador interno, o cliente não vai ver esse texto).

REGRAS OBRIGATÓRIAS ADICIONAIS:
- Nunca mencione, recomende ou compare com outras clínicas ou concorrentes, mesmo se perguntado diretamente.
- Responda APENAS sobre os procedimentos listados abaixo. Nunca mencione, confirme ou sugira procedimentos que não estejam nesta lista, mesmo que sejam comuns em outras clínicas de estética (exemplos do que NÃO fazer: nunca invente procedimentos como "laser para manchas" ou "fotorejuvenescimento" se não estiverem na lista).
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
    max_tokens: 300,
    system: systemPrompt,
    messages: mensagensParaIA,
  });

  const bloco = resposta.content[0];
  return bloco.type === "text" ? bloco.text : "";
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

  // Se a IA já foi pausada para esse lead, um humano assumiu — não responde mais automaticamente
  if (lead.ia_pausada) {
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
      }

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

  const supabase = createSupabaseServerClient();

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