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
  const [tab, setTab] = useState<'families' | 'users'>('families');

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const loadData = () => {
    fetch('/api/admin/users', { headers }).then(r => r.json()).then(setUsers);
    fetch('/api/families', { headers }).then(r => r.json()).then(setFamilies);
  };

  useEffect(() => { loadData(); }, []);

  const createFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFamilyName.trim()) return;
    await fetch('/api/families', { method: 'POST', headers, body: JSON.stringify({ name: newFamilyName }) });
    setNewFamilyName('');
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
          <form onSubmit={createFamily} className="admin-form">
            <input value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} placeholder="Uuden perheen nimi" />
            <button type="submit" className="btn-primary">Luo perhe</button>
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
                  <td>{u.role !== 'superadmin' && <button className="btn-sm btn-danger" onClick={() => deleteUser(u.id)}>Poista</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
