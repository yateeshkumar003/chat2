
import React from 'react';

export interface Message {
  id: string;
  sender_email: string;
  receiver_email: string;
  message_text: string | null;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
  is_read: boolean;
  status?: 'sending' | 'sent' | 'error';
}

export type Theme = 'light' | 'dark';

export interface Wallpaper {
  id: string;
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

export interface UserProfile {
  email: string;
  emoji: string;
}

export const USERS: Record<string, UserProfile> = {
  'shoe@gmail.com': { email: 'shoe@gmail.com', emoji: '👟' },
  'socks@gmail.com': { email: 'socks@gmail.com', emoji: '🧦' }
};

// Common wallpapers used across the app
export const WALLPAPERS: Wallpaper[] = [
  { id: 'default', name: 'Standard' },
  { id: 'emerald', name: 'Emerald', className: 'bg-emerald-500/10' },
  { id: 'blue', name: 'Ocean', className: 'bg-sky-500/10' },
  { id: 'rose', name: 'Rose', className: 'bg-rose-500/10' },
  { id: 'slate', name: 'Slate', className: 'bg-slate-700/20' },
  { id: 'amber', name: 'Amber', className: 'bg-amber-500/10' },
  { id: 'dark-solid', name: 'Solid Dark', className: 'bg-[#0B141A]' },
  { id: 'gradient-1', name: 'Twilight', className: 'bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20' },
  { id: 'gradient-2', name: 'Forest', className: 'bg-gradient-to-tr from-emerald-500/20 to-teal-500/20' },
];
