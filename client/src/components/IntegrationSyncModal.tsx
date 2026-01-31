import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/IntegrationSyncModal.css';

interface Exam {
  title: string;
  date: string;
  time: string;
  type: string;
  source: string;
}

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
    useSimulation?: boolean;
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
  const [exams, setExams] = useState<Exam[]>([]);
  const [logsVisible, setLogsVisible] = useState(true);
  
  // Form inputs
  const [url, setUrl] = useState(initialCredentials?.url || '');
  const [username, setUsername] = useState(initialCredentials?.username || '');
  const [password, setPassword] = useState(initialCredentials?.password || '');
  const [simulationMode, setSimulationMode] = useState(initialCredentials?.useSimulation || false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to latest log
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const startSync = async () => {
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

    // Add initial log
    setLogs([{
      step: 'init',
      status: 'started',
      message: 'Aloitetaan synkronointi...',
      timestamp: new Date().toISOString()
    }]);

    try {
      // Simple POST request - waits for completion (no SSE, works with Vite proxy)
      const response = await fetch(`/api/families/${familyId}/integrations/school/sync-poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          memberId,
          url,
          username,
          password,
          simulate: simulationMode
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        // Error response - use logs if available
        if (result.logs) {
          setLogs(result.logs);
        } else {
          setLogs(prev => [...prev, {
            step: 'error',
            status: 'error',
            message: result.error || 'Sync failed',
            timestamp: new Date().toISOString()
          }]);
        }
        setHasError(true);
        setLogsVisible(true); // Show logs on error
        return;
      }
      
      // Replace logs with backend logs (contains full progress)
      if (result.logs && result.logs.length > 0) {
        setLogs(result.logs);
      }
      
      // Add final success message
      setLogs(prev => [...prev, {
        step: 'complete',
        status: 'success',
        message: `Synkronointi valmis! Lisättiin ${result.added}/${result.total} koetta.`,
        timestamp: new Date().toISOString()
      }]);
      
      setExams(result.exams || []);
      setIsComplete(true);
      setLogsVisible(false); // Auto-collapse logs on success
      
    } catch (error) {
      console.error('Sync error:', error);
      setHasError(true);
      setLogs(prev => [...prev, {
        step: 'error',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }]);
      setLogsVisible(true); // Show logs on error
    }
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

  const handleOverlayClick = () => {
    // Don't close if syncing
    if (isSyncing && !isComplete && !hasError) {
      return;
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="integration-sync-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏫 School Sync</h2>
          <button 
            className="modal-close" 
            onClick={handleOverlayClick}
            disabled={isSyncing && !isComplete && !hasError}
            style={{ cursor: (isSyncing && !isComplete && !hasError) ? 'not-allowed' : 'pointer' }}
          >
            ✕
          </button>
        </div>

        {!isSyncing ? (
          // Input form
          <div style={{ padding: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
              URL
            </label>
            <input
              type="url"
              value={url}
              readOnly
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                cursor: 'not-allowed'
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
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem'
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
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem'
              }}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={simulationMode}
                onChange={(e) => setSimulationMode(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>🎭 Simulation mode (testidataa, ei oikeaa kirjautumista)</span>
            </label>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-cancel" onClick={handleOverlayClick}>
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
          <div className="modal-content">
            <div style={{ borderBottom: '1px solid var(--border-light)' }}>
              <button
                onClick={() => setLogsVisible(!logsVisible)}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  background: 'var(--bg-secondary)',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                <span style={{ transform: logsVisible ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                <span>📋 Synkronoinnin lokit ({logs.length})</span>
              </button>
              
              {logsVisible && (
                <div className="sync-logs" style={{ maxHeight: '300px' }}>
                  {logs.map((log, idx) => (
                    <div key={idx} className={`sync-log-entry ${log.status}`}>
                      <div className="log-header">
                        <span className="log-icon">{getStepIcon(log.step)}</span>
                        <span className="log-step">{log.step.toUpperCase().replace(/_/g, ' ')}</span>
                        <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString('fi-FI')}</span>
                      </div>
                      <div className="log-message" style={{ 
                        color: getStatusColor(log.status),
                        whiteSpace: log.step === 'debug' ? 'pre-wrap' : 'normal',
                        fontFamily: log.step === 'debug' ? 'monospace' : 'inherit',
                        fontSize: log.step === 'debug' ? '0.75rem' : '0.9rem'
                      }}>
                        {log.message}
                      </div>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>

            {!isComplete && !hasError && (
              <div className="sync-progress">
                <div className="spinner" />
                <span>Synkronoidaan...</span>
              </div>
            )}

            {exams.length > 0 && (
              <div style={{ padding: '1rem', borderTop: '1px solid var(--border-light)' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>
                  📚 Löydetyt kokeet ({exams.length})
                </h3>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Päivämäärä</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Koe</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>Aika</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exams.map((exam, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.75rem' }}>
                            {new Date(exam.date).toLocaleDateString('fi-FI', { 
                              weekday: 'short', 
                              day: 'numeric', 
                              month: 'numeric' 
                            })}
                          </td>
                          <td style={{ padding: '0.75rem' }}>{exam.title}</td>
                          <td style={{ padding: '0.75rem' }}>{exam.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
          </div>
        )}

        {isSyncing && (
          <div className="modal-footer">
            <button 
              className="btn-primary" 
              onClick={onClose}
              disabled={!isComplete && !hasError}
            >
              {isComplete || hasError ? 'Sulje' : 'Odota...'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
