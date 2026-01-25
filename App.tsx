
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import ChatRoom from './components/ChatRoom';
import { Theme } from './types';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'light';
  });

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Explicitly handle tab closing/page hiding to ensure session is cleared if desired
    // Although sessionStorage handles the "close tab" case, this adds an extra layer of security
    const handleUnload = () => {
      // Not signing out on every refresh, only relying on sessionStorage for tab-close behavior
    };

    window.addEventListener('pagehide', handleUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  if (loading) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-gray-50 dark:bg-[#0B141A]">
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-500"></div>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-500 uppercase tracking-widest">CMX</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-whatsapp-light dark:bg-whatsapp-dark transition-colors duration-500">
      {!session ? (
        <Auth />
      ) : (
        <ChatRoom 
          session={session} 
          theme={theme} 
          toggleTheme={toggleTheme} 
        />
      )}
    </div>
  );
};

export default App;
