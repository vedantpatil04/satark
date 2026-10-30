import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Supabase project root URL (without /rest/v1/)
export const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || "https://ugsizlimcnxtbzkwficf.supabase.co";

// Publishable Key (safe for public browser & mobile client)
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_GnFiy75GmyubQB_4N3o_ug_KKtMJWlW";

let supabaseClient: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!supabaseClient) {
    if (!SUPABASE_PUBLISHABLE_KEY || typeof SUPABASE_PUBLISHABLE_KEY !== "string" || SUPABASE_PUBLISHABLE_KEY.trim() === "") {
      console.warn(
        "VITE_SUPABASE_PUBLISHABLE_KEY is not configured. Falling back to local backend auth mode."
      );
      return null;
    }
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.trim(), {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      });
    } catch (err) {
      console.warn("Could not initialize Supabase client:", err);
      return null;
    }
  }
  return supabaseClient;
};

export const supabase = getSupabase();
