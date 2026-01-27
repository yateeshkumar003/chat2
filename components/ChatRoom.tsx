
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Message, Theme, USERS } from '../types';
import Header from './Header';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ImageModal from './ImageModal';
import WallpaperModal from './WallpaperModal';
import { Loader2, MessageSquareOff, AlertTriangle, RefreshCcw, XCircle } from 'lucide-react';

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [clearSuccess, setClearSuccess] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'synced' | 'error'>('connecting');
  const [showConnectingBanner, setShowConnectingBanner] = useState(false);
  
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  
  const channelRef = useRef<any>(null);
  const receiverTypingTimeoutRef = useRef<any>(null);

  // Stable message updater
  const upsertMessage = useCallback((msg: Message, defaultStatus: 'sent' | 'sending' = 'sent') => {
    if (!msg.id) return;
    
    setMessages(prev => {
      const msgIdStr = String(msg.id);
      const existingIndex = prev.findIndex(m => String(m.id) === msgIdStr);
      
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = { 
          ...updated[existingIndex], 
          ...msg, 
          status: msg.status || updated[existingIndex].status || 'sent' 
        };
        return updated;
      }
      
      return [...prev, { ...msg, status: msg.status || defaultStatus }];
    });
  }, []);

  // Stable Mark Read logic (Decoupled from state to prevent loops)
  const markMessagesAsRead = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;

    try {
      // Send real-time broadcast ONLY if channel is ready
      if (channelRef.current && channelRef.current.state === 'joined') {
        channelRef.current.send({
          type: 'broadcast',
          event: 'read_receipt',
          payload: { reader: currentUserEmail }
        });
      }

      // Batch update database
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_email', currentUserEmail)
        .eq('sender_email', receiverEmail)
        .eq('is_read', false);
    } catch (e) {
      console.debug('Read sync failed/delayed');
    }
  }, [currentUserEmail, receiverEmail]);

  // Ref to hold current mark read logic for the effect to use without re-triggering
  const markAsReadRef = useRef(markMessagesAsRead);
  useEffect(() => { markAsReadRef.current = markMessagesAsRead; }, [markMessagesAsRead]);

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
        setSyncStatus('error');
      } else if (data) {
        setDbError(null);
        const filtered = data.filter(m => {
          const s = (m.sender_email || '').toLowerCase().trim();
          const r = (m.receiver_email || '').toLowerCase().trim();
          return (s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail);
        });
        setMessages(filtered.map(m => ({ ...m, status: 'sent' })));
        markAsReadRef.current();
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      if (showLoading) setLoadingHistory(false);
    }
  }, [currentUserEmail, receiverEmail]);

  // Banner logic
  useEffect(() => {
    let timer: any;
    if (syncStatus === 'connecting') {
      timer = setTimeout(() => setShowConnectingBanner(true), 1500);
    } else {
      setShowConnectingBanner(false);
      if (timer) clearTimeout(timer);
    }
    return () => clearTimeout(timer);
  }, [syncStatus]);

  // Connection Setup (Stable Dependencies)
  useEffect(() => {
    fetchMessages(true);

    const sortedEmails = [currentUserEmail, receiverEmail].sort();
    const safeRoomId = `room_${sortedEmails[0]}_${sortedEmails[1]}`.replace(/[^a-zA-Z0-9_]/g, '');
    
    const channel = supabase.channel(safeRoomId, {
      config: {
        presence: { key: currentUserEmail },
        broadcast: { self: false }
      }
    });

    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'msg' }, (payload) => {
        if (payload.payload) {
          upsertMessage(payload.payload as Message);
          setIsTyping(false);
          markAsReadRef.current();
        }
      })
      .on('broadcast', { event: 'read_receipt' }, (payload) => {
        if (payload.payload?.reader === receiverEmail) {
          setMessages(prev => prev.map(m => 
            m.sender_email === currentUserEmail ? { ...m, is_read: true } : m
          ));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        const s = (msg.sender_email || '').toLowerCase().trim();
        const r = (msg.receiver_email || '').toLowerCase().trim();
        if ((s === currentUserEmail && r === receiverEmail) || (s === receiverEmail && r === currentUserEmail)) {
          upsertMessage(msg);
          if (r === currentUserEmail) markAsReadRef.current();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        upsertMessage(payload.new as Message);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.old?.id) {
          const deletedId = String(payload.old.id);
          setMessages(prev => prev.filter(m => String(m.id) !== deletedId));
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineUsers = Object.values(state).flat().map((u: any) => u.user);
        setIsReceiverOnline(onlineUsers.includes(receiverEmail));
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user === receiverEmail) {
          setIsTyping(true);
          if (receiverTypingTimeoutRef.current) clearTimeout(receiverTypingTimeoutRef.current);
          receiverTypingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
        }
      })
      .on('broadcast', { event: 'stop_typing' }, () => setIsTyping(false))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus('synced');
          await channel.track({ user: currentUserEmail, online_at: new Date().toISOString() });
          markAsReadRef.current();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setSyncStatus('connecting');
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentUserEmail, receiverEmail, fetchMessages, upsertMessage]);

  // Separate Effect for Visibility/Wake listeners to prevent re-subscriptions
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible') {
        fetchMessages(false); 
        markAsReadRef.current();
        if (channelRef.current && channelRef.current.state === 'joined') {
          channelRef.current.track({ user: currentUserEmail, online_at: new Date().toISOString() });
        }
      }
    };

    window.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [currentUserEmail, fetchMessages]);

  const sendTypingStatus = (status: 'typing' | 'stop_typing') => {
    if (channelRef.current && syncStatus === 'synced') {
      channelRef.current.send({
        type: 'broadcast',
        event: status,
        payload: { user: currentUserEmail }
      });
    }
  };

  const handleConfirmedDeletion = async () => {
    setIsDeleting(true);
    setDeletionError(null);
    try {
      if (showClearConfirm) {
        const { error } = await supabase.from('messages').delete().or(`sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail}`);
        if (error) throw error;
        setMessages([]);
        setShowClearConfirm(false);
        setClearSuccess(true);
        setTimeout(() => setClearSuccess(false), 1500);
      } else if (deleteTarget) {
        const id = deleteTarget;
        const { error } = await supabase.from('messages').delete().eq('id', id);
        if (error) throw error;
        setDeleteTarget(null);
      }
    } catch (err: any) {
      setDeletionError(err.message || 'Deletion failed');
    } finally {
      setIsDeleting(false);
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

  const visibleMessages = messages.filter(m => !hiddenMessageIds.includes(String(m.id)));

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
        onClearChat={() => { setDeletionError(null); setShowClearConfirm(true); }}
        onLogout={() => supabase.auth.signOut()}
        onOpenWallpaper={() => setShowWallpaperModal(true)}
      />
      
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {showConnectingBanner && !loadingHistory && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 backdrop-blur-md text-white text-[9px] font-black px-4 py-1.5 rounded-full flex items-center space-x-2 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
            <RefreshCcw size={10} className="animate-spin" />
            <span className="tracking-widest uppercase">Connecting...</span>
          </div>
        )}

        {(showClearConfirm || deleteTarget) && (
          <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <div className={`bg-white dark:bg-[#111B21] w-full max-w-xs rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10 ${deletionError ? 'shake-animation border-red-500/50' : ''}`}>
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-red-50 dark:bg-red-950/30 text-red-500">
                  {deletionError ? <XCircle size={32} /> : <AlertTriangle size={32} />}
                </div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  {deletionError ? 'Failed' : 'Confirm?'}
                </h3>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${deletionError ? 'text-red-500' : 'text-gray-400'}`}>
                  {deletionError || 'This action cannot be undone.'}
                </p>
              </div>
              <div className="flex border-t dark:border-gray-800">
                <button 
                  disabled={isDeleting}
                  onClick={() => { setShowClearConfirm(false); setDeleteTarget(null); setDeletionError(null); }} 
                  className="flex-1 py-4 text-[10px] font-black uppercase text-gray-400 border-r dark:border-gray-800"
                >
                  Cancel
                </button>
                <button 
                  disabled={isDeleting}
                  onClick={handleConfirmedDeletion} 
                  className="flex-1 py-4 text-[10px] font-black uppercase text-red-500 flex items-center justify-center space-x-2"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <span>Confirm</span>}
                </button>
              </div>
            </div>
          </div>
        )}

        {loadingHistory ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-emerald-500" size={48} />
            <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-[0.4em]">Syncing Encrypted History</p>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 px-6 text-center">
            <MessageSquareOff size={80} className="text-emerald-500 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Messages Yet</p>
          </div>
        ) : (
          <MessageList 
            messages={visibleMessages} 
            currentUserEmail={currentUserEmail} 
            isReceiverOnline={isReceiverOnline}
            onImageClick={setSelectedImage}
            onDeleteMessage={(id, forEveryone) => {
              if (forEveryone) {
                setDeletionError(null);
                setDeleteTarget(String(id));
              } else {
                setHiddenMessageIds(prev => [...prev, String(id)]);
              }
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
        onMessageSent={(msg) => upsertMessage(msg, 'sending')}
        onMessageConfirmed={(tempId, confirmedMsg) => {
          upsertMessage(confirmedMsg);
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
