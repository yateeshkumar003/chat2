
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Message, Theme, USERS } from '../types';
import Header from './Header';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ImageModal from './ImageModal';
import WallpaperModal from './WallpaperModal';
import { Loader2 } from 'lucide-react';

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
  const [dbError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(messages.length === 0);
  const [isTyping, setIsTyping] = useState(false);
  const [isReceiverOnline, setIsReceiverOnline] = useState(false);
  const [receiverLastSeen, setReceiverLastSeen] = useState<string | null>(() => localStorage.getItem(lastSeenKey));
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'synced' | 'error'>('connecting');
  const [showClearConfirm] = useState(false);
  const [deleteTarget] = useState<string | null>(null);
  
  const channelRef = useRef<any>(null);
  const receiverTypingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(messagesCacheKey, JSON.stringify(messages));
  }, [messages, messagesCacheKey]);

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
        console.error('Fetch error:', error);
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

        // Update last seen based on the most recent message received from the other person
        const messagesFromReceiver = filtered.filter(m => m.sender_email === receiverEmail);
        if (messagesFromReceiver.length > 0) {
          const latestMsg = messagesFromReceiver[messagesFromReceiver.length - 1];
          setReceiverLastSeen(latestMsg.created_at);
          localStorage.setItem(lastSeenKey, latestMsg.created_at);
        }
      }
    } catch (e) { console.error('Fetch sync failed:', e); }
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
          
          // If the message is from the receiver, update their last seen status
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
          // If they read a message, they are active
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
          // Update the "Last Seen" to their current online session start/heartbeat if available
          if (receiverPresence.online_at) {
            setReceiverLastSeen(receiverPresence.online_at);
            localStorage.setItem(lastSeenKey, receiverPresence.online_at);
          }
        } else {
          setIsReceiverOnline(false);
        }
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user === receiverEmail) {
          setIsTyping(true);
          // Typing also indicates they are active now
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
      channelRef.current = null;
    };
  }, [currentUserEmail, receiverEmail, upsertMessage, fetchMessages, lastSeenKey]);

  useEffect(() => {
    const handleSyncOnResume = () => {
      if (document.visibilityState === 'visible') {
        fetchMessages(false);
        if (channelRef.current && channelRef.current.state === 'joined') {
          channelRef.current.track({ user: currentUserEmail, online_at: new Date().toISOString() });
        }
      }
    };
    window.addEventListener('visibilitychange', handleSyncOnResume);
    window.addEventListener('focus', handleSyncOnResume);
    return () => {
      window.removeEventListener('visibilitychange', handleSyncOnResume);
      window.removeEventListener('focus', handleSyncOnResume);
    };
  }, [currentUserEmail, fetchMessages]);

  const visibleMessages = messages.filter(m => !hiddenMessageIds.includes(String(m.id)));

  return (
    <div className={`flex flex-col h-[100dvh] w-full overflow-hidden transition-all duration-700 relative ${theme === 'dark' ? 'chat-wallpaper-dark' : 'chat-wallpaper-light'}`}>
      <Header 
        receiver={USERS[receiverEmail] || { email: receiverEmail, emoji: '👤' }} 
        toggleTheme={toggleTheme} 
        theme={theme}
        isTyping={isTyping}
        isOnline={isReceiverOnline}
        lastSeenAt={receiverLastSeen}
        syncStatus={syncStatus}
        onClearChat={() => {}} // Implementation for clearing chat would go here
        onLogout={() => supabase.auth.signOut()}
        onOpenWallpaper={() => setShowWallpaperModal(true)}
      />
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {loadingHistory ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-emerald-500" size={48} />
            <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-[0.4em]">Restoring History</p>
          </div>
        ) : (
          <MessageList 
            messages={visibleMessages} 
            currentUserEmail={currentUserEmail} 
            isReceiverOnline={isReceiverOnline}
            onImageClick={setSelectedImage}
            onDeleteMessage={(id) => {
              setHiddenMessageIds(prev => [...prev, String(id)]);
            }}
          />
        )}
      </div>
      <MessageInput 
        senderEmail={currentUserEmail} 
        receiverEmail={receiverEmail} 
        disabled={!!dbError || showClearConfirm || !!deleteTarget}
        theme={theme}
        channel={channelRef.current}
        syncStatus={syncStatus}
        onTypingStatus={(status) => {
          if (channelRef.current && channelRef.current.state === 'joined') {
            channelRef.current.send({ type: 'broadcast', event: status, payload: { user: currentUserEmail } });
          }
        }}
        onMessageSent={(msg) => { upsertMessage(msg, 'sending'); }}
        onMessageConfirmed={(tempId, confirmedMsg) => upsertMessage(confirmedMsg)}
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
