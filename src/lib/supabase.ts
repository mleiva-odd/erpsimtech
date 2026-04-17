import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// Usamos la Service Role Key para poder saltarnos RLS y subir archivos desde el servidor.
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
