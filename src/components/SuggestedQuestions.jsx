import React from 'react';

const SuggestedQuestions = ({ suggestions, onSelect, isLoading }) => {
    if (isLoading) {
        return (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
                {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton" style={{ width: '120px', height: '32px', borderRadius: '16px' }} />
                ))}
            </div>
        );
    }

    if (!suggestions || suggestions.length === 0) return null;

    return (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
            {suggestions.map((q, idx) => (
                <button
                    key={idx}
                    onClick={() => onSelect(q)}
                    style={{
                        padding: '0.5rem 1rem',
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: '20px',
                        color: 'var(--accent-color)',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap',
                        maxWidth: '250px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    {q}
                </button>
            ))}
        </div>
    );
};

export default SuggestedQuestions;
