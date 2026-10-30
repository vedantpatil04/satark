import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Supabase project root URL (without /rest/v1/)
export const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || "https://ugsizlimcnxtbzkwficf.supabase.co";

// Publishable Key (safe for public browser & mobile client)
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  "";

let supabaseClient: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (!supabaseClient) {
    if (!SUPABASE_PUBLISHABLE_KEY) {
      console.warn(
        "VITE_SUPABASE_PUBLISHABLE_KEY is not configured. Falling back to local backend auth mode."
      );
    }
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
};

export const supabase = getSupabase();

