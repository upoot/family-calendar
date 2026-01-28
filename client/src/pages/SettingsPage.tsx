import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PRESET_COLORS = ['#f472b6', '#22d3ee', '#fbbf24', '#a78bfa', '#34d399', '#f87171', '#fb923c', '#60a5fa'];

interface MemberData {
  id: number;
  name: string;
  color: string;
  display_order: number;
}

interface FamilyData {
  id: number;
  name: string;
  invite_code: string;
}

export default function SettingsPage() {
  const { user, token, currentFamilyId, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'members' | 'invite' | 'general'>('members');
  const [members, setMembers] = useState<MemberData[]>([]);
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // Check if user is owner of current family
  const currentFamily = user?.families.find(f => f.id === currentFamilyId);
  const isOwner = currentFamily?.user_role === 'owner' || user?.role === 'admin';

  useEffect(() => {
    if (!isOwner) { navigate('/'); return; }
    loadData();
  }, [currentFamilyId]);

  const loadData = () => {
    if (!currentFamilyId) return;
    fetch(`/api/members?familyId=${currentFamilyId}`, { headers }).then(r => r.json()).then(setMembers);
    fetch(`/api/families/${currentFamilyId}`, { headers }).then(r => r.json()).then(data => {
      setFamily(data);
      setFamilyName(data.name);
    });
  };

  const addMember = async () => {
    if (!newName.trim()) return;
    await fetch('/api/members', {
      method: 'POST', headers,
      body: JSON.stringify({ name: newName, color: newColor, family_id: currentFamilyId }),
    });
    setNewName('');
    setNewColor(PRESET_COLORS[members.length % PRESET_COLORS.length]);
    loadData();
  };

  const deleteMember = async (id: number) => {
    if (!confirm('Poista jäsen ja kaikki tapahtumat?')) return;
    await fetch(`/api/members/${id}`, { method: 'DELETE', headers });
    loadData();
  };

  const startEdit = (m: MemberData) => {
    setEditingId(m.id);
    setEditName(m.name);
    setEditColor(m.color);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await fetch(`/api/members/${editingId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ name: editName, color: editColor }),
    });
    setEditingId(null);
    loadData();
  };

  const moveMember = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= members.length) return;
    const updated = [...members];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    const order = updated.map((m, i) => ({ id: m.id, display_order: i + 1 }));
    await fetch('/api/members/reorder', {
      method: 'PUT', headers,
      body: JSON.stringify({ family_id: currentFamilyId, order }),
    });
    loadData();
  };

  const saveFamilyName = async () => {
    if (!familyName.trim() || !currentFamilyId) return;
    setSaving(true);
    await fetch(`/api/families/${currentFamilyId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ name: familyName }),
    });
    await refreshUser();
    setSaving(false);
    loadData();
  };

  const inviteUrl = family ? `${window.location.origin}/invite/${family.invite_code}` : '';

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOwner) return null;

  return (
    <div className="app">
      <header>
        <h1>⚙️ Perheen asetukset</h1>
        <Link to="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>← Kalenteriin</Link>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Jäsenet</button>
        <button className={tab === 'invite' ? 'active' : ''} onClick={() => setTab('invite')}>Kutsu</button>
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Yleiset</button>
      </div>

      {tab === 'members' && (
        <div>
          <div className="settings-members">
            {members.map((m, i) => (
              <div key={m.id} className="settings-member-row">
                {editingId === m.id ? (
                  <>
                    <input
                      type="color"
                      value={editColor}
                      onChange={e => setEditColor(e.target.value)}
                      style={{ width: '36px', height: '36px', padding: '2px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                    />
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      style={{ flex: 1, padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                    />
                    <button className="btn-sm" onClick={saveEdit}>✓</button>
                    <button className="btn-sm" onClick={() => setEditingId(null)}>✕</button>
                  </>
                ) : (
                  <>
                    <span className="member-dot" style={{ background: m.color, width: '12px', height: '12px' }} />
                    <span style={{ flex: 1, fontWeight: 500 }}>{m.name}</span>
                    <button className="btn-sm" onClick={() => moveMember(i, -1)} disabled={i === 0}>↑</button>
                    <button className="btn-sm" onClick={() => moveMember(i, 1)} disabled={i === members.length - 1}>↓</button>
                    <button className="btn-sm" onClick={() => startEdit(m)}>✏️</button>
                    <button className="btn-sm btn-danger" onClick={() => deleteMember(m.id)}>🗑</button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Uuden jäsenen nimi"
              style={{ flex: 1, padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' }}
              onKeyDown={e => { if (e.key === 'Enter') addMember(); }}
            />
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              style={{ width: '44px', height: '44px', padding: '2px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            />
            <button className="btn-primary" style={{ padding: '0.625rem 1.25rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }} onClick={addMember} disabled={!newName.trim()}>
              Lisää
            </button>
          </div>
        </div>
      )}

      {tab === 'invite' && family && (
        <div style={{ maxWidth: '500px' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Kutsukoodi</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <code style={{ flex: 1, padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--accent)' }}>{family.invite_code}</code>
            </div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Kutsulinkki</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                readOnly
                value={inviteUrl}
                style={{ flex: 1, padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button className="btn-primary" style={{ padding: '0.625rem 1.25rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }} onClick={copyInvite}>
                {copied ? '✓ Kopioitu!' : '📋 Kopioi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'general' && (
        <div style={{ maxWidth: '500px' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Perheen nimi</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                style={{ flex: 1, padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' }}
                onKeyDown={e => { if (e.key === 'Enter') saveFamilyName(); }}
              />
              <button className="btn-primary" style={{ padding: '0.625rem 1.25rem', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }} onClick={saveFamilyName} disabled={saving}>
                {saving ? 'Tallennetaan...' : 'Tallenna'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
