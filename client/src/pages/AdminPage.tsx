import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [families, setFamilies] = useState<AdminFamily[]>([]);
  const [superadmins, setSuperadmins] = useState<SuperAdmin[]>([]);
  const [tab, setTab] = useState<'families' | 'users' | 'superadmins'>('families');

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
      return true;
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
      setWizardError(data.error || t('admin.familyCreateFailed'));
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

  const addSuperadmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaError('');
    const body: any = {};
    if (saMode === 'existing') {
      if (!saUserId) { setSaError(t('admin.selectUserError')); return; }
      body.user_id = saUserId;
    } else {
      if (!saEmail || saPassword.length < 8) { setSaError(t('admin.emailPasswordRequired')); return; }
      body.email = saEmail;
      body.password = saPassword;
      body.name = saName || saEmail;
    }
    const res = await fetch('/api/admin/superadmins', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json();
      setSaError(data.error || 'Error');
      return;
    }
    setSaUserId(''); setSaName(''); setSaEmail(''); setSaPassword('');
    loadData();
  };

  const demoteSuperadmin = async (id: number) => {
    if (!confirm(t('admin.removeSuperadminConfirm'))) return;
    const res = await fetch(`/api/admin/superadmins/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Error');
      return;
    }
    loadData();
  };

  const deleteUser = async (id: number) => {
    if (!confirm(t('admin.deleteUserConfirm'))) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    loadData();
  };

  const deleteFamily = async (id: number) => {
    if (!confirm(t('admin.deleteFamilyConfirm'))) return;
    await fetch(`/api/admin/families/${id}`, { method: 'DELETE', headers });
    loadData();
  };

  const inputStyle: React.CSSProperties = { padding: '0.625rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem', width: '100%' };

  const nonSuperadminUsers = users.filter(u => u.role !== 'superadmin');

  return (
    <div className="app">
      <header>
        <h1>⚙️ {t('admin.title')}</h1>
        <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>{t('admin.backToCalendar')}</Link>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'families' ? 'active' : ''} onClick={() => setTab('families')}>{t('admin.tabs.families')}</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>{t('admin.tabs.users')}</button>
        <button className={tab === 'superadmins' ? 'active' : ''} onClick={() => setTab('superadmins')}>{t('admin.tabs.superadmins')}</button>
      </div>

      {tab === 'families' && (
        <div className="admin-section">
          {!wizardOpen ? (
            <button className="btn-primary" style={{ marginBottom: '1.5rem' }} onClick={() => setWizardOpen(true)}>
              {t('admin.createFamily')}
            </button>
          ) : (
            <div style={{ marginBottom: '1.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{t('admin.createFamilyTitle')}</h3>
                <button onClick={resetWizard} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>

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

              {wizardStep === 1 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('admin.familyName')}</label>
                  <input value={wizardFamilyName} onChange={e => setWizardFamilyName(e.target.value)} placeholder={t('admin.familyNamePlaceholder')} style={inputStyle}
                    onKeyDown={e => { if (e.key === 'Enter' && wizardCanNext()) setWizardStep(2); }} autoFocus />
                </div>
              )}

              {wizardStep === 2 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('admin.familyAdmin')}</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <button type="button" className="btn-sm" style={wizardAdminMode === 'existing' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setWizardAdminMode('existing')}>{t('admin.existing')}</button>
                    <button type="button" className="btn-sm" style={wizardAdminMode === 'new' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setWizardAdminMode('new')}>{t('admin.createNew')}</button>
                  </div>
                  {wizardAdminMode === 'existing' && (
                    <select value={wizardAdminId} onChange={e => setWizardAdminId(e.target.value ? parseInt(e.target.value) : '')} style={inputStyle}>
                      <option value="">{t('admin.selfDefault')}</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                    </select>
                  )}
                  {wizardAdminMode === 'new' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input value={wizardAdminName} onChange={e => setWizardAdminName(e.target.value)} placeholder={t('admin.namePlaceholder')} style={inputStyle} />
                      <input type="email" value={wizardAdminEmail} onChange={e => setWizardAdminEmail(e.target.value)} placeholder={t('admin.emailPlaceholder')} style={inputStyle} />
                      <input type="text" value={wizardAdminPassword} onChange={e => setWizardAdminPassword(e.target.value)} placeholder={t('admin.tempPasswordPlaceholder')} style={inputStyle} />
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 3 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('admin.membersOptional')}</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{t('admin.membersOptionalDesc')}</p>

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
                    <input value={wizardNewMemberName} onChange={e => setWizardNewMemberName(e.target.value)} placeholder={t('admin.memberNamePlaceholder')} style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWizardMember(); } }} />
                    <input type="color" value={wizardNewMemberColor} onChange={e => setWizardNewMemberColor(e.target.value)}
                      style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }} />
                    <button type="button" className="btn-sm" onClick={addWizardMember} style={{ background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }}>{t('admin.add')}</button>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('admin.summary')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>{t('admin.summaryFamily')}</span> <strong>{wizardFamilyName}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>{t('admin.summaryAdmin')}</span> <strong>
                      {wizardAdminMode === 'new' ? t('admin.summaryAdminNew', { name: wizardAdminName || wizardAdminEmail }) :
                        wizardAdminId ? users.find(u => u.id === wizardAdminId)?.name || '?' : t('admin.summaryAdminSelf')}
                    </strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>{t('admin.summaryMembers')}</span> <strong>
                      {wizardMembers.length > 0 ? wizardMembers.map(m => m.name).join(', ') : t('admin.summaryNoMembers')}
                    </strong></div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}>
                <button className="btn-sm" onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : resetWizard()}
                  style={{ color: 'var(--text-secondary)' }}>
                  {wizardStep === 1 ? t('admin.cancel') : t('admin.prev')}
                </button>
                {wizardStep < 4 ? (
                  <button className="btn-sm" onClick={() => setWizardStep(wizardStep + 1)}
                    disabled={!wizardCanNext()}
                    style={wizardCanNext() ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : { opacity: 0.5 }}>
                    {t('admin.next')}
                  </button>
                ) : (
                  <button className="btn-primary" onClick={submitWizard}>
                    {t('admin.createFamilyBtn')}
                  </button>
                )}
              </div>
            </div>
          )}

          <table className="admin-table">
            <thead>
              <tr><th>{t('admin.tableHeaders.id')}</th><th>{t('admin.tableHeaders.name')}</th><th>{t('admin.tableHeaders.admin')}</th><th>{t('admin.tableHeaders.inviteCode')}</th><th>{t('admin.tableHeaders.created')}</th><th></th></tr>
            </thead>
            <tbody>
              {families.map(f => (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td>{f.name}</td>
                  <td>{f.owner ? <span>{f.owner.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({f.owner.email})</span></span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td><code>{f.invite_code}</code></td>
                  <td>{f.created_at?.slice(0, 10)}</td>
                  <td><button className="btn-sm btn-danger" onClick={() => deleteFamily(f.id)}>{t('admin.delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'users' && (
        <div className="admin-section">
          <table className="admin-table">
            <thead>
              <tr><th>{t('admin.tableHeaders.id')}</th><th>{t('admin.tableHeaders.name')}</th><th>{t('admin.tableHeaders.email')}</th><th>{t('admin.tableHeaders.role')}</th><th>{t('admin.tableHeaders.created')}</th><th></th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                  <td>{u.created_at?.slice(0, 10)}</td>
                  <td>{u.role !== 'superadmin' && <button className="btn-sm btn-danger" onClick={() => deleteUser(u.id)}>{t('admin.delete')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'superadmins' && (
        <div className="admin-section">
          <div style={{ marginBottom: '1.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('admin.addSuperadmin')}</label>
            {saError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{saError}</div>}
            <form onSubmit={addSuperadmin}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button type="button" className="btn-sm" style={saMode === 'existing' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setSaMode('existing')}>{t('admin.existing')}</button>
                <button type="button" className="btn-sm" style={saMode === 'new' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setSaMode('new')}>{t('admin.createNew')}</button>
              </div>
              {saMode === 'existing' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select value={saUserId} onChange={e => setSaUserId(e.target.value ? parseInt(e.target.value) : '')} style={{ ...inputStyle, flex: 1 }}>
                    <option value="">{t('admin.selectUser')}</option>
                    {nonSuperadminUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                  <button type="submit" className="btn-primary">{t('admin.promote')}</button>
                </div>
              )}
              {saMode === 'new' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input value={saName} onChange={e => setSaName(e.target.value)} placeholder={t('admin.namePlaceholder')} style={inputStyle} />
                  <input type="email" value={saEmail} onChange={e => setSaEmail(e.target.value)} placeholder={t('admin.emailPlaceholder')} style={inputStyle} />
                  <input type="text" value={saPassword} onChange={e => setSaPassword(e.target.value)} placeholder={t('admin.tempPasswordPlaceholder')} style={inputStyle} />
                  <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>{t('admin.createSuperadmin')}</button>
                </div>
              )}
            </form>
          </div>

          <table className="admin-table">
            <thead>
              <tr><th>{t('admin.tableHeaders.id')}</th><th>{t('admin.tableHeaders.name')}</th><th>{t('admin.tableHeaders.email')}</th><th>{t('admin.tableHeaders.created')}</th><th></th></tr>
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
                      <button className="btn-sm btn-danger" onClick={() => demoteSuperadmin(sa.id)}>{t('admin.removeRights')}</button>
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
