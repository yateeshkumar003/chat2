
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://viowmjpcdfdjqcjycvsw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpb3dtanBjZGZkanFjanljdnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNTM0MjEsImV4cCI6MjA4NDgyOTQyMX0.UJJH-JByLOSC7nuUFBYhBUZpvQ2dS6kXWCah8blOiSA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Changed to sessionStorage to satisfy the requirement: logout on tab close
    storage: window.sessionStorage, 
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
