import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwqbgymqbcfvtvelunxo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cWJneW1xYmNmdnR2ZWx1bnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMzIxNTgsImV4cCI6MjA5MTcwODE1OH0.-t_p4tvbVMizQYZlT_nBpRd9MKg3PKN_ICnPAgjdHuY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
