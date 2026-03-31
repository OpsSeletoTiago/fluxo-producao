// Supabase Configuration
const SUPABASE_URL = 'https://sscdyfeacelggtijhiyd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jLRRJIoUz5nZRzwV8rajsw_XFpwCNOb';

export const ADMIN_PASSWORD = 'admin2026';

// The global 'supabase' object is provided by the script tag in index.html
const { createClient } = window.supabase;
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

