import React, { useState, useEffect } from 'react';
import MicButton from './components/MicButton';
import AnswerCard from './components/AnswerCard';
import ManualInput from './components/ManualInput';
import SettingsModal from './components/SettingsModal';
import SuggestedQuestions from './components/SuggestedQuestions';
import useSpeechToText from './hooks/useSpeechToText';
import { initializeGemini, generateAnswer, fetchSuggestions } from './services/ai';

function App() {
  const [company, setCompany] = useState('general');
  const [showSettings, setShowSettings] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);

  // Suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);

  // Initialize Speech Hook
  const { isListening, transcript, startListening, stopListening, resetTranscript } = useSpeechToText();

  // Load suggestions on start and when company changes
  useEffect(() => {
    const loadSuggestions = async () => {
      setIsSuggestionsLoading(true);
      const data = await fetchSuggestions(company);
      setSuggestions(data);
      setIsSuggestionsLoading(false);
    };
    loadSuggestions();
  }, [company]);

  // Handler for handling Manual Question
  const handleManualSubmit = async (text) => {
    setIsLoading(true);

    // Get answer with conversation history
    const answer = await generateAnswer(text, company, conversationHistory);
    setAiAnswer(answer);

    // Add this exchange to history
    setConversationHistory(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: answer }
    ]);

    setIsLoading(false);
  };

  // Clear conversation history
  const handleClearHistory = () => {
    setConversationHistory([]);
    setAiAnswer('');
  };

  // Handler for Mic Toggle
  const toggleListening = async () => {
    if (isListening) {
      stopListening();
      // Wait a brief moment for final transcript to settle
      if (transcript.trim().length > 5) {
        handleManualSubmit(transcript);
      }
    } else {
      setAiAnswer(''); // Clear previous answer
      resetTranscript();
      startListening();
    }
  };

  const handleSaveSettings = (newCompany) => {
    setCompany(newCompany);
    // Clear history when context changes
    setConversationHistory([]);
  };

  return (
    <div className="container flex-center" style={{ minHeight: '100vh', flexDirection: 'column', position: 'relative' }}>
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
        currentCompany={company}
      />

      <header style={{ marginBottom: '2rem', textAlign: 'center', position: 'relative', width: '100%', maxWidth: '600px' }}>
        <h1 style={{ fontSize: '2.5rem', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Interview AI
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {company === 'general' ? 'General Interview Coach' : `Specialized Coach: ${company.substring(0, 30)}${company.length > 30 ? '...' : ''}`}
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.5rem' }}>
          {conversationHistory.length > 0 && (
            <button
              onClick={handleClearHistory}
              style={{
                padding: '0.3rem 0.8rem',
                fontSize: '0.75rem',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              🗑️ Clear History
            </button>
          )}
        </div>
      </header>

      <main style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <MicButton isListening={isListening} onClick={toggleListening} />

        <div style={{ width: '100%', margin: '2rem 0', minHeight: '60px', textAlign: 'center' }}>
          {transcript ? (
            <div style={{
              padding: '1rem',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>You: </span>
              <span style={{ color: 'var(--text-primary)' }}>{transcript}</span>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {isListening ? "Listening only to you..." : "Ready to listen."}
            </div>
          )}
        </div>

        {/* Conversation History Display */}
        {conversationHistory.length > 0 && (
          <div style={{
            width: '100%',
            maxHeight: '200px',
            overflowY: 'auto',
            marginBottom: '1rem',
            padding: '0.5rem',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '12px',
            fontSize: '0.85rem'
          }}>
            {conversationHistory.map((msg, idx) => (
              <div key={idx} style={{
                padding: '0.5rem',
                marginBottom: '0.3rem',
                borderRadius: '8px',
                background: msg.role === 'user' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                borderLeft: `3px solid ${msg.role === 'user' ? '#3b82f6' : '#22c55e'}`
              }}>
                <strong style={{ color: msg.role === 'user' ? '#3b82f6' : '#22c55e' }}>
                  {msg.role === 'user' ? 'You' : 'AI'}:
                </strong>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>
                  {msg.content.substring(0, 150)}{msg.content.length > 150 ? '...' : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <AnswerCard answer={aiAnswer} isLoading={isLoading} />

        <SuggestedQuestions
          suggestions={suggestions}
          onSelect={handleManualSubmit}
          isLoading={isSuggestionsLoading}
        />

        <ManualInput onSubmit={handleManualSubmit} isLoading={isLoading} />
      </main>

      <div style={{ position: 'absolute', bottom: '1rem', right: '1rem' }}>
        <button
          onClick={() => setShowSettings(true)}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.5 }}
        >
          Context Settings
        </button>
      </div>
    </div>
  );
}

export default App;
