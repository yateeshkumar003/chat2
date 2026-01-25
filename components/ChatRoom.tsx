
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Message, Theme, USERS } from '../types';
import Header from './Header';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ImageModal from './ImageModal';
import { Database, Loader2, MessageSquareOff, CheckCircle2, Trash2, AlertTriangle, X } from 'lucide-react';

interface ChatRoomProps {
  session: any;
  theme: Theme;
  toggleTheme: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ session, theme, toggleTheme }) => {
  const currentUserEmail = (session.user.email || '').toLowerCase().trim();
  const receiverEmail = currentUserEmail.includes('shoe') ? 'socks@gmail.com' : 'shoe@gmail.com';
  
  const storageKey = `hidden_messages_${currentUserEmail}`;

  const [messages, setMessages] = useState<Message[]>([]);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isReceiverOnline, setIsReceiverOnline] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);
  
  // Deletion Modal States
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  
  const typingChannelRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(hiddenMessageIds));
  }, [hiddenMessageIds, storageKey]);

  const markMessagesAsRead = useCallback(async () => {
    try {
      // Only attempt to update if there are messages that belong to the other user and are unread
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_email', currentUserEmail)
        .eq('sender_email', receiverEmail)
        .eq('is_read', false);
    } catch (e) {
      console.error('Failed to mark as read:', e);
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
        if (error.code === '42P01') setDbError('DATABASE TABLE MISSING');
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

  useEffect(() => {
    fetchMessages();

    const chatChannel = supabase
      .channel('chat-global-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new as Message;
            const s = (newMessage.sender_email || '').toLowerCase().trim();
            const r = (newMessage.receiver_email || '').toLowerCase().trim();
            if ((s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail)) {
              setMessages((prev) => {
                if (prev.some(m => m.id === newMessage.id)) return prev;
                return [...prev, { ...newMessage, status: 'sent' }];
              });
              // If we are the receiver of this new message, mark it as read immediately
              if (r === currentUserEmail) markMessagesAsRead();
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Message;
            setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
          } else if (payload.eventType === 'DELETE') {
            if (payload.old && payload.old.id) {
              setMessages(prev => prev.filter(m => m.id !== payload.old.id));
            } else {
              fetchMessages(false);
            }
          }
        }
      )
      .subscribe();

    const roomChannel = supabase.channel(`room-presence`);
    typingChannelRef.current = roomChannel;

    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        const onlineUsers = Object.values(state).flat().map((u: any) => u.user);
        setIsReceiverOnline(onlineUsers.includes(receiverEmail));
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.user === receiverEmail) setIsTyping(true);
      })
      .on('broadcast', { event: 'stopped_typing' }, (payload) => {
        if (payload.payload.user === receiverEmail) setIsTyping(false);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await roomChannel.track({ user: currentUserEmail, online_at: new Date().toISOString() });
        }
      });

    // Also mark as read when window/tab is focused
    const handleFocus = () => markMessagesAsRead();
    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(roomChannel);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUserEmail, receiverEmail, fetchMessages, markMessagesAsRead]);

  const executeClearChat = async () => {
    setShowClearConfirm(false);
    setIsClearing(true);
    const snapshot = [...messages];
    try {
      const mediaFiles = snapshot
        .flatMap(m => [m.image_url, m.audio_url])
        .filter((url): url is string => !!url)
        .map(url => url.split('/').pop())
        .filter((name): name is string => !!name);

      if (mediaFiles.length > 0) {
        await supabase.storage.from('media').remove(mediaFiles);
      }

      const { error: dbError } = await supabase
        .from('messages')
        .delete()
        .or(`sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail}`);

      if (dbError) {
        await supabase.from('messages').delete().eq('sender_email', currentUserEmail);
      }

      setMessages([]);
      setHiddenMessageIds([]);
      localStorage.removeItem(storageKey);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 2000);
    } catch (err: any) {
      console.error(err);
      fetchMessages(false);
    } finally {
      setIsClearing(false);
    }
  };

  const executeDeleteForEveryone = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    
    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    try {
      if (msg.image_url || msg.audio_url) {
        const filename = (msg.image_url || msg.audio_url)?.split('/').pop();
        if (filename) await supabase.storage.from('media').remove([filename]);
      }
      await supabase.from('messages').delete().eq('id', id);
    } catch (err) {
      console.error("Deletion failed:", err);
    }
  };

  const handleDeleteMessage = (id: string, forEveryone: boolean) => {
    if (forEveryone) {
      setDeleteTarget(id);
    } else {
      setHiddenMessageIds(prev => [...prev, id]);
    }
  };

  const sendTypingStatus = (status: 'typing' | 'stopped_typing') => {
    if (typingChannelRef.current) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: status,
        payload: { user: currentUserEmail }
      });
    }
  };

  const visibleMessages = messages.filter(m => !hiddenMessageIds.includes(m.id));

  return (
    <div className={`flex flex-col h-[100dvh] w-full overflow-hidden transition-all duration-700 ${theme === 'dark' ? 'chat-wallpaper-dark' : 'chat-wallpaper-light'}`}>
      <Header 
        receiver={USERS[receiverEmail] || { email: receiverEmail, emoji: '👤' }} 
        toggleTheme={toggleTheme} 
        theme={theme}
        isTyping={isTyping}
        isOnline={isReceiverOnline}
        onClearChat={() => setShowClearConfirm(true)}
        onLogout={() => supabase.auth.signOut()}
      />
      
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* Universal Confirmation Modal */}
        {(showClearConfirm || deleteTarget) && (
          <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-[#111B21] w-full max-w-xs rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10 scale-100 animate-in zoom-in-95 duration-200">
              <div className="p-8 text-center space-y-5">
                <div className="w-20 h-20 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-500/5">
                  <AlertTriangle size={36} className="text-red-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    {showClearConfirm ? 'Wipe Entire Chat?' : 'Delete Message?'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] leading-relaxed mt-2 opacity-70">
                    {showClearConfirm 
                      ? 'This will permanently erase all history and media for both users.' 
                      : 'This message will be removed for everyone in the chat.'}
                  </p>
                </div>
              </div>
              <div className="flex border-t dark:border-gray-800">
                <button 
                  onClick={() => { setShowClearConfirm(false); setDeleteTarget(null); }} 
                  className="flex-1 py-5 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-r dark:border-gray-800"
                >
                  Cancel
                </button>
                <button 
                  onClick={showClearConfirm ? executeClearChat : executeDeleteForEveryone} 
                  className="flex-1 py-5 text-[11px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {isClearing && (
          <div className="absolute inset-0 z-[110] bg-white/70 dark:bg-black/70 backdrop-blur-md flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 size={50} className="animate-spin text-emerald-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">Securely Wiping...</p>
            </div>
          </div>
        )}
        
        {clearSuccess && (
          <div className="absolute inset-0 z-[120] bg-emerald-500 flex items-center justify-center text-white text-3xl font-black uppercase animate-in fade-in zoom-in">
            Success
          </div>
        )}

        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={48} /></div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessageSquareOff size={100} className="text-emerald-500/10 mb-6" />
            <p className="text-[11px] font-black uppercase text-gray-400 tracking-[0.4em]">Empty Conversation</p>
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
    </div>
  );
};

export default ChatRoom;
