// Same Supabase project as the Blue website, so login and cart are shared.
// The publishable (anon) key is safe to ship in an app: Row Level Security protects the data.
export const SUPABASE_URL = "https://sspxcejkhqzlghzbctwl.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_tRPKq6vnRgC6aSzdrYV9uA_czxZMsmt";

// The live website (used for "Checkout on website").
export const SITE_URL = "https://blue-gimm.vercel.app";

// Where Google sign-in returns to the app. Must be listed in Supabase > Authentication > URL Configuration.
export const OAUTH_REDIRECT = "com.ugonwa.blue://login-callback";

// Keep in sync with the website (lib/format.ts) and place_order in the database.
export const DELIVERY_FEE_KOBO = 150000;
