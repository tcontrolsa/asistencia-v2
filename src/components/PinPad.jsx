import React from 'react';
import { Delete, Check } from 'lucide-react';

export default function PinPad({ value = '', onChange, onConfirm, maxLength = 6, disabled = false }) {
  const handleDigit = (digit) => {
    if (disabled) return;
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
  };

  return (
    <div className="pinpad-container">
      {/* PIN dots display */}
      <div className="pin-dots">
        {Array.from({ length: maxLength }).map((_, idx) => (
          <div
            key={idx}
            className={`pin-dot ${idx < value.length ? 'filled' : ''}`}
          />
        ))}
      </div>

      {/* Grid of keys */}
      <div className="pinpad-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            className="pinpad-key"
            onClick={() => handleDigit(digit)}
            disabled={disabled}
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          className="pinpad-key action-key clear"
          onClick={handleClear}
          disabled={disabled || value.length === 0}
          title="Borrar todo"
        >
          C
        </button>

        <button
          type="button"
          className="pinpad-key"
          onClick={() => handleDigit('0')}
          disabled={disabled}
        >
          0
        </button>

        <button
          type="button"
          className="pinpad-key action-key backspace"
          onClick={handleBackspace}
          disabled={disabled || value.length === 0}
          title="Borrar último"
        >
          <Delete size={20} />
        </button>
      </div>

      {onConfirm && (
        <button
          type="button"
          className="btn btn-primary pin-confirm-btn"
          onClick={onConfirm}
          disabled={disabled || value.length < 4}
        >
          <Check size={18} />
          <span>Confirmar PIN</span>
        </button>
      )}

      <style>{`
        .pinpad-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          user-select: none;
          max-width: 320px;
          margin: 0 auto;
        }
        .pin-dots {
          display: flex;
          gap: 12px;
          padding: 8px 16px;
        }
        .pin-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          transition: all 0.2s ease;
        }
        .pin-dot.filled {
          background: var(--primary);
          border-color: var(--primary);
          box-shadow: 0 0 10px var(--primary-glow);
          transform: scale(1.15);
        }
        .pinpad-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          width: 100%;
        }
        .pinpad-key {
          height: 64px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pinpad-key:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }
        .pinpad-key:active:not(:disabled) {
          transform: scale(0.94);
          background: rgba(59, 130, 246, 0.2);
        }
        .pinpad-key:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .pinpad-key.action-key {
          font-size: 1.1rem;
          color: var(--text-muted);
        }
        .pinpad-key.action-key.clear {
          font-weight: 700;
          color: #f87171;
        }
        .pinpad-key.action-key.backspace {
          color: #fbbf24;
        }
        .pin-confirm-btn {
          width: 100%;
          height: 52px;
          font-size: 1rem;
        }
      `}</style>
    </div>
  );
}
