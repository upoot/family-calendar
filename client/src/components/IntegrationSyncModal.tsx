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
  memberId?: number;
  initialCredentials?: {
    url: string;
    username: string;
    password: string;
  };
}

export default function IntegrationSyncModal({ 
  onClose, 
  familyId, 
  memberId,
  initialCredentials 
}: IntegrationSyncModalProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Form inputs
  const [url, setUrl] = useState(initialCredentials?.url || '');
  const [username, setUsername] = useState(initialCredentials?.username || '');
  const [password, setPassword] = useState(initialCredentials?.password || '');
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-start sync if credentials provided
  useEffect(() => {
    if (initialCredentials && memberId) {
      // Need to re-enter password
      if (!initialCredentials.password) {
        setIsSyncing(false);
      } else {
        startSync();
      }
    }
  }, []);

  useEffect(() => {
    // Auto-scroll to latest log
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const startSync = () => {
    if (!url.trim() || !username.trim() || !password.trim()) {
      return;
    }
    
    if (!memberId) {
      alert('Member ID puuttuu');
      return;
    }

    setIsSyncing(true);
    setLogs([]);
    setIsComplete(false);
    setHasError(false);

    // Setup SSE connection
    const sseUrl = `/api/families/${familyId}/integrations/school/sync-stream?memberId=${memberId}&url=${encodeURIComponent(url)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const eventSource = new EventSource(sseUrl);

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
  };

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

        {!isSyncing ? (
          // Input form
          <div style={{ padding: '1.5rem' }}>
            {initialCredentials && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                💡 Syötä salasana synkronoidaksesi
              </p>
            )}
            
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              readOnly={!!initialCredentials}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1rem',
                background: initialCredentials ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                cursor: initialCredentials ? 'not-allowed' : 'text'
              }}
            />

            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Käyttäjätunnus
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Käyttäjätunnus"
              readOnly={!!initialCredentials}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1rem',
                background: initialCredentials ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                cursor: initialCredentials ? 'not-allowed' : 'text'
              }}
            />

            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Salasana
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Salasana"
              autoFocus={!!initialCredentials}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1.5rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem'
              }}
            />

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-cancel" onClick={onClose}>
                Peruuta
              </button>
              <button 
                className="btn-primary" 
                onClick={startSync}
                disabled={!url.trim() || !username.trim() || !password.trim() || !memberId}
              >
                Aloita synkronointi
              </button>
            </div>
          </div>
        ) : (
          // Sync logs
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
