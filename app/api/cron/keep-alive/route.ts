import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("recorrencias")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Keep-alive error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.log("Keep-alive OK:", new Date().toISOString());
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
