import React from 'react';

const MicButton = ({ isListening, onClick }) => {
    return (
        <div className="flex-center" style={{ flexDirection: 'column', gap: '1rem' }}>
            <button
                onClick={onClick}
                className={`mic-button ${isListening ? 'listening' : ''}`}
                aria-label={isListening ? "Stop listening" : "Start listening"}
                style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    border: 'none',
                    background: isListening ? '#ef4444' : 'var(--accent-color)',
                    color: 'white',
                    boxShadow: isListening
                        ? '0 0 0 0 rgba(239, 68, 68, 0.7)'
                        : '0 4px 14px 0 rgba(56, 189, 248, 0.39)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: isListening ? 'pulse-red 2s infinite' : 'none',
                    zIndex: 10,
                }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isListening ? (
                        <rect x="6" y="4" width="4" height="16"></rect>
                    ) : (
                        <>
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                        </>
                    )}
                    {isListening && <rect x="14" y="4" width="4" height="16"></rect>}
                </svg>
            </button>
            <div style={{
                height: '20px',
                color: isListening ? '#ef4444' : 'var(--text-secondary)',
                fontWeight: 500,
                fontSize: '0.9rem'
            }}>
                {isListening ? 'Listening...' : 'Tap to Speak'}
            </div>
            <style>{`
        @keyframes pulse-red {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 20px rgba(239, 68, 68, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }
      `}</style>
        </div>
    );
};

export default MicButton;
