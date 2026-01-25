
import React from 'react';
import { Sun, Moon, Trash2, LogOut } from 'lucide-react';
import { UserProfile, Theme } from '../types';

interface HeaderProps {
  receiver: UserProfile;
  theme: Theme;
  isTyping: boolean;
  isOnline: boolean;
  toggleTheme: () => void;
  onClearChat: () => void;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ receiver, theme, isTyping, isOnline, toggleTheme, onClearChat, onLogout }) => {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white dark:bg-[#202C33] shadow-sm border-b dark:border-gray-800/50 backdrop-blur-md bg-opacity-95">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-xl shadow-inner border border-emerald-200/50 dark:border-emerald-800/50">
          {receiver.emoji}
        </div>
        <div className="flex flex-col">
          <h2 className="font-bold text-gray-800 dark:text-gray-100 text-sm leading-tight">{receiver.email.split('@')[0]}</h2>
          <div className="flex items-center h-3 mt-0.5">
            {isTyping ? (
              <p className="text-[10px] text-emerald-500 font-black italic animate-pulse lowercase tracking-wider">typing...</p>
            ) : isOnline ? (
              <div className="flex items-center">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></div>
                <p className="text-[9px] text-emerald-600 dark:text-emerald-500 font-black uppercase tracking-widest">Online</p>
              </div>
            ) : (
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Offline</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-1">
        <button onClick={onClearChat} className="p-2.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950/40 transition-all text-gray-400 hover:text-red-500 active:scale-90 group relative">
          <Trash2 size={20} />
          <span className="absolute -bottom-8 right-0 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 uppercase tracking-tighter">Clear All</span>
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
