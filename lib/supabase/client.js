import { createClient } from "@supabase/supabase-js";
import { captureGitHubProviderToken } from "@/lib/auth/githubProviderToken";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

if (supabase && typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => {
    captureGitHubProviderToken(session);
  });
}
