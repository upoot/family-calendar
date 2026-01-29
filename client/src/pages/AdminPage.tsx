import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface AdminFamily {
  id: number;
  name: string;
  slug: string;
  invite_code: string;
  created_at: string;
  owner?: { id: number; name: string; email: string } | null;
}

interface SuperAdmin {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

interface WizardMember {
  name: string;
  color: string;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function AdminPage() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [families, setFamilies] = useState<AdminFamily[]>([]);
  const [superadmins, setSuperadmins] = useState<SuperAdmin[]>([]);
  const [tab, setTab] = useState<'families' | 'users' | 'superadmins'>('families');

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardFamilyName, setWizardFamilyName] = useState('');
  const [wizardAdminMode, setWizardAdminMode] = useState<'existing' | 'new'>('existing');
  const [wizardAdminId, setWizardAdminId] = useState<number | ''>('');
  const [wizardAdminName, setWizardAdminName] = useState('');
  const [wizardAdminEmail, setWizardAdminEmail] = useState('');
  const [wizardAdminPassword, setWizardAdminPassword] = useState('');
  const [wizardMembers, setWizardMembers] = useState<WizardMember[]>([]);
  const [wizardNewMemberName, setWizardNewMemberName] = useState('');
  const [wizardNewMemberColor, setWizardNewMemberColor] = useState(COLORS[0]);
  const [wizardError, setWizardError] = useState('');

  // Superadmin form state
  const [saMode, setSaMode] = useState<'existing' | 'new'>('existing');
  const [saUserId, setSaUserId] = useState<number | ''>('');
  const [saName, setSaName] = useState('');
  const [saEmail, setSaEmail] = useState('');
  const [saPassword, setSaPassword] = useState('');
  const [saError, setSaError] = useState('');

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const loadData = () => {
    fetch('/api/admin/users', { headers }).then(r => r.json()).then(setUsers);
    fetch('/api/families', { headers }).then(r => r.json()).then(setFamilies);
    fetch('/api/admin/superadmins', { headers }).then(r => r.json()).then(setSuperadmins);
  };

  useEffect(() => { loadData(); }, []);

  // ── Wizard ──────────────────────────────────────────────────────────────

