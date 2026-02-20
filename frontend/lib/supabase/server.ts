import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase env vars are missing on frontend");
  }

  type WritableCookieStore = {
    set?: (name: string, value: string, options?: Record<string, unknown>) => void;
  };

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        const writable = cookieStore as WritableCookieStore;
        if (!writable.set) {
          return;
        }
        cookiesToSet.forEach(({ name, value, options }) => writable.set?.(name, value, options));
      },
    },
  });
}
