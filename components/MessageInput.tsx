
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Send, Smile, Paperclip, Mic, Loader2, StopCircle } from 'lucide-react';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import { supabase } from '../supabaseClient';
import { Message, Theme } from '../types';

interface MessageInputProps {
  senderEmail: string;
  receiverEmail: string;
  disabled?: boolean;
  theme: Theme;
  channel?: any;
  onTypingStatus: (status: 'typing' | 'stop_typing') => void;
  onMessageSent: (msg: Message) => void;
  onMessageConfirmed: (tempId: string, confirmedMsg: Message) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ 
  senderEmail, 
  receiverEmail, 
  disabled, 
  theme, 
  channel,
  onTypingStatus, 
  onMessageSent, 
  onMessageConfirmed 
}) => {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const lastTypingTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    const now = Date.now();
    if (now - lastTypingTimeRef.current > 1000) {
      onTypingStatus('typing');
      lastTypingTimeRef.current = now;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTypingStatus('stop_typing');
      lastTypingTimeRef.current = 0;
    }, 2000);
  };

  const handleSend = useCallback(async (content: { text?: string, imageUrl?: string, audioUrl?: string }) => {
    if (disabled) return;
    const finalMsg = content.text?.trim();
    if (!finalMsg && !content.imageUrl && !content.audioUrl) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTypingStatus('stop_typing');
    lastTypingTimeRef.current = 0;

    const messageId = Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const now = new Date().toISOString();
    
    const messagePayload: Message = {
      id: String(messageId),
      sender_email: senderEmail.toLowerCase().trim(),
      receiver_email: receiverEmail.toLowerCase().trim(),
      message_text: finalMsg || null,
      image_url: content.imageUrl || null,
      audio_url: content.audioUrl || null,
      created_at: now,
      is_read: false,
      status: 'sending'
    };

    onMessageSent(messagePayload);
    setText('');
    setShowEmojiPicker(false);

    // Speed fix: Do not await the broadcast. It's for ephemeral UI feel.
    // Explicitly catching to avoid the "Realtime fallback to REST" warning/logic
    if (channel && channel.state === 'joined') {
      channel.send({
        type: 'broadcast',
        event: 'msg',
        payload: { ...messagePayload, status: 'sent' }
      }).catch(() => {
        // Silently catch to prevent the SDK from falling back to REST automatically
      });
    }

    const insertData = {
      id: messageId,
      sender_email: messagePayload.sender_email,
      receiver_email: messagePayload.receiver_email,
      message_text: messagePayload.message_text,
      image_url: messagePayload.image_url,
      audio_url: messagePayload.audio_url,
      is_read: false,
      created_at: now
    };

    try {
      const { data, error } = await supabase.from('messages').insert([insertData]).select().single();
      if (error) throw error;
      if (data) onMessageConfirmed(messageId, { ...data, status: 'sent' });
    } catch (err) {
      onMessageConfirmed(messageId, { ...messagePayload, status: 'error' });
    }
  }, [senderEmail, receiverEmail, disabled, channel, onTypingStatus, onMessageSent, onMessageConfirmed]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || disabled) return;
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const cleanName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      await supabase.storage.from('media').upload(cleanName, file);
      const { data } = supabase.storage.from('media').getPublicUrl(cleanName);
      await handleSend({ imageUrl: data.publicUrl });
    } catch (err) { console.error('Upload failed'); }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsUploading(true);
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webm`;
        await supabase.storage.from('media').upload(fileName, audioBlob);
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName);
        await handleSend({ audioUrl: publicUrl });
        setIsUploading(false);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) { console.error('Mic error'); }
  };

  return (
    <div className={`bg-[#F0F2F5] dark:bg-[#202C33] p-2 md:p-4 border-t border-gray-200 dark:border-gray-800 relative transition-colors duration-500 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-0 w-full md:max-w-sm z-50 shadow-2xl rounded-t-2xl overflow-hidden">
          <EmojiPicker onEmojiClick={(e) => setText(t => t + e.emoji)} theme={theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT} width="100%" height={350} />
          <div className="fixed inset-0 z-[-1]" onClick={() => setShowEmojiPicker(false)} />
        </div>
      )}
      <div className="flex items-center space-x-1 md:space-x-2 max-w-5xl mx-auto">
        {!isRecording ? (
          <>
            <div className="flex items-center shrink-0">
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2 text-gray-600 dark:text-[#8696a0] hover:text-emerald-500 transition-colors"><Smile size={24} /></button>
              <button onClick={startRecording} className="p-2 text-gray-600 dark:text-[#8696a0] hover:text-emerald-500 transition-colors"><Mic size={24} /></button>
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-600 dark:text-[#8696a0] hover:text-emerald-500 transition-colors"><Paperclip size={24} className="-rotate-45" /></button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
            <input
              type="text"
              value={text}
              onChange={handleInputChange}
              onKeyDown={(e) => e.key === 'Enter' && handleSend({ text })}
              placeholder="Type a message"
              className="flex-1 min-w-0 py-2.5 px-4 bg-white dark:bg-[#2A3942] rounded-2xl outline-none text-base font-medium text-gray-900 dark:text-white border border-transparent focus:border-emerald-500/20 placeholder-gray-400 dark:placeholder-gray-600 shadow-inner"
            />
            {(text.trim() || isUploading) && (
              <button 
                onClick={() => handleSend({ text })} 
                className="p-3 bg-emerald-500 dark:bg-emerald-600 text-white rounded-full shadow-lg active:scale-90 flex items-center justify-center transition-all hover:bg-emerald-600" 
                disabled={isUploading}
              >
                {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-between bg-white dark:bg-[#2A3942] rounded-2xl px-4 py-2 border-2 border-emerald-500/20 shadow-inner animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">{recordingTime}s Recording</span>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={() => setIsRecording(false)} className="text-red-500 hover:text-red-600 font-black text-[10px] uppercase transition-colors">Cancel</button>
              <button onClick={() => mediaRecorderRef.current?.stop()} className="p-2 bg-emerald-500 text-white rounded-full shadow-lg active:scale-90"><StopCircle size={20} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MessageInput);
