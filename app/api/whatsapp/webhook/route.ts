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
};

type StageRow = {
  id: string;
};

type ActivityRow = {
  id: string;
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
    .select("id,created_at,name,phone_raw,phone_e164,source,interest,stage_id")
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
    .select("id,created_at,name,phone_raw,phone_e164,source,interest,stage_id")
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
    .select("id,created_at,name,phone_raw,phone_e164,source,interest,stage_id")
    .single();

  if (error) {
    throw new Error(`Nao consegui atualizar lead: ${error.message}`);
  }

  return data as LeadRow;
}

// NOVA FUNÇÃO: busca as informações da clínica no Supabase
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

// NOVA FUNÇÃO: pergunta pro Claude o que responder
async function gerarRespostaIA(
  mensagemCliente: string,
  contextoClinica: string
) {
  const systemPrompt = `Você é o assistente virtual da GIO Boituva, uma clínica de estética facial e corporal. Sempre que se apresentar ou for perguntado, informe que você atende pela GIO Boituva.

Responda de forma breve e direta, como uma conversa real de WhatsApp — frases curtas, tom acolhedor e próximo.

REGRAS OBRIGATÓRIAS:
- Nunca mencione, recomende ou compare com outras clínicas ou concorrentes, mesmo se perguntado diretamente.
- Se a pergunta for sobre algo que não está nas informações abaixo, diga que vai verificar com a equipe.
- Nunca dê conselhos médicos, diagnósticos ou opiniões técnicas sobre procedimentos.

INFORMAÇÕES DA CLÍNICA:
${contextoClinica}`;

  const resposta = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: "user", content: mensagemCliente }],
  });

  const bloco = resposta.content[0];
  return bloco.type === "text" ? bloco.text : "";
}

// NOVA FUNÇÃO: envia a resposta de volta pro cliente no WhatsApp
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

  // NOVO: gera e envia a resposta da IA (só pra mensagens de texto reais)
  try {
    const contextoClinica = await buscarContextoClinica(supabase);
    const respostaIA = await gerarRespostaIA(event.message, contextoClinica);

    if (respostaIA) {
      await enviarMensagemWhatsApp(event.phoneRaw, respostaIA);
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