"use server";
import { cookies } from "next/headers";
import { supabaseServidor } from "@/lib/supabase/server";

/** Guarda o CD escolhido no cookie 'cd' (1 ano). */
export async function definirCd(cd: string) {
  if (!/^[a-z0-9_-]{1,40}$/.test(cd)) return;
  const { data } = await supabaseServidor().from("cds").select("id").eq("id", cd).eq("ativo", true).maybeSingle();
  if (!data) return;
  cookies().set("cd", cd, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
