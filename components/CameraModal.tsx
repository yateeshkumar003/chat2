
import React, { useRef, useEffect, useState } from 'react';
import { X, Camera, RefreshCw, Zap, ZapOff } from 'lucide-react';

interface CameraModalProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const startCamera = async () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // Check for torch/flash support
      const track = newStream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      setHasFlash(!!capabilities.torch);
    } catch (err) {
      console.error("Error accessing camera:", err);
      onClose();
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  const toggleFlash = async () => {
    if (!stream || !hasFlash) return;
    const track = stream.getVideoTracks()[0];
    try {
      await track.applyConstraints({
        advanced: [{ torch: !flashOn } as any]
      });
      setFlashOn(!flashOn);
    } catch (err) {
      console.error("Error toggling flash:", err);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // If using front camera, we might want to mirror the capture
      if (facingMode === 'user') {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          onCapture(blob);
          onClose();
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
      <div className="relative w-full h-full flex flex-col">
        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={onClose} className="p-2 text-white bg-white/10 rounded-full backdrop-blur-md">
            <X size={24} />
          </button>
          <div className="flex space-x-4">
            {hasFlash && (
              <button onClick={toggleFlash} className="p-2 text-white bg-white/10 rounded-full backdrop-blur-md">
                {flashOn ? <Zap size={24} className="text-yellow-400 fill-yellow-400" /> : <ZapOff size={24} />}
              </button>
            )}
            <button onClick={switchCamera} className="p-2 text-white bg-white/10 rounded-full backdrop-blur-md">
              <RefreshCw size={24} />
            </button>
          </div>
        </div>

        {/* Camera Preview */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />

        {/* Capture Control */}
        <div className="absolute bottom-0 left-0 right-0 p-12 flex justify-center items-center z-10 bg-gradient-to-t from-black/50 to-transparent">
          <button
            onClick={capturePhoto}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-transparent active:scale-90 transition-transform p-1"
          >
            <div className="w-full h-full bg-white rounded-full"></div>
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default CameraModal;
