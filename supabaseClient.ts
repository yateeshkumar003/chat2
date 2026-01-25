
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://viowmjpcdfdjqcjycvsw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpb3dtanBjZGZkanFjanljdnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNTM0MjEsImV4cCI6MjA4NDgyOTQyMX0.UJJH-JByLOSC7nuUFBYhBUZpvQ2dS6kXWCah8blOiSA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * DATABASE SCHEMA VERIFIED:
 * 
 * -- Enable Realtime for deletions and updates
 * ALTER TABLE public.messages REPLICA IDENTITY FULL;
 * 
 * -- Ensure columns exist
 * ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
 * 
 * -- Enable Realtime in Supabase Dashboard:
 * -- 1. Go to Database -> Replication
 * -- 2. Enable 'supabase_realtime' for the 'messages' table
 */
