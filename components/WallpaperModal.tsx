
import React from 'react';
import { X, Check } from 'lucide-react';
import { Wallpaper, WALLPAPERS } from '../types';

interface WallpaperModalProps {
  currentWallpaper: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const WallpaperModal: React.FC<WallpaperModalProps> = ({ currentWallpaper, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#111B21] w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10 animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b dark:border-gray-800 flex justify-between items-center">
          <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Chat Wallpaper</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-2 gap-4">
            {WALLPAPERS.map((wp) => (
              <button
                key={wp.id}
                onClick={() => onSelect(wp.id)}
                className={`relative group h-24 rounded-2xl overflow-hidden border-4 transition-all ${
                  currentWallpaper === wp.id ? 'border-emerald-500 scale-95' : 'border-transparent hover:border-emerald-500/30'
                } ${wp.id === 'default' ? 'chat-wallpaper-light dark:chat-wallpaper-dark' : wp.className || 'bg-white dark:bg-gray-800'}`}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                  <span className={`text-[10px] font-black uppercase tracking-widest text-black dark:text-white px-2 py-1 bg-white/80 dark:bg-black/80 rounded-lg ${currentWallpaper === wp.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {wp.name}
                  </span>
                </div>
                {currentWallpaper === wp.id && (
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-1 shadow-lg">
                    <Check size={12} strokeWidth={4} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-t dark:border-gray-800 bg-gray-50 dark:bg-black/20">
          <p className="text-[9px] text-gray-500 dark:text-gray-400 font-bold uppercase text-center tracking-widest">
            Personalize your chat experience locally
          </p>
        </div>
      </div>
    </div>
  );
};

export default WallpaperModal;
