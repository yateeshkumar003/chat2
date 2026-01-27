
import React, { useState, useRef, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { Message } from '../types';
import { Play, Pause, Check, CheckCheck, Loader2, AlertCircle, MoreHorizontal, Trash2, UserMinus, ImageOff } from 'lucide-react';

interface MessageItemProps {
  message: Message;
  allMessages: Message[];
  isOwn: boolean;
  isReceiverOnline: boolean;
  onImageClick: (url: string) => void;
  onDeleteMessage: (id: string, forEveryone: boolean) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ 
  message, 
  isOwn, 
  isReceiverOnline, 
  onImageClick, 
  onDeleteMessage
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setAudioProgress((audio.currentTime / audio.duration) * 100 || 0);
    const handleEnded = () => { setIsPlaying(false); setAudioProgress(0); };
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const renderStatus = () => {
    if (!isOwn) return null;
    if (message.status === 'error') return (
      <div className="flex items-center space-x-1 ml-1" title="Failed to Sync">
        <AlertCircle size={12} className="text-red-500" />
        <span className="text-[7px] text-red-500 font-black uppercase">Offline</span>
      </div>
    );
    if (message.status === 'sending') return <Loader2 size={11} className="animate-spin text-gray-400 dark:text-gray-500 ml-1" />;
    if (message.is_read) return <CheckCheck size={18} className="text-[#34B7F1] ml-1" strokeWidth={3} />;
    if (isReceiverOnline) return <CheckCheck size={18} className="text-gray-400 dark:text-gray-500 ml-1" strokeWidth={2.4} />;
    return <Check size={18} className="text-gray-400 dark:text-gray-500 ml-1" strokeWidth={2.4} />;
  };

  const getBubbleClasses = () => {
    const baseClasses = "max-w-[85%] md:max-w-[70%] rounded-[1.25rem] p-1 shadow-sm relative ring-1 transition-all duration-300 transform";
    const shapeClasses = isOwn ? "rounded-tr-none" : "rounded-tl-none";
    let colorClasses = isOwn 
      ? "bg-whatsapp-sender dark:bg-whatsapp-senderDark ring-black/5 dark:ring-white/5" 
      : "bg-whatsapp-receiver dark:bg-whatsapp-receiverDark ring-black/5 dark:ring-white/5";
    
    if (message.status === 'error') colorClasses += " border-red-500/30 shake-animation";
    
    return `${baseClasses} ${shapeClasses} ${colorClasses}`;
  };

  return (
    <div className={`flex group/msg ${isOwn ? 'justify-end' : 'justify-start'} relative mb-1`}>
      <div className={getBubbleClasses()}>
        <div className="p-1 flex flex-col relative">
          
          <div className="absolute top-1 right-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10">
            <button 
              onClick={() => { setShowMenu(!showMenu); }}
              className="p-1.5 rounded-full bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>

          {showMenu && (
            <div 
              ref={menuRef}
              className={`absolute top-10 ${isOwn ? 'right-0' : 'left-0'} z-20 bg-white dark:bg-[#233138] shadow-2xl rounded-xl border border-gray-100 dark:border-white/10 py-1 min-w-[160px] animate-in zoom-in-95 duration-100`}
            >
              <button 
                onClick={() => { onDeleteMessage(message.id, false); setShowMenu(false); }}
                className="w-full flex items-center space-x-3 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5"
              >
                <UserMinus size={14} />
                <span>Delete for Me</span>
              </button>
              {isOwn && (
                <button 
                  onClick={() => { onDeleteMessage(message.id, true); setShowMenu(false); }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={14} />
                  <span>Delete for Everyone</span>
                </button>
              )}
            </div>
          )}

          {message.image_url && (
            <div className="relative mb-0.5 rounded-xl overflow-hidden cursor-pointer" onClick={() => onImageClick(message.image_url!)}>
              {imageError ? (
                <div className="p-8 bg-gray-100 dark:bg-black/20 text-gray-400 dark:text-gray-500 flex flex-col items-center"><ImageOff size={24} /><span className="text-[8px] uppercase mt-1">Error</span></div>
              ) : (
                <img 
                  src={message.image_url} 
                  alt="Shared" 
                  className={`max-h-80 w-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} 
                  onLoad={() => setImageLoaded(true)} 
                  onError={() => setImageError(true)}
                />
              )}
            </div>
          )}

          {message.audio_url && (
            <div className="flex items-center space-x-3 px-3 py-3 bg-black/5 dark:bg-white/5 rounded-xl min-w-[210px] mb-0.5">
              <button onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()} className="w-10 h-10 rounded-full bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md active:scale-95">
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>
              <audio ref={audioRef} src={message.audio_url} />
              <div className="flex-1 h-1 bg-black/10 dark:bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-200" style={{ width: `${audioProgress}%` }} />
              </div>
            </div>
          )}

          {message.message_text && (
            <p className={`px-3 py-1.5 text-sm md:text-base leading-relaxed break-words font-medium ${isOwn ? 'text-gray-900 dark:text-white' : 'text-gray-900 dark:text-gray-100'}`}>
              {message.message_text}
            </p>
          )}

          <div className={`flex items-center justify-end px-2 pb-0.5 mt-0.5 text-[9px] font-black uppercase ${isOwn ? 'text-gray-600/70 dark:text-white/50' : 'text-gray-500 dark:text-white/40'}`}>
            {format(new Date(message.created_at), 'HH:mm')}
            {renderStatus()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(MessageItem);
