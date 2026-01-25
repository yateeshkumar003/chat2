
import React, { useEffect, useRef } from 'react';
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

const MessageList: React.FC<MessageListProps> = ({ messages, currentUserEmail, isReceiverOnline, onImageClick, onDeleteMessage }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    msgs.forEach((msg) => {
      const date = format(new Date(msg.created_at), 'MMMM d, yyyy');
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
    });
    return groups;
  };

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 scroll-smooth scrollbar-hide">
      {Object.entries(groupedMessages).map(([date, msgs]) => (
        <div key={date} className="space-y-4">
          <div className="flex justify-center">
            <span className="px-3 py-1 bg-white/70 dark:bg-gray-800/70 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 rounded-lg shadow-sm backdrop-blur-sm">
              {date}
            </span>
          </div>
          {msgs.map((msg) => (
            <MessageItem 
              key={msg.id} 
              message={msg} 
              isOwn={msg.sender_email === currentUserEmail} 
              isReceiverOnline={isReceiverOnline}
              onImageClick={onImageClick}
              onDeleteMessage={onDeleteMessage}
            />
          ))}
        </div>
      ))}
      <div ref={bottomRef} className="h-4" />
    </div>
  );
};

export default MessageList;
