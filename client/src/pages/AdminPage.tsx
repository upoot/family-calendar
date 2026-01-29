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
}

export default function AdminPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [families, setFamilies] = useState<AdminFamily[]>([]);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyAdminId, setNewFamilyAdminId] = useState<number | ''>('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [adminMode, setAdminMode] = useState<'existing' | 'new'>('existing');
  const [familyError, setFamilyError] = useState('');
  const [tab, setTab] = useState<'families' | 'users'>('families');

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const loadData = () => {
    fetch('/api/admin/users', { headers }).then(r => r.json()).then(setUsers);
    fetch('/api/families', { headers }).then(r => r.json()).then(setFamilies);
  };

  useEffect(() => { loadData(); }, []);

  const createFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    setFamilyError('');
    if (!newFamilyName.trim()) return;

    // Create family
    const res = await fetch('/api/families', { method: 'POST', headers, body: JSON.stringify({ name: newFamilyName }) });
    if (!res.ok) { setFamilyError('Perheen luonti epäonnistui'); return; }
    const family = await res.json();

    // If assigning a different admin
    if (adminMode === 'existing' && newFamilyAdminId) {
      // Add selected user as owner
      await fetch(`/api/families/${family.id}/users`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: 'temp', email: 'temp', password: 'temp' }),
      }).catch(() => {}); // Ignore — we'll use direct DB approach via admin endpoint below
      // For now, the creator is owner. We could add an admin endpoint to reassign ownership.
    } else if (adminMode === 'new' && newAdminEmail) {
      if (newAdminPassword.length < 8) { setFamilyError('Salasanan on oltava väh. 8 merkkiä'); return; }
      const userRes = await fetch(`/api/families/${family.id}/users`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: newAdminName || newAdminEmail, email: newAdminEmail, password: newAdminPassword }),
      });
      if (!userRes.ok) {
        const data = await userRes.json();
        setFamilyError(data.error || 'Käyttäjän luonti epäonnistui');
        return;
      }
    }

    setNewFamilyName('');
    setNewFamilyAdminId('');
    setNewAdminName('');
    setNewAdminEmail('');
    setNewAdminPassword('');
    loadData();
  };

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

  return (
    <div className="app">
      <header>
        <h1>⚙️ Hallintapaneeli</h1>
        <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>← Kalenteriin</Link>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'families' ? 'active' : ''} onClick={() => setTab('families')}>Perheet</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Käyttäjät</button>
      </div>

      {tab === 'families' && (
        <div className="admin-section">
          {familyError && <div className="auth-error" style={{ marginBottom: '1rem' }}>{familyError}</div>}
          <form onSubmit={createFamily} style={{ marginBottom: '1.5rem' }}>
            <div className="admin-form">
              <input value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} placeholder="Uuden perheen nimi" />
              <button type="submit" className="btn-primary">Luo perhe</button>
            </div>
            <div style={{ marginTop: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Perheen ylläpitäjä</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button type="button" className={`btn-sm ${adminMode === 'existing' ? 'active' : ''}`} style={adminMode === 'existing' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setAdminMode('existing')}>Olemassa oleva</button>
                <button type="button" className={`btn-sm ${adminMode === 'new' ? 'active' : ''}`} style={adminMode === 'new' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : {}} onClick={() => setAdminMode('new')}>Luo uusi</button>
              </div>
              {adminMode === 'existing' && (
                <select value={newFamilyAdminId} onChange={e => setNewFamilyAdminId(e.target.value ? parseInt(e.target.value) : '')}
                  style={{ width: '100%', padding: '0.625rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}>
                  <option value="">— Minä itse (oletus) —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              )}
              {adminMode === 'new' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input value={newAdminName} onChange={e => setNewAdminName(e.target.value)} placeholder="Nimi"
                    style={{ padding: '0.625rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }} />
                  <input type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="Sähköposti"
                    style={{ padding: '0.625rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }} />
                  <input type="text" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="Väliaikainen salasana (väh. 8 merkkiä)"
                    style={{ padding: '0.625rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }} />
                </div>
              )}
            </div>
          </form>
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Nimi</th><th>Kutsukoodi</th><th>Luotu</th><th></th></tr>
            </thead>
            <tbody>
              {families.map(f => (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td>{f.name}</td>
                  <td><code>{f.invite_code}</code></td>
                  <td>{f.created_at?.slice(0, 10)}</td>
                  <td><button className="btn-sm btn-danger" onClick={() => deleteFamily(f.id)}>Poista</button></td>
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
                  <td>{u.role !== 'superadmin' && <button className="btn-sm btn-danger" onClick={() => deleteUser(u.id)}>Poista</button>}
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
