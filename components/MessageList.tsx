
import React, { useEffect, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { Message } from '../types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: Message[];
  currentUserEmail: string;
  isReceiverOnline: boolean;
  onImageClick: (url: string) => void;
  onDeleteMessage: (id: string, forEveryone: boolean) => void;
}

const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  currentUserEmail, 
  isReceiverOnline, 
  onImageClick, 
  onDeleteMessage
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom only when messages change or user is already at bottom
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Use useMemo to avoid re-grouping messages on every render (e.g. typing indicators)
  const groupedMessages = useMemo(() => {
    const groups: { [key: string]: Message[] } = {};
    messages.forEach((msg) => {
      try {
        const date = format(new Date(msg.created_at), 'MMMM d, yyyy');
        if (!groups[date]) groups[date] = [];
        groups[date].push(msg);
      } catch (e) {
        console.error("Invalid date in message", msg);
      }
    });
    return groups;
  }, [messages]);

  return (
    <div 
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-6 scroll-smooth scrollbar-hide"
    >
      {Object.entries(groupedMessages).map(([date, msgs]) => (
        <div key={date} className="space-y-4">
          <div className="flex justify-center">
            <span className="px-3 py-1 bg-white/70 dark:bg-gray-800/70 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 rounded-lg shadow-sm backdrop-blur-sm border border-black/5 dark:border-white/5">
              {date}
            </span>
          </div>
          {/* Fix: Explicitly cast msgs to Message[] to handle potential inference issues with Object.entries */}
          {(msgs as Message[]).map((msg) => (
            <MessageItem 
              key={msg.id} 
              message={msg} 
              allMessages={messages}
              isOwn={msg.sender_email === currentUserEmail} 
              isReceiverOnline={isReceiverOnline}
              onImageClick={onImageClick}
              onDeleteMessage={onDeleteMessage}
            />
          ))}
        </div>
      ))}
      <div ref={bottomRef} className="h-4 w-full shrink-0" />
    </div>
  );
};

export default React.memo(MessageList);
