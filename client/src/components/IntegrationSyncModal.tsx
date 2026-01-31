import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/IntegrationSyncModal.css';

interface LogEntry {
  step: string;
  status: 'started' | 'success' | 'error';
  message: string;
  timestamp: string;
}

interface IntegrationSyncModalProps {
  onClose: () => void;
  familyId: number;
  username: string;
  password: string;
}

export default function IntegrationSyncModal({ onClose, familyId, username, password }: IntegrationSyncModalProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to latest log
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    // Setup SSE connection
    const url = `/api/families/${familyId}/integrations/school/sync-stream?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      const data: LogEntry = JSON.parse(event.data);
      
      setLogs(prev => [...prev, data]);

      if (data.step === 'complete') {
        setIsComplete(true);
        setTimeout(() => eventSource.close(), 500);
      }

      if (data.status === 'error') {
        setHasError(true);
        setTimeout(() => eventSource.close(), 500);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setHasError(true);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [familyId, username, password]);

  const getStepIcon = (step: string) => {
    switch (step) {
      case 'init': return '🚀';
      case 'auth': return '🔐';
      case 'navigate': return '🧭';
      case 'find_exams': return '📚';
      case 'save': return '💾';
      case 'complete': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'started': return 'var(--color-info)';
      case 'success': return 'var(--color-success)';
      case 'error': return 'var(--color-danger)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="integration-sync-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏫 School Sync</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="sync-logs">
          {logs.map((log, idx) => (
            <div key={idx} className={`sync-log-entry ${log.status}`}>
              <div className="log-header">
                <span className="log-icon">{getStepIcon(log.step)}</span>
                <span className="log-step">{log.step.toUpperCase().replace(/_/g, ' ')}</span>
                <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString('fi-FI')}</span>
              </div>
              <div className="log-message" style={{ color: getStatusColor(log.status) }}>
                {log.message}
              </div>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {!isComplete && !hasError && (
          <div className="sync-progress">
            <div className="spinner" />
            <span>Synkronoidaan...</span>
          </div>
        )}

        {isComplete && (
          <div className="sync-result success">
            <span className="result-icon">✅</span>
            <span>Synkronointi valmis!</span>
          </div>
        )}

        {hasError && (
          <div className="sync-result error">
            <span className="result-icon">❌</span>
            <span>Virhe synkronoinnissa. Tarkista lokit yllä.</span>
          </div>
        )}

        <div className="modal-footer">
          <button 
            className="btn-primary" 
            onClick={onClose}
            disabled={!isComplete && !hasError}
          >
            {isComplete || hasError ? 'Sulje' : 'Odota...'}
          </button>
        </div>
      </div>
    </div>
  );
}
