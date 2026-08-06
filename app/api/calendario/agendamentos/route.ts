import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

// Formata data/hora no padrão exigido pelo ICS: YYYYMMDDTHHMMSS
function formatICSDateTime(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mm}${ss}Z`;
}

// Escapa caracteres especiais exigidos pelo formato ICS
function escapeICS(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
};

function buildICS(events: IcsEvent[]) {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//CRM Gio//Agendamentos//PT-BR");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push("X-WR-CALNAME:CRM Gio - Agendamentos");
  lines.push("X-WR-TIMEZONE:America/Sao_Paulo");

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}@crm-gio-agendamentos`);
    lines.push(`DTSTAMP:${formatICSDateTime(new Date())}`);
    lines.push(`DTSTART:${formatICSDateTime(ev.start)}`);
    lines.push(`DTEND:${formatICSDateTime(ev.end)}`);
    lines.push(`SUMMARY:${escapeICS(ev.title)}`);
    lines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push("DESCRIPTION:Lembrete");
    lines.push("TRIGGER:-PT1H");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: rows, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      scheduled_at,
      procedure,
      notes,
      status,
      leads ( name, phone_raw, phone_e164 )
    `
    )
    .in("status", ["agendado", "confirmado"])
    .order("scheduled_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events: IcsEvent[] = [];

  for (const ag of rows || []) {
    const start = new Date(ag.scheduled_at as string);
    if (Number.isNaN(start.getTime())) continue;

    // Duracao padrao de 1h por atendimento (ajuste se a clinica preferir outro valor)
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const lead = (ag as any).leads;
    const nome = lead?.name || "Cliente sem nome";
    const telefone =
      (lead?.phone_raw && lead.phone_raw.trim()) ||
      (lead?.phone_e164 && lead.phone_e164.trim()) ||
      "sem telefone";
    const procedimento = ag.procedure || "Avaliação";
    const observacoes = ag.notes ? ` Obs: ${ag.notes}.` : "";

    events.push({
      uid: `agendamento-${ag.id}`,
      start,
      end,
      title: `${nome} - ${procedimento}`,
      description: `Cliente: ${nome} (${telefone}). Procedimento: ${procedimento}.${observacoes}`,
    });
  }

  const ics = buildICS(events);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="crm-gio-agendamentos.ics"',
      "Cache-Control": "public, max-age=900",
    },
  });
}