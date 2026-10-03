import React, { useState } from 'react';

const ManualInput = ({ onSubmit, isLoading }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim()) {
            onSubmit(input);
            setInput('');
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ width: '100%', marginTop: '1rem' }}>
            <div style={{ position: 'relative', width: '100%' }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Or type your question here..."
                    style={{
                        width: '100%',
                        padding: '1rem 1.5rem',
                        borderRadius: '12px',
                        border: '1px solid var(--glass-border)',
                        background: 'rgba(0,0,0,0.2)',
                        color: 'var(--text-primary)',
                        fontSize: '1rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                    }}
                />
                <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: input.trim() ? 'var(--accent-color)' : 'var(--text-secondary)',
                        fontWeight: 'bold',
                        padding: '0.5rem'
                    }}
                >
                    ASK
                </button>
            </div>
        </form>
    );
};

export default ManualInput;
