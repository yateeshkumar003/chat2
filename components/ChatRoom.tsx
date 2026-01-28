
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Message, Theme, USERS, WALLPAPERS } from '../types';
import Header from './Header';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ImageModal from './ImageModal';
import WallpaperModal from './WallpaperModal';
import { Loader2, Trash2 } from 'lucide-react';

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
  const lastSeenKey = `last_seen_${receiverEmail}`;
  const messagesCacheKey = `cache_msgs_${currentUserEmail}_${receiverEmail}`;

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const cached = localStorage.getItem(messagesCacheKey);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(messages.length === 0);
  const [isTyping, setIsTyping] = useState(false);
  const [isReceiverOnline, setIsReceiverOnline] = useState(false);
  const [receiverLastSeen, setReceiverLastSeen] = useState<string | null>(() => localStorage.getItem(lastSeenKey));
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'synced' | 'error'>('connecting');
  
  const channelRef = useRef<any>(null);
  const receiverTypingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(messagesCacheKey, JSON.stringify(messages));
  }, [messages, messagesCacheKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(hiddenMessageIds));
  }, [hiddenMessageIds, storageKey]);

  const performClearChat = useCallback(async () => {
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .or(`and(sender_email.eq.${currentUserEmail},receiver_email.eq.${receiverEmail}),and(sender_email.eq.${receiverEmail},receiver_email.eq.${currentUserEmail})`);

      if (error) {
        console.warn("DB delete restricted. Falling back to local view clear.", error);
        const allIds = messages.map(m => String(m.id));
        setHiddenMessageIds(prev => Array.from(new Set([...prev, ...allIds])));
      } else {
        setMessages([]);
        setHiddenMessageIds([]);
        localStorage.removeItem(messagesCacheKey);
        localStorage.removeItem(storageKey);
      }
    } catch (err) {
      console.error("Clear Chat Failed:", err);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  }, [currentUserEmail, receiverEmail, messages, messagesCacheKey, storageKey]);

  const upsertMessage = useCallback((msg: Message, defaultStatus: 'sent' | 'sending' | 'error' = 'sent') => {
    if (!msg.id) return;
    
    setMessages(prev => {
      const msgIdStr = String(msg.id);
      const existingIndex = prev.findIndex(m => String(m.id) === msgIdStr);
      
      if (existingIndex !== -1) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        updated[existingIndex] = { 
          ...existing, 
          ...msg, 
          status: msg.status || existing.status || defaultStatus,
          is_read: msg.is_read !== undefined ? msg.is_read : existing.is_read
        };
        return updated;
      }
      
      return [...prev, { ...msg, status: msg.status || defaultStatus }];
    });
  }, []);

  const fetchMessages = useCallback(async (isInitial = false) => {
    if (isInitial && messages.length === 0) setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail}`)
        .order('created_at', { ascending: true });

      if (error) {
        setSyncStatus('error');
      } else if (data) {
        const filtered = data.filter(m => {
          const s = (m.sender_email || '').toLowerCase().trim();
          const r = (m.receiver_email || '').toLowerCase().trim();
          return (s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail);
        });
        
        setMessages(filtered.map(m => ({ ...m, status: 'sent' })));
        
        const unreadFromOther = filtered.filter(m => m.receiver_email === currentUserEmail && !m.is_read);
        if (unreadFromOther.length > 0) {
          await supabase.from('messages').update({ is_read: true }).eq('receiver_email', currentUserEmail).eq('sender_email', receiverEmail).eq('is_read', false);
        }

        const messagesFromReceiver = filtered.filter(m => m.sender_email === receiverEmail);
        if (messagesFromReceiver.length > 0) {
          const latestMsg = messagesFromReceiver[messagesFromReceiver.length - 1];
          const timestamp = latestMsg.created_at;
          setReceiverLastSeen(timestamp);
          localStorage.setItem(lastSeenKey, timestamp);
        }
      }
    } catch (e) { console.error('Sync failed:', e); }
    finally { setLoadingHistory(false); }
  }, [currentUserEmail, receiverEmail, messages.length, lastSeenKey]);

  useEffect(() => {
    fetchMessages(true);
    const sortedEmails = [currentUserEmail, receiverEmail].sort();
    const safeRoomId = `room_${sortedEmails[0]}_${sortedEmails[1]}`.replace(/[^a-zA-Z0-9_]/g, '');
    
    const channel = supabase.channel(safeRoomId, {
      config: { presence: { key: currentUserEmail }, broadcast: { self: false } }
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'msg' }, (payload) => {
        if (payload.payload) {
          upsertMessage(payload.payload as Message);
          setIsTyping(false);
          if (payload.payload.sender_email === receiverEmail) {
            const now = new Date().toISOString();
            setReceiverLastSeen(now);
            localStorage.setItem(lastSeenKey, now);
          }
        }
      })
      .on('broadcast', { event: 'read_receipt' }, (payload) => {
        if (payload.payload?.reader === receiverEmail) {
          setMessages(prev => prev.map(m => 
            m.sender_email === currentUserEmail && !m.is_read ? { ...m, is_read: true } : m
          ));
          const now = new Date().toISOString();
          setReceiverLastSeen(now);
          localStorage.setItem(lastSeenKey, now);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        const s = (msg.sender_email || '').toLowerCase().trim();
        const r = (msg.receiver_email || '').toLowerCase().trim();
        if ((s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail)) {
          upsertMessage(msg);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const presenceArray = Object.values(state).flat() as any[];
        const receiverPresence = presenceArray.find((u: any) => u.user === receiverEmail);
        
        if (receiverPresence) {
          setIsReceiverOnline(true);
          const activeTime = receiverPresence.online_at || new Date().toISOString();
          setReceiverLastSeen(activeTime);
          localStorage.setItem(lastSeenKey, activeTime);
        } else {
          setIsReceiverOnline(false);
        }
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user === receiverEmail) {
          setIsTyping(true);
          const now = new Date().toISOString();
          setReceiverLastSeen(now);
          localStorage.setItem(lastSeenKey, now);

          if (receiverTypingTimeoutRef.current) clearTimeout(receiverTypingTimeoutRef.current);
          receiverTypingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus('synced');
          fetchMessages(false);
          await channel.track({ user: currentUserEmail, online_at: new Date().toISOString() });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setSyncStatus('connecting');
        }
      });

    return () => { 
      supabase.removeChannel(channel);
      if (receiverTypingTimeoutRef.current) clearTimeout(receiverTypingTimeoutRef.current);
    };
  }, [currentUserEmail, receiverEmail, upsertMessage, fetchMessages, lastSeenKey]);

  const handleDeleteMessage = useCallback(async (id: string, forEveryone: boolean) => {
    if (forEveryone) {
      await supabase.from('messages').delete().eq('id', id).eq('sender_email', currentUserEmail);
    }
    setHiddenMessageIds(prev => [...prev, String(id)]);
  }, [currentUserEmail]);

  const handleTypingStatus = useCallback((status: 'typing' | 'stop_typing') => {
    if (channelRef.current && status === 'typing') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user: currentUserEmail }
      });
    }
  }, [currentUserEmail]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const currentWallpaper = WALLPAPERS.find(w => w.id === wallpaper);

  return (
    <div className={`flex-1 flex flex-col h-full relative overflow-hidden transition-colors duration-500`}>
      <Header 
        receiver={USERS[receiverEmail]} 
        theme={theme} 
        isTyping={isTyping} 
        isOnline={isReceiverOnline} 
        lastSeenAt={receiverLastSeen}
        syncStatus={syncStatus}
        toggleTheme={toggleTheme} 
        onClearChat={() => setShowClearConfirm(true)} 
        onLogout={handleLogout} 
        onOpenWallpaper={() => setShowWallpaperModal(true)} 
      />

      <div className={`flex-1 flex flex-col relative overflow-hidden ${wallpaper === 'default' ? 'chat-wallpaper-light dark:chat-wallpaper-dark' : (currentWallpaper?.className || '')}`} style={currentWallpaper?.style}>
        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <MessageList 
            messages={messages.filter(m => !hiddenMessageIds.includes(String(m.id)))}
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
        theme={theme}
        channel={channelRef.current}
        syncStatus={syncStatus}
        onTypingStatus={handleTypingStatus}
        onMessageSent={(msg) => upsertMessage(msg, 'sending')}
        onMessageConfirmed={(tempId, confirmedMsg) => upsertMessage(confirmedMsg)}
      />

      {selectedImage && <ImageModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />}
      
      {showWallpaperModal && (
        <WallpaperModal 
          currentWallpaper={wallpaper} 
          onSelect={(id) => { setWallpaper(id); localStorage.setItem(wallpaperKey, id); setShowWallpaperModal(false); }} 
          onClose={() => setShowWallpaperModal(false)} 
        />
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111B21] rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-white/5 space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-500">
                <Trash2 size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Wipe History?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium">This action is irreversible and will purge all messages from this channel.</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-4 px-6 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={performClearChat}
                disabled={isClearing}
                className="flex-1 py-4 px-6 bg-red-600 text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-lg shadow-red-600/20 hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center"
              >
                {isClearing ? <Loader2 className="animate-spin" size={16} /> : "Purge Chat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRoom;
