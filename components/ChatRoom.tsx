
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Message, Theme, USERS } from '../types';
import Header from './Header';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ImageModal from './ImageModal';
import WallpaperModal from './WallpaperModal';
import { Loader2, MessageSquareOff, AlertTriangle, RefreshCcw } from 'lucide-react';

interface ChatRoomProps {
  session: any;
  theme: Theme;
  toggleTheme: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ session, theme, toggleTheme }) => {
  const currentUserEmail = (session.user.email || '').toLowerCase().trim();
  const receiverEmail = currentUserEmail.includes('shoe') ? 'socks@gmail.com' : 'shoe@gmail.com';
  
  const storageKey = `hidden_messages_${currentUserEmail}`;
  const wallpaperKey = `chat_wallpaper_${currentUserEmail}`;

  const [messages, setMessages] = useState<Message[]>([]);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [wallpaper, setWallpaper] = useState<string>(() => {
    return localStorage.getItem(wallpaperKey) || 'default';
  });

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isReceiverOnline, setIsReceiverOnline] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'synced' | 'error'>('connecting');
  
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  
  const channelRef = useRef<any>(null);
  const receiverTypingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(hiddenMessageIds));
  }, [hiddenMessageIds, storageKey]);

  useEffect(() => {
    localStorage.setItem(wallpaperKey, wallpaper);
  }, [wallpaper, wallpaperKey]);

  const markMessagesAsRead = useCallback(async () => {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_email', currentUserEmail)
        .eq('sender_email', receiverEmail)
        .eq('is_read', false);
    } catch (e) {
      console.debug('Read sync delayed...');
    }
  }, [currentUserEmail, receiverEmail]);

  const fetchMessages = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail}`)
        .order('created_at', { ascending: true });

      if (error) {
        if (error.code === '42P01') setDbError('DB_ERR');
      } else if (data) {
        setDbError(null);
        const filtered = data.filter(m => {
          const s = (m.sender_email || '').toLowerCase().trim();
          const r = (m.receiver_email || '').toLowerCase().trim();
          return (s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail);
        });
        setMessages(filtered.map(m => ({ ...m, status: 'sent' })));
        markMessagesAsRead();
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      if (showLoading) setLoadingHistory(false);
    }
  }, [currentUserEmail, receiverEmail, markMessagesAsRead]);

  // STABLE REALTIME ENGINE with Instant Broadcast
  useEffect(() => {
    fetchMessages(true);

    const channelId = [currentUserEmail, receiverEmail].sort().join('--');
    const channel = supabase.channel(`direct_v2:${channelId}`, {
      config: {
        presence: { key: currentUserEmail },
        broadcast: { self: false, ack: true }
      }
    });

    channelRef.current = channel;

    // 1. INSTANT BROADCAST HANDLER (Bypasses DB lag for User B)
    channel.on('broadcast', { event: 'new_message' }, (payload) => {
      const incomingMsg = payload.payload as Message;
      setMessages(prev => {
        if (prev.some(m => m.id === incomingMsg.id)) return prev;
        return [...prev, { ...incomingMsg, status: 'sent' }];
      });
      setIsTyping(false);
      markMessagesAsRead();
    });

    // 2. DB CHANGE HANDLER (Source of truth / confirmation)
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const newMessage = payload.new as Message;
      const s = (newMessage.sender_email || '').toLowerCase().trim();
      const r = (newMessage.receiver_email || '').toLowerCase().trim();

      if ((s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail)) {
        setMessages(prev => {
          const exists = prev.find(m => m.id === newMessage.id);
          if (exists) {
            // Already there from Broadcast or Optimistic UI, just mark as 'sent'
            return prev.map(m => m.id === newMessage.id ? { ...newMessage, status: 'sent' } : m);
          }
          return [...prev, { ...newMessage, status: 'sent' }];
        });
        if (r === currentUserEmail) markMessagesAsRead();
      }
    });

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      if (payload.eventType === 'UPDATE') {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      } else if (payload.eventType === 'DELETE') {
        if (payload.old?.id) {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      }
    });

    // 3. PRESENCE & TYPING
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const online = Object.values(state).flat().map((u: any) => u.user);
      setIsReceiverOnline(online.includes(receiverEmail));
    });

    channel.on('broadcast', { event: 'typing' }, (payload) => {
      if (payload.payload.user === receiverEmail) {
        setIsTyping(true);
        if (receiverTypingTimeoutRef.current) clearTimeout(receiverTypingTimeoutRef.current);
        receiverTypingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });

    channel.on('broadcast', { event: 'stop_typing' }, () => setIsTyping(false));

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('synced');
        await channel.track({ user: currentUserEmail, online_at: new Date().toISOString() });
      } else {
        setSyncStatus('connecting');
      }
    });

    // Handle background wake-up
    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        fetchMessages(false);
        if (channelRef.current) channelRef.current.track({ user: currentUserEmail, online_at: new Date().toISOString() });
      }
    };

    window.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [currentUserEmail, receiverEmail]);

  const sendTypingStatus = (status: 'typing' | 'stop_typing') => {
    if (channelRef.current && syncStatus === 'synced') {
      channelRef.current.send({
        type: 'broadcast',
        event: status,
        payload: { user: currentUserEmail }
      });
    }
  };

  const getWallpaperClass = () => {
    if (wallpaper === 'default') return theme === 'dark' ? 'chat-wallpaper-dark' : 'chat-wallpaper-light';
    const wpMap: Record<string, string> = {
      'emerald': 'bg-emerald-500/10',
      'blue': 'bg-sky-500/10',
      'rose': 'bg-rose-500/10',
      'slate': 'bg-slate-700/20',
      'amber': 'bg-amber-500/10',
      'dark-solid': 'bg-[#0B141A]',
      'gradient-1': 'bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20',
      'gradient-2': 'bg-gradient-to-tr from-emerald-500/20 to-teal-500/20',
    };
    return wpMap[wallpaper] || '';
  };

  const visibleMessages = messages.filter(m => !hiddenMessageIds.includes(m.id));

  return (
    <div className={`flex flex-col h-[100dvh] w-full overflow-hidden transition-all duration-700 relative ${getWallpaperClass()}`}>
      {wallpaper === 'default' && <div className="absolute inset-0 z-[-1] bg-whatsapp-light dark:bg-whatsapp-dark" />}
      
      <Header 
        receiver={USERS[receiverEmail] || { email: receiverEmail, emoji: '👤' }} 
        toggleTheme={toggleTheme} 
        theme={theme}
        isTyping={isTyping}
        isOnline={isReceiverOnline}
        syncStatus={syncStatus}
        onClearChat={() => setShowClearConfirm(true)}
        onLogout={() => supabase.auth.signOut()}
        onOpenWallpaper={() => setShowWallpaperModal(true)}
      />
      
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {syncStatus === 'connecting' && !loadingHistory && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white text-[9px] font-black px-4 py-1.5 rounded-full flex items-center space-x-2 shadow-xl animate-pulse">
            <RefreshCcw size={10} className="animate-spin" />
            <span className="tracking-widest uppercase">Syncing Live...</span>
          </div>
        )}

        {(showClearConfirm || deleteTarget) && (
          <div className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-white dark:bg-[#111B21] w-full max-w-xs rounded-[2rem] shadow-2xl overflow-hidden border border-white/10 animate-in zoom-in-95 duration-150">
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto text-red-500">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase">Confirm?</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">This action is permanent.</p>
              </div>
              <div className="flex border-t dark:border-gray-800">
                <button onClick={() => { setShowClearConfirm(false); setDeleteTarget(null); }} className="flex-1 py-4 text-[10px] font-black uppercase text-gray-400 border-r dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
                <button onClick={showClearConfirm ? async () => {
                  setShowClearConfirm(false);
                  setIsClearing(true);
                  await supabase.from('messages').delete().or(`sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail}`);
                  setMessages([]);
                  setIsClearing(false);
                  setClearSuccess(true);
                  setTimeout(() => setClearSuccess(false), 1500);
                } : async () => {
                  if (deleteTarget) {
                    const id = deleteTarget;
                    setDeleteTarget(null);
                    await supabase.from('messages').delete().eq('id', id);
                  }
                }} className="flex-1 py-4 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {isClearing && (
          <div className="absolute inset-0 z-[110] bg-white/50 dark:bg-black/50 backdrop-blur-md flex items-center justify-center">
            <Loader2 size={40} className="animate-spin text-emerald-500" />
          </div>
        )}

        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-500" size={40} />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20">
            <MessageSquareOff size={80} className="text-emerald-500 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Messages</p>
          </div>
        ) : (
          <MessageList 
            messages={visibleMessages} 
            currentUserEmail={currentUserEmail} 
            isReceiverOnline={isReceiverOnline}
            onImageClick={setSelectedImage}
            onDeleteMessage={(id, forEveryone) => {
              if (forEveryone) setDeleteTarget(id);
              else setHiddenMessageIds(prev => [...prev, id]);
            }}
          />
        )}
      </div>

      <MessageInput 
        senderEmail={currentUserEmail} 
        receiverEmail={receiverEmail} 
        disabled={!!dbError || isClearing || clearSuccess || showClearConfirm || !!deleteTarget}
        theme={theme}
        channel={channelRef.current}
        onTypingStatus={sendTypingStatus}
        onMessageSent={(msg) => setMessages(prev => [...prev, msg])}
        onMessageConfirmed={(tempId, confirmedMsg) => {
          setMessages(prev => prev.map(m => m.id === tempId ? { ...confirmedMsg, status: 'sent' } : m));
        }}
      />

      {selectedImage && <ImageModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />}
      {showWallpaperModal && (
        <WallpaperModal 
          currentWallpaper={wallpaper} 
          onSelect={(id) => { setWallpaper(id); setShowWallpaperModal(false); }} 
          onClose={() => setShowWallpaperModal(false)} 
        />
      )}
    </div>
  );
};

export default ChatRoom;
