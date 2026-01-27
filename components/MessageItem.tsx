
import React, { useState, useRef, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { Message } from '../types';
import { Play, Pause, Check, CheckCheck, Loader2, Image as ImageIcon, AlertCircle, MoreHorizontal, Trash2, UserMinus, ImageOff } from 'lucide-react';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  isReceiverOnline: boolean;
  onImageClick: (url: string) => void;
  onDeleteMessage: (id: string, forEveryone: boolean) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isOwn, isReceiverOnline, onImageClick, onDeleteMessage }) => {
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
    
    if (message.status === 'error') {
      return (
        <div className="flex items-center space-x-1.5 ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900/40 rounded-full border border-red-200 dark:border-red-800 transition-all duration-75">
          <AlertCircle size={10} className="text-red-600 dark:text-red-400" strokeWidth={3} />
          <span className="text-[7px] font-black uppercase text-red-600 dark:text-red-400 tracking-tighter">Failed</span>
        </div>
      );
    }

    if (message.status === 'sending') {
      return (
        <div className="flex items-center space-x-1 ml-1.5 opacity-60">
          <span className="text-[7px] font-black uppercase text-gray-400 tracking-widest">Sending</span>
          <Loader2 size={11} className="animate-spin text-gray-400" />
        </div>
      );
    }
    
    // BLUE TICKS: Read status always takes absolute precedence
    if (message.is_read === true) {
      return (
        <div className="flex items-center ml-1 transition-colors duration-75 animate-in zoom-in-75 duration-100">
          <CheckCheck size={18} className="text-[#34B7F1]" strokeWidth={3} />
        </div>
      );
    }
    
    // GRAY DOUBLE TICKS: Delivered status
    if (isReceiverOnline) {
      return (
        <div className="flex items-center ml-1 transition-colors duration-75">
          <CheckCheck size={18} className="text-gray-400 dark:text-gray-500" strokeWidth={2.4} />
        </div>
      );
    }

    // GRAY SINGLE TICK: Sent status
    return (
      <div className="flex items-center ml-1 transition-colors duration-75">
        <Check size={18} className="text-gray-400 dark:text-gray-500" strokeWidth={2.4} />
      </div>
    );
  };

  const getBubbleClasses = () => {
    const baseClasses = "max-w-[85%] md:max-w-[70%] rounded-[1.25rem] p-1 shadow-sm relative ring-1 transition-all duration-300 transform";
    const shapeClasses = isOwn ? "rounded-tr-none" : "rounded-tl-none";
    
    let colorClasses = "";
    if (isOwn) {
      if (message.status === 'error') {
        colorClasses = "bg-red-50 dark:bg-red-950/40 ring-red-500/50 shake-animation border-r-4 border-r-red-500";
      } else {
        colorClasses = "bg-whatsapp-sender dark:bg-whatsapp-senderDark ring-black/5 dark:ring-white/5";
      }
    } else {
      colorClasses = "bg-whatsapp-receiver dark:bg-whatsapp-receiverDark ring-black/5 dark:ring-white/5";
    }
    
    return `${baseClasses} ${shapeClasses} ${colorClasses}`;
  };

  return (
    <div className={`flex group/msg ${isOwn ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-300 relative`}>
      <div className={getBubbleClasses()}>
        <div className="p-1 flex flex-col relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className={`absolute top-1 right-1 p-1 rounded-full bg-black/10 dark:bg-white/10 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10 text-gray-600 dark:text-gray-300 hover:bg-black/20 dark:hover:bg-white/20`}
          >
            <MoreHorizontal size={14} />
          </button>

          {showMenu && (
            <div 
              ref={menuRef}
              className={`absolute top-8 ${isOwn ? 'right-0' : 'left-0'} z-20 bg-white dark:bg-[#233138] shadow-2xl rounded-xl border dark:border-white/10 py-1 min-w-[160px] animate-in zoom-in-95 duration-100`}
            >
              <button 
                onClick={() => { onDeleteMessage(message.id, false); setShowMenu(false); }}
                className="w-full flex items-center space-x-3 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <UserMinus size={14} className="text-gray-400" />
                <span>Delete for Me</span>
              </button>
              {isOwn && (
                <button 
                  onClick={() => { onDeleteMessage(message.id, true); setShowMenu(false); }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Delete for Everyone</span>
                </button>
              )}
            </div>
          )}

          {message.image_url && (
            <div className="relative mb-0.5 rounded-xl overflow-hidden cursor-pointer bg-black/5 min-h-[120px] max-h-80" onClick={() => onImageClick(message.image_url!)}>
              {(!imageLoaded && !imageError) && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 animate-pulse bg-gray-100 dark:bg-black/20">
                  <ImageIcon size={32} />
                </div>
              )}
              {imageError ? (
                <div className="flex flex-col items-center justify-center p-8 bg-gray-100 dark:bg-black/40 text-gray-400 space-y-2">
                  <ImageOff size={32} />
                  <span className="text-[10px] font-black uppercase tracking-tighter">Media Unavailable</span>
                  <span className="text-[8px] opacity-50 text-center px-4 leading-tight">URL Restricted or Network Failure</span>
                </div>
              ) : (
                <img 
                  src={message.image_url} 
                  alt="Shared" 
                  className={`max-h-80 w-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} 
                  onLoad={() => setImageLoaded(true)} 
                  onError={() => {
                    console.warn('Image failed to load:', message.image_url);
                    setImageError(true);
                  }}
                  loading="lazy" 
                />
              )}
            </div>
          )}

          {message.audio_url && (
            <div className="flex items-center space-x-3 px-3 py-3 bg-black/5 dark:bg-white/5 rounded-[1rem] min-w-[210px] mb-0.5">
              <button onClick={() => isPlaying ? audioRef.current?.pause() : audioRef.current?.play()} className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-md active:scale-90 transition-transform">
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>
              <div className="flex-1 space-y-1.5">
                <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${audioProgress}%` }} />
                </div>
                <div className="text-[8px] font-black uppercase text-black/40 dark:text-white/40 tracking-widest">Voice Recording</div>
              </div>
              <audio ref={audioRef} src={message.audio_url} />
            </div>
          )}

          {message.message_text && (
            <p className={`px-3 py-1.5 pr-8 text-sm md:text-base leading-relaxed break-words font-medium ${isOwn && message.status === 'error' ? 'text-red-800 dark:text-red-200' : 'text-black dark:text-gray-100'}`}>
              {message.message_text}
            </p>
          )}

          <div className="flex items-center justify-end space-x-0.5 px-2 pb-0.5 mt-0.5 select-none">
            <span className={`text-[9px] font-black uppercase ${isOwn && message.status === 'error' ? 'text-red-500/70' : 'text-black/50 dark:text-white/40'}`}>
              {format(new Date(message.created_at), 'HH:mm')}
            </span>
            {renderStatus()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(MessageItem);
