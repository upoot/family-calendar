import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Member {
  id: number;
  name: string;
  color: string;
}

interface Integration {
  id: number;
  member_id: number;
  config: {
    baseUrl: string;
    username: string;
  };
}

interface SchoolIntegrationModalProps {
  familyId: number;
  token: string;
  members: Member[];
  existingIntegration: Integration | null;
  onClose: () => void;
}

export default function SchoolIntegrationModal({
  familyId,
  token,
  members,
  existingIntegration,
  onClose
}: SchoolIntegrationModalProps) {
  const { t } = useTranslation();
  
  const [memberId, setMemberId] = useState<number>(
    existingIntegration?.member_id || (members[0]?.id || 0)
  );
  const [url, setUrl] = useState(existingIntegration?.config.baseUrl || '');
  const [username, setUsername] = useState(existingIntegration?.config.username || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filter out members that already have integrations (except current one)
  const availableMembers = members.filter(m => 
    existingIntegration?.member_id === m.id || 
    !members.some(mem => mem.id !== m.id) // This will be filtered by backend
  );

  const handleSave = async () => {
    if (!memberId || !url.trim() || !username.trim() || !password.trim()) {
      setError('Kaikki kentät vaaditaan');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/families/${familyId}/integrations/school`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          member_id: memberId,
          config: {
            baseUrl: url,
            username: username,
            password: password
          }
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Tallennus epäonnistui');
      }

      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="integration-sync-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏫 {existingIntegration ? 'Muokkaa integraatiota' : 'Uusi integraatio'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {error && (
            <div className="auth-error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Perheenjäsen
          </label>
          <select
            value={memberId}
            onChange={(e) => setMemberId(parseInt(e.target.value))}
            disabled={!!existingIntegration} // Can't change member when editing
            style={{
              width: '100%',
              padding: '0.75rem',
              marginBottom: '1rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              cursor: existingIntegration ? 'not-allowed' : 'pointer'
            }}
          >
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
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
            Käyttäjätunnus
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Käyttäjätunnus"
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
              marginBottom: '1.5rem',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '0.9rem'
            }}
          />

          {existingIntegration && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              💡 Syötä salasana uudelleen päivittääksesi asetukset
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn-cancel" onClick={onClose}>
              Peruuta
            </button>
            <button 
              className="btn-primary" 
              onClick={handleSave}
              disabled={saving || !memberId || !url.trim() || !username.trim() || !password.trim()}
            >
              {saving ? 'Tallennetaan...' : 'Tallenna'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
