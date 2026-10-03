import React, { useState } from 'react';

const SettingsModal = ({ isOpen, onClose, onSave, currentCompany }) => {
    const [company, setCompany] = useState(currentCompany || 'general');

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(company);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(5px)'
        }}>
            <div className="glass-panel" style={{ padding: '2rem', width: '90%', maxWidth: '400px' }}>
                <h2 style={{ marginBottom: '1rem' }}>My Skills Context</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Define your tech stack so the AI acts as a specialized expert.
                </p>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Your Technical Skills (e.g. React, Python, AWS)</label>
                <textarea
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="E.g. Java, Spring Boot, Microservices..."
                    rows={4}
                    style={{
                        width: '100%', padding: '0.8rem', borderRadius: '8px',
                        border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)',
                        color: 'white', marginBottom: '1.5rem', boxSizing: 'border-box',
                        fontFamily: 'inherit', resize: 'vertical'
                    }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', color: 'var(--text-secondary)', border: 'none',
                            padding: '0.8rem', cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            background: 'var(--accent-color)', color: 'white', border: 'none',
                            padding: '0.8rem 1.5rem', borderRadius: '8px', fontWeight: 'bold'
                        }}
                    >
                        Save Context
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