  const resetWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    setWizardFamilyName('');
    setWizardAdminMode('existing');
    setWizardAdminId('');
    setWizardAdminName('');
    setWizardAdminEmail('');
    setWizardAdminPassword('');
    setWizardMembers([]);
    setWizardNewMemberName('');
    setWizardNewMemberColor(COLORS[0]);
    setWizardError('');
  };

  const wizardCanNext = () => {
    if (wizardStep === 1) return wizardFamilyName.trim().length > 0;
    if (wizardStep === 2) {
      if (wizardAdminMode === 'new') return wizardAdminEmail.trim().length > 0 && wizardAdminPassword.length >= 8;
      return true; // existing mode always valid (default = self)
    }
    return true;
  };

  const submitWizard = async () => {
    setWizardError('');
    const body: any = { name: wizardFamilyName };
    if (wizardAdminMode === 'existing' && wizardAdminId) {
      body.admin_user_id = wizardAdminId;
    } else if (wizardAdminMode === 'new' && wizardAdminEmail) {
      body.admin_user = { name: wizardAdminName || wizardAdminEmail, email: wizardAdminEmail, password: wizardAdminPassword };
    }
    if (wizardMembers.length > 0) {
      body.members = wizardMembers;
    }

    const res = await fetch('/api/families', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json();
      setWizardError(data.error || 'Perheen luonti epäonnistui');
      return;
    }
    resetWizard();
    loadData();
  };

  const addWizardMember = () => {
    if (!wizardNewMemberName.trim()) return;
    setWizardMembers([...wizardMembers, { name: wizardNewMemberName, color: wizardNewMemberColor }]);
    setWizardNewMemberName('');
    setWizardNewMemberColor(COLORS[(wizardMembers.length + 1) % COLORS.length]);
  };

  const removeWizardMember = (i: number) => {
    setWizardMembers(wizardMembers.filter((_, idx) => idx !== i));
  };

  // ── Superadmin management ───────────────────────────────────────────────

  const addSuperadmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaError('');
    const body: any = {};
    if (saMode === 'existing') {
      if (!saUserId) { setSaError('Valitse käyttäjä'); return; }
      body.user_id = saUserId;
    } else {
      if (!saEmail || saPassword.length < 8) { setSaError('Sähköposti ja salasana (väh. 8 merkkiä) vaaditaan'); return; }
      body.email = saEmail;
      body.password = saPassword;
      body.name = saName || saEmail;
    }
    const res = await fetch('/api/admin/superadmins', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json();
      setSaError(data.error || 'Virhe');
      return;
    }
    setSaUserId(''); setSaName(''); setSaEmail(''); setSaPassword('');
    loadData();
  };

  const demoteSuperadmin = async (id: number) => {
    if (!confirm('Poista superadmin-oikeudet?')) return;
    const res = await fetch(`/api/admin/superadmins/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Virhe');
      return;
    }
    loadData();
  };

  // ── Existing actions ────────────────────────────────────────────────────

  const deleteUser = async (id: number) => {
    if (!confirm('Poista käyttäjä?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    loadData();
  };

  const deleteFamily = async (id: number) => {
    if (!confirm('Poista perhe ja kaikki sen tiedot?')) return;
    await fetch(`/api/admin/families/${id}`, { method: 'DELETE', headers });
    loadData();
  };

  const inputStyle: React.CSSProperties = { padding: '0.625rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem', width: '100%' };

  // Users that are not already superadmins (for promote dropdown)
  const nonSuperadminUsers = users.filter(u => u.role !== 'superadmin');

  return (
    <div className="app">
      <header>
        <h1>⚙️ Hallintapaneeli</h1>
        <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>← Kalenteriin</Link>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'families' ? 'active' : ''} onClick={() => setTab('families')}>Perheet</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Käyttäjät</button>
        <button className={tab === 'superadmins' ? 'active' : ''} onClick={() => setTab('superadmins')}>Superadminit</button>
      </div>

      {/* ── FAMILIES TAB ─────────────────────────────────────────────────── */}
      {tab === 'families' && (
        <div className="admin-section">
          {!wizardOpen ? (
            <button className="btn-primary" style={{ marginBottom: '1.5rem' }} onClick={() => setWizardOpen(true)}>
              + Luo uusi perhe
            </button>
          ) : (
            <div style={{ marginBottom: '1.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Luo uusi perhe</h3>
                <button onClick={resetWizard} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>

              {/* Step indicators */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {[1, 2, 3, 4].map(s => (
                  <div key={s} style={{
                    flex: 1, height: '4px', borderRadius: '2px',
                    background: s <= wizardStep ? 'var(--accent)' : 'var(--border-light)',
                    transition: 'background 0.2s'
                  }} />
                ))}
              </div>

              {wizardError && <div className="auth-error" style={{ marginBottom: '1rem' }}>{wizardError}</div>}

              {/* Step 1: Family name */}
              {wizardStep === 1 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Perheen nimi</label>
                  <input value={wizardFamilyName} onChange={e => setWizardFamilyName(e.target.value)} placeholder="esim. Virtaset" style={inputStyle}
                    onKeyDown={e => { if (e.key === 'Enter' && wizardCanNext()) setWizardStep(2); }} autoFocus />
                </div>
              )}

              {/* Step 2: Admin */}
              {wizardStep === 2 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Perheen ylläpitäjä</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <button type="button" className="btn-sm" style={wizardAdminMode === 'existing' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setWizardAdminMode('existing')}>Olemassa oleva</button>
                    <button type="button" className="btn-sm" style={wizardAdminMode === 'new' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setWizardAdminMode('new')}>Luo uusi</button>
                  </div>
                  {wizardAdminMode === 'existing' && (
                    <select value={wizardAdminId} onChange={e => setWizardAdminId(e.target.value ? parseInt(e.target.value) : '')} style={inputStyle}>
                      <option value="">— Minä itse (oletus) —</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                    </select>
                  )}
                  {wizardAdminMode === 'new' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input value={wizardAdminName} onChange={e => setWizardAdminName(e.target.value)} placeholder="Nimi" style={inputStyle} />
                      <input type="email" value={wizardAdminEmail} onChange={e => setWizardAdminEmail(e.target.value)} placeholder="Sähköposti" style={inputStyle} />
                      <input type="text" value={wizardAdminPassword} onChange={e => setWizardAdminPassword(e.target.value)} placeholder="Väliaikainen salasana (väh. 8 merkkiä)" style={inputStyle} />
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Members */}
              {wizardStep === 3 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Jäsenet (valinnainen)</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Lisää kalenteri-rivit (swimlane) perheenjäsenille, tai ohita — ylläpitäjä lisää myöhemmin.</p>

                  {wizardMembers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.75rem' }}>
                      {wizardMembers.map((m, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: '0.85rem' }}>{m.name}</span>
                          <button onClick={() => removeWizardMember(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input value={wizardNewMemberName} onChange={e => setWizardNewMemberName(e.target.value)} placeholder="Jäsenen nimi" style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWizardMember(); } }} />
                    <input type="color" value={wizardNewMemberColor} onChange={e => setWizardNewMemberColor(e.target.value)}
                      style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }} />
                    <button type="button" className="btn-sm" onClick={addWizardMember} style={{ background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }}>Lisää</button>
                  </div>
                </div>
              )}

              {/* Step 4: Summary */}
              {wizardStep === 4 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Yhteenveto</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Perhe:</span> <strong>{wizardFamilyName}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Ylläpitäjä:</span> <strong>
                      {wizardAdminMode === 'new' ? `${wizardAdminName || wizardAdminEmail} (uusi)` :
                        wizardAdminId ? users.find(u => u.id === wizardAdminId)?.name || '?' : 'Minä itse'}
                    </strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Jäsenet:</span> <strong>
                      {wizardMembers.length > 0 ? wizardMembers.map(m => m.name).join(', ') : 'Ei vielä lisätty'}
                    </strong></div>
                  </div>
                </div>
              )}

              {/* Navigation buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}>
                <button className="btn-sm" onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : resetWizard()}
                  style={{ color: 'var(--text-secondary)' }}>
                  {wizardStep === 1 ? 'Peruuta' : '← Edellinen'}
                </button>
                {wizardStep < 4 ? (
                  <button className="btn-sm" onClick={() => setWizardStep(wizardStep + 1)}
                    disabled={!wizardCanNext()}
                    style={wizardCanNext() ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : { opacity: 0.5 }}>
                    Seuraava →
                  </button>
                ) : (
                  <button className="btn-primary" onClick={submitWizard}>
                    Luo perhe
                  </button>
                )}
              </div>
            </div>
          )}

          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Nimi</th><th>Ylläpitäjä</th><th>Kutsukoodi</th><th>Luotu</th><th></th></tr>
            </thead>
            <tbody>
              {families.map(f => (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td>{f.name}</td>
                  <td>{f.owner ? <span>{f.owner.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({f.owner.email})</span></span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td><code>{f.invite_code}</code></td>
                  <td>{f.created_at?.slice(0, 10)}</td>
                  <td><button className="btn-sm btn-danger" onClick={() => deleteFamily(f.id)}>Poista</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── USERS TAB ────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="admin-section">
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Nimi</th><th>Sähköposti</th><th>Rooli</th><th>Luotu</th><th></th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                  <td>{u.created_at?.slice(0, 10)}</td>
                  <td>{u.role !== 'superadmin' && <button className="btn-sm btn-danger" onClick={() => deleteUser(u.id)}>Poista</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SUPERADMINS TAB ──────────────────────────────────────────────── */}
      {tab === 'superadmins' && (
        <div className="admin-section">
          <div style={{ marginBottom: '1.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Lisää superadmin</label>
            {saError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{saError}</div>}
            <form onSubmit={addSuperadmin}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button type="button" className="btn-sm" style={saMode === 'existing' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setSaMode('existing')}>Olemassa oleva</button>
                <button type="button" className="btn-sm" style={saMode === 'new' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setSaMode('new')}>Luo uusi</button>
              </div>
              {saMode === 'existing' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select value={saUserId} onChange={e => setSaUserId(e.target.value ? parseInt(e.target.value) : '')} style={{ ...inputStyle, flex: 1 }}>
                    <option value="">— Valitse käyttäjä —</option>
                    {nonSuperadminUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                  <button type="submit" className="btn-primary">Ylennä</button>
                </div>
              )}
              {saMode === 'new' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input value={saName} onChange={e => setSaName(e.target.value)} placeholder="Nimi" style={inputStyle} />
                  <input type="email" value={saEmail} onChange={e => setSaEmail(e.target.value)} placeholder="Sähköposti" style={inputStyle} />
                  <input type="text" value={saPassword} onChange={e => setSaPassword(e.target.value)} placeholder="Väliaikainen salasana (väh. 8 merkkiä)" style={inputStyle} />
                  <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>Luo superadmin</button>
                </div>
              )}
            </form>
          </div>

          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Nimi</th><th>Sähköposti</th><th>Luotu</th><th></th></tr>
            </thead>
            <tbody>
              {superadmins.map(sa => (
                <tr key={sa.id}>
                  <td>{sa.id}</td>
                  <td>{sa.name}</td>
                  <td>{sa.email}</td>
                  <td>{sa.created_at?.slice(0, 10)}</td>
                  <td>
                    {sa.id !== currentUser?.id && (
                      <button className="btn-sm btn-danger" onClick={() => demoteSuperadmin(sa.id)}>Poista oikeudet</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
