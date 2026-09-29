import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, AlertCircle } from 'lucide-react';

export default function CameraCapture({ onCapture, onCancel, title = 'Captura de Verificación Biométrica' }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Initialize Camera
  useEffect(() => {
    let localStream = null;
    async function startCamera() {
      try {
        setIsInitializing(true);
        setCameraError(null);
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Cámara no compatible o no permitida en este navegador.');
        }

        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        setStream(localStream);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }
      } catch (err) {
        console.warn('Error al iniciar cámara:', err);
        setCameraError(err.message || 'No se pudo acceder a la cámara frontal.');
      } finally {
        setIsInitializing(false);
      }
    }

    startCamera();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const takePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setPhoto(dataUrl);
  };

  const handleRetake = () => {
    setPhoto(null);
  };

  const handleConfirm = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onCapture(photo);
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onCancel();
  };

  return (
    <div className="camera-modal-overlay fade-in">
      <div className="camera-modal-card glass-card">
        <div className="camera-modal-header">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-blue-400" />
            <h3 className="camera-title">{title}</h3>
          </div>
          <button onClick={handleClose} className="camera-close-btn" title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="camera-viewport-container">
          {cameraError ? (
            <div className="camera-fallback-msg">
              <AlertCircle size={40} className="text-amber-400 mb-2" />
              <p className="font-semibold text-white">No se detectó cámara disponible</p>
              <p className="text-xs text-slate-400 mb-4">{cameraError}</p>
              <button
                type="button"
                onClick={() => onCapture(null)}
                className="btn btn-secondary text-sm"
              >
                Continuar sin fotografía
              </button>
            </div>
          ) : isInitializing ? (
            <div className="camera-loading">
              <RefreshCw size={32} className="spinning text-blue-400" />
              <p className="text-xs text-slate-300 mt-2">Iniciando cámara frontal...</p>
            </div>
          ) : photo ? (
            <img src={photo} alt="Captura selfie" className="camera-preview-img" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video-stream"
            />
          )}

          {!photo && !cameraError && !isInitializing && (
            <div className="camera-face-guide">
              <div className="camera-oval" />
              <span className="camera-guide-text">Centra tu rostro dentro del óvalo</span>
            </div>
          )}
        </div>

        <div className="camera-modal-actions">
          {photo ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="btn btn-secondary flex items-center gap-2"
              >
                <RefreshCw size={16} /> Repetir
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="btn btn-primary flex items-center gap-2"
              >
                <Check size={16} /> Usar Foto
              </button>
            </>
          ) : !cameraError && !isInitializing ? (
            <>
              <button
                type="button"
                onClick={() => onCapture(null)}
                className="btn btn-ghost text-xs text-slate-400"
              >
                Omitir
              </button>
              <button
                type="button"
                onClick={takePhoto}
                className="btn btn-primary flex items-center gap-2 px-6"
              >
                <Camera size={18} /> Tomar Selfie
              </button>
            </>
          ) : null}
        </div>
      </div>

      <style>{`
        .camera-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.82);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .camera-modal-card {
          width: 100%;
          max-width: 480px;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .camera-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .camera-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #f8fafc;
        }
        .camera-close-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .camera-close-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
        }
        .camera-viewport-container {
          position: relative;
          width: 100%;
          height: 320px;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .camera-video-stream,
        .camera-preview-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }
        .camera-face-guide {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .camera-oval {
          width: 190px;
          height: 250px;
          border: 2px dashed rgba(59, 130, 246, 0.7);
          border-radius: 50%;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);
        }
        .camera-guide-text {
          margin-top: 10px;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.85);
          background: rgba(0, 0, 0, 0.6);
          padding: 4px 10px;
          border-radius: 20px;
        }
        .camera-loading,
        .camera-fallback-msg {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 20px;
        }
        .camera-modal-actions {
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.7);
        }
      `}</style>
    </div>
  );
}
