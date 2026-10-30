import React, { useState, useEffect } from 'react';
import { FocusDetection } from './FocusDetection';
import { AIFocusAssistant } from './AIFocusAssistant';

interface FocusModeProps {
  duration: number; // in minutes
}

export const FocusMode: React.FC<FocusModeProps> = ({ duration }) => {
  const [timeRemaining, setTimeRemaining] = useState(duration * 60);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isActive || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setIsActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, timeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndSession = () => {
    setIsActive(false);
    // Navigate back or show summary
  };

  return (
    <div className="focus-mode-container">
      <header className="focus-header">
        <div className="status-indicator">
          <span className="brain-icon">🧠</span>
          <span className="status-text">Focus Mode Active</span>
        </div>
        
        <div className="timer">
          <span className="clock-icon">⏰</span>
          <span className="time-display">{formatTime(timeRemaining)}</span>
        </div>

        <button 
          onClick={handleEndSession}
          className="end-session-button"
        >
          ✕ End Session
        </button>
      </header>

      <main className="focus-content">
        <div className="detection-panel">
          <h2>Focus Detection</h2>
          <FocusDetection />
        </div>

        <div className="assistant-panel">
          <h2>Need Help?</h2>
          <AIFocusAssistant />
        </div>
      </main>
    </div>
  );
};
