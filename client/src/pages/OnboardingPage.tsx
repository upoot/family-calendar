import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PRESET_COLORS = ['#f472b6', '#22d3ee', '#fbbf24', '#a78bfa', '#34d399', '#f87171', '#fb923c', '#60a5fa'];

interface NewMember {
  id: number;
  name: string;
  color: string;
}

interface MemberAccount {
  memberId: number;
  email: string;
  password: string;
  enabled: boolean;
}

export default function OnboardingPage() {
  const { token, refreshUser, setCurrentFamilyId } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [familyName, setFamilyName] = useState('');
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [members, setMembers] = useState<NewMember[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [memberAccounts, setMemberAccounts] = useState<MemberAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountErrors, setAccountErrors] = useState<Record<number, string>>({});

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/families', { method: 'POST', headers, body: JSON.stringify({ name: familyName }) });
      if (!res.ok) throw new Error('Perheen luonti epäonnistui');
      const family = await res.json();
      setFamilyId(family.id);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addMember = async () => {
    if (!newName.trim() || !familyId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/members', {
        method: 'POST', headers,
        body: JSON.stringify({ name: newName, color: newColor, family_id: familyId }),
      });
      if (!res.ok) throw new Error('Jäsenen lisäys epäonnistui');
      const member = await res.json();
      setMembers(prev => [...prev, { id: member.id, name: member.name, color: member.color }]);
      setNewName('');
      setNewColor(PRESET_COLORS[(members.length + 1) % PRESET_COLORS.length]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!familyId) return;
    setCurrentFamilyId(familyId);
    await refreshUser();
    navigate('/');
  };

  const moveMember = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= members.length) return;
    const updated = [...members];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setMembers(updated);
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: '500px' }}>
        <h1>📅 Perheen kalenteri</h1>
        
        <div className="onboarding-steps">
          <div className={`onboarding-step ${step >= 1 ? 'active' : ''}`}>1</div>
          <div className="onboarding-line" />
          <div className={`onboarding-step ${step >= 2 ? 'active' : ''}`}>2</div>
          <div className="onboarding-line" />
          <div className={`onboarding-step ${step >= 3 ? 'active' : ''}`}>3</div>
          <div className="onboarding-line" />
          <div className={`onboarding-step ${step >= 4 ? 'active' : ''}`}>4</div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {step === 1 && (
          <>
            <h2>Luo perhe</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center' }}>
              Anna perheellesi nimi aloittaaksesi.
            </p>
            <form onSubmit={handleCreateFamily}>
              <label>Perheen nimi</label>
              <input value={familyName} onChange={e => setFamilyName(e.target.value)} placeholder="Esim. Virtaset" required autoFocus />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Luodaan...' : 'Seuraava →'}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Lisää perheenjäsenet</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center' }}>
              Lisää jäsenet joille haluat omat rivit kalenteriin.
            </p>

            {members.length > 0 && (
              <div className="onboarding-members">
                {members.map((m, i) => (
                  <div key={i} className="onboarding-member">
                    <span className="member-dot" style={{ background: m.color }} />
                    <span style={{ flex: 1 }}>{m.name}</span>
                    <button type="button" className="btn-sm" onClick={() => moveMember(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="btn-sm" onClick={() => moveMember(i, 1)} disabled={i === members.length - 1}>↓</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Jäsenen nimi"
                style={{ flex: 1, padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } }}
              />
              <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                style={{ width: '44px', height: '44px', padding: '2px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
              />
              <button type="button" className="btn-primary" style={{ padding: '0.625rem 1rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }} onClick={addMember} disabled={loading || !newName.trim()}>
                Lisää
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-cancel" style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }} onClick={() => setStep(1)}>
                ← Takaisin
              </button>
              <button type="button" className="btn-primary" style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }} onClick={() => {
                // Initialize member accounts for step 3
                setMemberAccounts(members.map(m => ({ memberId: m.id, email: '', password: '', enabled: false })));
                setStep(3);
              }} disabled={members.length === 0}>
                Seuraava →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Luo käyttäjätilit jäsenille</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
              Luo halutessasi kirjautumistilit perheenjäsenille. Voit ohittaa tämän vaiheen.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {members.map((m, i) => {
                const account = memberAccounts.find(a => a.memberId === m.id);
                if (!account) return null;
                return (
                  <div key={m.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: account.enabled ? '0.75rem' : 0 }}>
                      <input
                        type="checkbox"
                        checked={account.enabled}
                        onChange={e => {
                          const updated = [...memberAccounts];
                          const idx = updated.findIndex(a => a.memberId === m.id);
                          updated[idx] = { ...updated[idx], enabled: e.target.checked };
                          setMemberAccounts(updated);
                        }}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      <span className="member-dot" style={{ background: m.color }} />
                      <span style={{ fontWeight: 500 }}>{m.name}</span>
                    </div>
                    {account.enabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '2.5rem' }}>
                        <input
                          type="email"
                          value={account.email}
                          onChange={e => {
                            const updated = [...memberAccounts];
                            const idx = updated.findIndex(a => a.memberId === m.id);
                            updated[idx] = { ...updated[idx], email: e.target.value };
                            setMemberAccounts(updated);
                          }}
                          placeholder="Sähköposti"
                          style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                        />
                        <input
                          type="text"
                          value={account.password}
                          onChange={e => {
                            const updated = [...memberAccounts];
                            const idx = updated.findIndex(a => a.memberId === m.id);
                            updated[idx] = { ...updated[idx], password: e.target.value };
                            setMemberAccounts(updated);
                          }}
                          placeholder="Väliaikainen salasana (väh. 8 merkkiä)"
                          style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                        />
                        {accountErrors[m.id] && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>{accountErrors[m.id]}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-cancel" style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }} onClick={() => setStep(4)}>
                Ohita →
              </button>
              <button type="button" className="btn-primary" style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }} onClick={async () => {
                const enabled = memberAccounts.filter(a => a.enabled);
                if (enabled.length === 0) { setStep(4); return; }
                setLoading(true);
                const errors: Record<number, string> = {};
                for (const acc of enabled) {
                  if (!acc.email || !acc.password || acc.password.length < 8) {
                    errors[acc.memberId] = !acc.email ? 'Sähköposti vaaditaan' : 'Salasanan on oltava väh. 8 merkkiä';
                    continue;
                  }
                  try {
                    const res = await fetch(`/api/families/${familyId}/users`, {
                      method: 'POST', headers,
                      body: JSON.stringify({ name: members.find(m => m.id === acc.memberId)?.name, email: acc.email, password: acc.password, memberId: acc.memberId }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      errors[acc.memberId] = data.error || 'Virhe';
                    }
                  } catch {
                    errors[acc.memberId] = 'Verkkovirhe';
                  }
                }
                setAccountErrors(errors);
                setLoading(false);
                if (Object.keys(errors).length === 0) setStep(4);
              }} disabled={loading}>
                {loading ? 'Luodaan...' : 'Luo tilit ja jatka →'}
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2>✅ Valmis!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center' }}>
              Perhe <strong>{familyName}</strong> on luotu {members.length} jäsenellä.
            </p>
            <div className="onboarding-members" style={{ marginBottom: '1.5rem' }}>
              {members.map((m, i) => (
                <div key={i} className="onboarding-member">
                  <span className="member-dot" style={{ background: m.color }} />
                  <span>{m.name}</span>
                </div>
              ))}
            </div>
            <button type="button" className="btn-primary" style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.9rem' }} onClick={handleFinish}>
              Avaa kalenteri 📅
            </button>
          </>
        )}
      </div>
    </div>
  );
}
