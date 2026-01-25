
import React from 'react';
import { X, Download } from 'lucide-react';

interface ImageModalProps {
  imageUrl: string;
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-300">
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
      >
        <X size={28} />
      </button>

      <div className="max-w-4xl max-h-[85vh] overflow-hidden rounded-lg shadow-2xl animate-in zoom-in-95 duration-300">
        <img src={imageUrl} alt="Fullscreen" className="max-w-full max-h-full object-contain" />
      </div>

      <a 
        href={imageUrl} 
        download 
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-semibold transition-all shadow-lg active:scale-95"
      >
        <Download size={20} />
        <span>Save Image</span>
      </a>
    </div>
  );
};

export default ImageModal;
