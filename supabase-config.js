// Supabase Configuration
const SUPABASE_URL = 'https://sscdyfeacelggtijhiyd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jLRRJIoUz5nZRzwV8rajsw_XFpwCNOb';

const ADMIN_PASSWORD = 'admin2026';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
