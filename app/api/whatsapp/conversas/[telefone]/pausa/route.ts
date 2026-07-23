import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: { telefone: string } }
) {
  const { telefone } = params;
  const { pausada } = await req.json();

  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("leads")
    .update({ ia_pausada: Boolean(pausada) })
    .eq("phone_raw", telefone);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}