
import React from 'react';
import { Sun, Moon, Trash2, LogOut, Palette, RefreshCw, ShieldCheck } from 'lucide-react';
import { UserProfile, Theme } from '../types';
import { format, isToday, isYesterday } from 'date-fns';

interface HeaderProps {
  receiver: UserProfile;
  theme: Theme;
  isTyping: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  syncStatus: 'connecting' | 'synced' | 'error';
  toggleTheme: () => void;
  onClearChat: () => void;
  onLogout: () => void;
  onOpenWallpaper: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  receiver, 
  theme, 
  isTyping, 
  isOnline, 
  lastSeenAt,
  syncStatus,
  toggleTheme, 
  onClearChat, 
  onLogout, 
  onOpenWallpaper 
}) => {
  const formatLastSeen = (dateStr: string | null) => {
    if (!dateStr) return 'Last seen recently';
    try {
      const date = new Date(dateStr);
      const timeStr = format(date, 'HH:mm');
      if (isToday(date)) return `Last seen at ${timeStr}`;
      if (isYesterday(date)) return `Last seen yesterday at ${timeStr}`;
      return `Last seen on ${format(date, 'MMM d')} at ${timeStr}`;
    } catch {
      return 'Last seen recently';
    }
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white dark:bg-[#202C33] shadow-sm border-b dark:border-gray-800/50 backdrop-blur-md bg-opacity-95">
      <div className="flex items-center space-x-3">
        <div className="relative">
          <div className={`w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-xl shadow-inner border border-emerald-200/50 dark:border-emerald-800/50 transition-all ${isOnline ? 'ring-2 ring-emerald-500/20' : ''}`}>
            {receiver.emoji}
          </div>
          {syncStatus === 'synced' && (
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#202C33] transition-colors duration-500 ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-gray-400'}`}></div>
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 text-sm leading-tight">{receiver.email.split('@')[0]}</h2>
            <ShieldCheck size={10} className="text-emerald-500" />
          </div>
          <div className="flex items-center h-3 mt-0.5">
            {isTyping ? (
              <p className="text-[10px] text-emerald-500 font-black italic animate-pulse lowercase tracking-wider">typing...</p>
            ) : isOnline ? (
              <div className="flex items-center">
                <p className="text-[9px] text-emerald-600 dark:text-emerald-500 font-black uppercase tracking-widest">Active Now</p>
              </div>
            ) : (
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{formatLastSeen(lastSeenAt)}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-1">
        {syncStatus === 'connecting' && (
          <div className="mr-2 animate-spin text-amber-500">
            <RefreshCw size={14} />
          </div>
        )}
        <button onClick={onOpenWallpaper} className="p-2.5 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500 transition-all active:scale-90" title="Change Wallpaper">
          <Palette size={20} />
        </button>
        <button onClick={onClearChat} className="p-2.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950/40 transition-all text-gray-400 hover:text-red-500 active:scale-90 group relative">
          <Trash2 size={20} />
          <span className="absolute -bottom-8 right-0 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 uppercase tracking-tighter shadow-lg pointer-events-none">Clear Chat</span>
        </button>
        <button onClick={toggleTheme} className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-400 active:scale-90">
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        <button onClick={onLogout} className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-400 active:scale-90">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;
