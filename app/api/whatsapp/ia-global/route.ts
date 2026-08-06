import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("global_settings")
    .select("ia_pausada_globalmente")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    iaPausadaGlobalmente: Boolean(data?.ia_pausada_globalmente),
  });
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();

  let body: { pausada?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const pausada = Boolean(body.pausada);

  const { error } = await supabase
    .from("global_settings")
    .update({ ia_pausada_globalmente: pausada })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, iaPausadaGlobalmente: pausada });
}