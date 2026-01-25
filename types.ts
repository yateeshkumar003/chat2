// Fix: Added missing React import to resolve the React namespace for CSSProperties
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