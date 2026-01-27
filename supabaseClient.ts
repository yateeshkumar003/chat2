
import { createClient } from '@supabase/supabase-js';

// Custom memory storage to ensure zero persistence on reload
const memoryStorage = (function() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  };
})();

const supabaseUrl = 'https://viowmjpcdfdjqcjycvsw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpb3dtanBjZGZkanFjanljdnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNTM0MjEsImV4cCI6MjA4NDgyOTQyMX0.UJJH-JByLOSC7nuUFBYhBUZpvQ2dS6kXWCah8blOiSA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Memory storage is wiped on page refresh/reload
    storage: memoryStorage, 
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
