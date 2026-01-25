
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
  
  // Modal States
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  
  const channelRef = useRef<any>(null);
  const receiverTypingTimeoutRef = useRef<any>(null);

  // Persistent storage sync
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(hiddenMessageIds));
  }, [hiddenMessageIds, storageKey]);

  useEffect(() => {
    localStorage.setItem(wallpaperKey, wallpaper);
  }, [wallpaper, wallpaperKey]);

  // Read status updater
  const markMessagesAsRead = useCallback(async () => {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_email', currentUserEmail)
        .eq('sender_email', receiverEmail)
        .eq('is_read', false);
    } catch (e) {
      console.error('Read update failed:', e);
    }
  }, [currentUserEmail, receiverEmail]);

  // Core fetch logic
  const fetchMessages = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail}`)
        .order('created_at', { ascending: true });

      if (error) {
        if (error.code === '42P01') setDbError('DB_ERROR');
      } else if (data) {
        setDbError(null);
        // Strict filtering for the 1-on-1 chat
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

  // Realtime Logic
  useEffect(() => {
    // 1. Initial Load
    fetchMessages();

    // 2. Setup Unified Channel
    const channelName = `chat_${[currentUserEmail, receiverEmail].sort().join('_')}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: currentUserEmail } }
    });

    channelRef.current = channel;

    // Listen for NEW messages (INSERT)
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const newMessage = payload.new as Message;
        const s = (newMessage.sender_email || '').toLowerCase().trim();
        const r = (newMessage.receiver_email || '').toLowerCase().trim();
        
        // Filter: Only process if it belongs to this conversation
        if ((s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail)) {
          setMessages((prev) => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, { ...newMessage, status: 'sent' }];
          });
          
          if (r === currentUserEmail) {
            markMessagesAsRead();
            setIsTyping(false);
          }
        }
      }
    );

    // Listen for UPDATES (e.g., read status, edits)
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload) => {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
      }
    );

    // Listen for DELETES
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        if (payload.old && payload.old.id) {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        } else {
          fetchMessages(false);
        }
      }
    );

    // Presence Logic
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const onlineUsers = Object.values(state).flat().map((u: any) => u.user);
      setIsReceiverOnline(onlineUsers.includes(receiverEmail));
    });

    // Typing Broadcast Logic
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      if (payload.payload.user === receiverEmail) {
        setIsTyping(true);
        if (receiverTypingTimeoutRef.current) clearTimeout(receiverTypingTimeoutRef.current);
        receiverTypingTimeoutRef.current = setTimeout(() => setIsTyping(false), 4000);
      }
    });

    channel.on('broadcast', { event: 'stopped_typing' }, (payload) => {
      if (payload.payload.user === receiverEmail) setIsTyping(false);
    });

    // Subscribe and Auto-Track
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('synced');
        await channel.track({ user: currentUserEmail, online_at: new Date().toISOString() });
      } else {
        setSyncStatus('connecting');
      }
    });

    // RESYNC ON WAKE-UP (Fixes mobile sync issues)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMessages(false); // Silent sync without loading spinner
        markMessagesAsRead();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [currentUserEmail, receiverEmail, fetchMessages, markMessagesAsRead]);

  // Actions
  const executeClearChat = async () => {
    setShowClearConfirm(false);
    setIsClearing(true);
    try {
      await supabase
        .from('messages')
        .delete()
        .or(`sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail}`);
      setMessages([]);
      setHiddenMessageIds([]);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsClearing(false);
    }
  };

  const executeDeleteForEveryone = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      await supabase.from('messages').delete().eq('id', id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMessage = (id: string, forEveryone: boolean) => {
    if (forEveryone) setDeleteTarget(id);
    else setHiddenMessageIds(prev => [...prev, id]);
  };

  const sendTypingStatus = (status: 'typing' | 'stopped_typing') => {
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
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white text-[9px] font-black px-3 py-1 rounded-full flex items-center space-x-2 shadow-lg animate-bounce">
            <RefreshCcw size={10} className="animate-spin" />
            <span>CONNECTING REALTIME...</span>
          </div>
        )}

        {/* Delete Confirmation UI */}
        {(showClearConfirm || deleteTarget) && (
          <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-[#111B21] w-full max-w-xs rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10 scale-100 animate-in zoom-in-95 duration-200">
              <div className="p-8 text-center space-y-5">
                <div className="w-20 h-20 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-500/5">
                  <AlertTriangle size={36} className="text-red-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    {showClearConfirm ? 'Clear Conversation?' : 'Delete Message?'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] leading-relaxed mt-2 opacity-70">
                    This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex border-t dark:border-gray-800">
                <button onClick={() => { setShowClearConfirm(false); setDeleteTarget(null); }} className="flex-1 py-5 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-r dark:border-gray-800">Cancel</button>
                <button onClick={showClearConfirm ? executeClearChat : executeDeleteForEveryone} className="flex-1 py-5 text-[11px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {isClearing && (
          <div className="absolute inset-0 z-[110] bg-white/70 dark:bg-black/70 backdrop-blur-md flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 size={50} className="animate-spin text-emerald-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">Wiping Chat...</p>
            </div>
          </div>
        )}
        
        {clearSuccess && <div className="absolute inset-0 z-[120] bg-emerald-500 flex items-center justify-center text-white text-3xl font-black uppercase animate-in fade-in zoom-in">Success</div>}

        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={48} /></div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessageSquareOff size={100} className="text-emerald-500/10 mb-6" />
            <p className="text-[11px] font-black uppercase text-gray-400 tracking-[0.4em]">Ready to talk</p>
          </div>
        ) : (
          <MessageList 
            messages={visibleMessages} 
            currentUserEmail={currentUserEmail} 
            isReceiverOnline={isReceiverOnline}
            onImageClick={setSelectedImage}
            onDeleteMessage={handleDeleteMessage}
          />
        )}
      </div>

      <MessageInput 
        senderEmail={currentUserEmail} 
        receiverEmail={receiverEmail} 
        disabled={!!dbError || isClearing || clearSuccess || showClearConfirm || !!deleteTarget}
        theme={theme}
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
