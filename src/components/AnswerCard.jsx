import React from 'react';
import ReactMarkdown from 'react-markdown';

const AnswerCard = ({ answer, isLoading }) => {
    if (!answer && !isLoading) return null;

    return (
        <div className="glass-panel" style={{
            padding: '2rem',
            marginTop: '2rem',
            width: '100%',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            textAlign: 'left'
        }}>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Suggested Answer
            </h3>

            {isLoading ? (
                <div style={{ width: '100%', space: '10px' }}>
                    <div className="skeleton" style={{ width: '100%', height: '1.2rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>
                    <div className="skeleton" style={{ width: '90%', height: '1.2rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>
                    <div className="skeleton" style={{ width: '95%', height: '1.2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}></div>
                    <style>{`
            .skeleton {
              animation: shimmer 1.5s infinite linear;
              background: linear-gradient(to right, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%);
              background-size: 200% 100%;
            }
            @keyframes shimmer {
              0% { background-position: -200% 0; }
              100% { background-position: 200% 0; }
            }
          `}</style>
                </div>
            ) : (
                <div className="markdown-content" style={{ lineHeight: '1.6', fontSize: '1.1rem' }}>
                    <ReactMarkdown>{answer}</ReactMarkdown>
                </div>
            )}
        </div>
    );
};

export default AnswerCard;
