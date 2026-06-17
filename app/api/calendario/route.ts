import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

// ---------- helpers de data (mesma lógica usada na tela de Recorrências) ----------

function parseYMD(ymd: string) {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
}

function addMonths(dt: Date, months: number) {
  const x = new Date(dt.getTime());
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

function addDays(dt: Date, days: number) {
  const x = new Date(dt.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function formatBRL(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Formata data no padrão exigido pelo ICS para "evento de dia inteiro": YYYYMMDD
function formatICSDate(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
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
  date: Date;
  title: string;
  description: string;
};

function buildICS(events: IcsEvent[]) {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//CRM Gio//Recorrencias//PT-BR");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push("X-WR-CALNAME:CRM Gio - Vencimentos");
  lines.push("X-WR-TIMEZONE:America/Sao_Paulo");

  for (const ev of events) {
    const dateStr = formatICSDate(ev.date);
    const nextDay = formatICSDate(addDays(ev.date, 1));

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}@crm-gio`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}T000000Z`);
    lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay}`);
    lines.push(`SUMMARY:${escapeICS(ev.title)}`);
    lines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
    // Notificação padrão: avisa no mesmo dia, às 9h (ajustável no próprio Google Calendar depois)
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push("DESCRIPTION:Lembrete");
    lines.push("TRIGGER:PT9H");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: rows, error } = await supabase
    .from("recorrencias")
    .select(
      `
      id,
      status,
      start_date,
      installments_total,
      installments_done,
      price_per_installment,
      leads ( name, phone_raw, phone_e164 )
    `
    )
    .eq("status", "ativo");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events: IcsEvent[] = [];

  for (const rec of rows || []) {
    const start = parseYMD(rec.start_date);
    const total = Number(rec.installments_total || 0);
    const done = Number(rec.installments_done || 0);
    const nextPayment = addMonths(start, done);

    const lead = (rec as any).leads;
    const nome = lead?.name || "Cliente sem nome";
    const valor = formatBRL(rec.price_per_installment);
    const telefone =
      (lead?.phone_raw && lead.phone_raw.trim()) ||
      (lead?.phone_e164 && lead.phone_e164.trim()) ||
      "sem telefone";

    // Só gera eventos futuros relevantes (evita poluir o calendário com histórico)
    if (done >= total) continue;

    // Evento 1: aviso 1 dia antes do vencimento
    const diaAntes = addDays(nextPayment, -1);
    events.push({
      uid: `${rec.id}-aviso`,
      date: diaAntes,
      title: `🔔 Vence amanhã: ${nome} (${valor})`,
      description: `Recorrência de ${nome} (${telefone}) vence amanhã. Valor: ${valor}. Parcela ${
        done + 1
      }/${total}.`,
    });

    // Evento 2: aviso 1 dia depois do vencimento (conferir se caiu)
    const diaDepois = addDays(nextPayment, 1);
    events.push({
      uid: `${rec.id}-conferir`,
      date: diaDepois,
      title: `⚠️ Conferir pagamento: ${nome} (${valor})`,
      description: `Confirme no app do banco se o pagamento de ${nome} (${telefone}) caiu. Vencimento foi ontem. Valor: ${valor}. Parcela ${
        done + 1
      }/${total}.`,
    });
  }

  const ics = buildICS(events);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="crm-gio-recorrencias.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
