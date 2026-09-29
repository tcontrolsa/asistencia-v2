import React, { useState } from 'react';
import { AlertTriangle, Clock, Send, X } from 'lucide-react';

export default function JustificationModal({
  isOpen,
  title,
  subtitle,
  placeholder = 'Describe detalladamente el motivo...',
  onConfirm,
  onCancel,
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!motivo.trim() || motivo.trim().length < 5) {
      setError('Por favor ingresa una justificación válida (mínimo 5 caracteres).');
      return;
    }
    onConfirm(motivo.trim());
    setMotivo('');
    setError('');
  };

  return (
    <div className="just-modal-overlay fade-in">
      <div className="just-modal-card glass-card">
        <div className="just-modal-header">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-400" />
            <h3 className="just-title">{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="just-close-btn">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="just-modal-body">
          <p className="just-subtitle">{subtitle}</p>

          <textarea
            className="input-field just-textarea"
            rows={4}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (error) setError('');
            }}
            placeholder={placeholder}
            autoFocus
          />

          {error && <span className="just-error-text">{error}</span>}

          <div className="just-actions">
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary flex items-center gap-2">
              <Send size={16} /> Confirmar Justificación
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .just-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .just-modal-card {
          width: 100%;
          max-width: 460px;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .just-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .just-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #f8fafc;
        }
        .just-close-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
        }
        .just-modal-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .just-subtitle {
          font-size: 0.85rem;
          color: #cbd5e1;
          line-height: 1.4;
        }
        .just-textarea {
          resize: vertical;
          min-height: 90px;
          font-family: inherit;
          font-size: 0.88rem;
        }
        .just-error-text {
          font-size: 0.78rem;
          color: #f87171;
        }
        .just-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}
