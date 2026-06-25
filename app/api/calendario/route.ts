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
    // Notificação padrão: avisa às 14h no horário de Brasília (UTC-3 = 17h UTC)
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push("DESCRIPTION:Lembrete");
    lines.push("TRIGGER:PT17H");
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
    const finalPayment = addMonths(start, Math.max(total - 1, 0));
    const cancelFrom = addDays(finalPayment, 1);

    const lead = (rec as any).leads;
    const nome = lead?.name || "Cliente sem nome";
    const valor = formatBRL(rec.price_per_installment);
    const telefone =
      (lead?.phone_raw && lead.phone_raw.trim()) ||
      (lead?.phone_e164 && lead.phone_e164.trim()) ||
      "sem telefone";

    const isCompleted = done >= total && total > 0;

    // Gera eventos para TODAS as parcelas (pagas e futuras) para visualização completa no calendário
    for (let i = 0; i < total; i++) {
      const parcela = addMonths(start, i);
      const pago = i < done;

      const diaAntes = addDays(parcela, -1);
      events.push({
        uid: `${rec.id}-aviso-${i}`,
        date: diaAntes,
        title: pago
          ? `✅ Venceu: ${nome} (${valor})`
          : `🔔 Vence amanhã: ${nome} (${valor})`,
        description: `Parcela ${i + 1}/${total} de ${nome} (${telefone}). Valor: ${valor}.`,
      });

      const diaDepois = addDays(parcela, 1);
      events.push({
        uid: `${rec.id}-conferir-${i}`,
        date: diaDepois,
        title: pago
          ? `✅ Conferido: ${nome} (${valor})`
          : `⚠️ Conferir pagamento: ${nome} (${valor})`,
        description: `Confirme no app do banco se o pagamento de ${nome} (${telefone}) caiu. Parcela ${i + 1}/${total}. Valor: ${valor}.`,
      });
    }

    if (isCompleted) continue;

    // Evento 3: Último pagamento (data da última parcela, mesma exibida na tela)
    events.push({
      uid: `${rec.id}-ultimo-pagamento`,
      date: finalPayment,
      title: `🏁 Último pagamento: ${nome} (${valor})`,
      description: `Hoje é a data do último pagamento (parcela ${total}/${total}) de ${nome} (${telefone}). Valor: ${valor}.`,
    });

    // Evento 4: Cancelar recorrência (data "de", início da janela de cancelamento já calculada na tela)
    events.push({
      uid: `${rec.id}-cancelar-recorrencia`,
      date: cancelFrom,
      title: `🛑 Cancelar recorrência: ${nome}`,
      description: `A partir de hoje está liberado cancelar a recorrência de ${nome} (${telefone}), caso o cliente não tenha renovado.`,
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
