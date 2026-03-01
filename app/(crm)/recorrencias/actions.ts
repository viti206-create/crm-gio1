"use server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";

export async function testConnection() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id")
    .limit(1);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/recorrencias");

  return data;
}