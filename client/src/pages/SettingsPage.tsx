import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import IntegrationSyncModal from '../components/IntegrationSyncModal';

const PRESET_COLORS = ['#f472b6', '#22d3ee', '#fbbf24', '#a78bfa', '#34d399', '#f87171', '#fb923c', '#60a5fa'];

interface MemberData {
  id: number;
  name: string;
  color: string;
  display_order: number;
  user_id?: number | null;
}

interface FamilyUserData {
  id: number;
  email: string;
  name: string;
  role: string;
  family_role: string;
  must_change_password: number;
  created_at: string;
}

interface FamilyData {
  id: number;
  name: string;
  invite_code: string;
}

interface CategoryData {
  id: number;
  name: string;
  icon: string;
  family_id: number | null;
  display_order: number;
}

type SectionId = 'general' | 'members' | 'eventTypes' | 'users' | 'integrations' | 'invite';

const SECTIONS: { id: SectionId; sidebarKey: string }[] = [
  { id: 'general', sidebarKey: 'settings.sidebar.general' },
  { id: 'members', sidebarKey: 'settings.sidebar.members' },
  { id: 'eventTypes', sidebarKey: 'settings.sidebar.eventTypes' },
  { id: 'users', sidebarKey: 'settings.sidebar.users' },
  { id: 'integrations', sidebarKey: 'settings.sidebar.integrations' },
  { id: 'invite', sidebarKey: 'settings.sidebar.invite' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, token, currentFamilyId, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState<MemberData[]>([]);
  const [familyUsers, setFamilyUsers] = useState<FamilyUserData[]>([]);
  const [familyMembers, setFamilyMembers] = useState<MemberData[]>([]);
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [categories, setCategories] = useState<CategoryData[]>([]);

  // Member form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  // Category form
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📌');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');

  // User form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserMemberId, setNewUserMemberId] = useState<number | ''>('');
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');

  // General
  const [familyName, setFamilyName] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // School integration
  const [schoolCity, setSchoolCity] = useState('');
  const [schoolUsername, setSchoolUsername] = useState('');
  const [schoolPassword, setSchoolPassword] = useState('');
  const [schoolLastSync, setSchoolLastSync] = useState<string | null>(null);
  const [schoolSaving, setSchoolSaving] = useState(false);
  const [schoolMessage, setSchoolMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Scroll spy
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    general: null, members: null, eventTypes: null, users: null, integrations: null, invite: null,
  });
  const contentRef = useRef<HTMLDivElement>(null);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const currentFamily = user?.families.find(f => f.id === currentFamilyId);
  const isOwner = currentFamily?.user_role === 'owner' || user?.role === 'superadmin';

  useEffect(() => {
    if (!isOwner) { navigate('/'); return; }
    loadData();
  }, [currentFamilyId]);

  // Scroll spy effect
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const onScroll = () => {
      const scrollTop = container.scrollTop + 20;
      let current: SectionId = 'general';
      for (const s of SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (el && el.offsetTop <= scrollTop) current = s.id;
      }
      setActiveSection(current);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  const loadData = () => {
    if (!currentFamilyId) return;
    fetch(`/api/members?familyId=${currentFamilyId}`, { headers }).then(r => r.json()).then(setMembers);
    fetch(`/api/families/${currentFamilyId}`, { headers }).then(r => r.json()).then(data => {
      setFamily(data);
      setFamilyName(data.name);
    });
    fetch(`/api/families/${currentFamilyId}/users`, { headers }).then(r => r.json()).then(data => {
      setFamilyUsers(data.users || []);
      setFamilyMembers(data.members || []);
    });
    fetch(`/api/categories?familyId=${currentFamilyId}`, { headers }).then(r => r.json()).then(setCategories);
    
    // Load School settings
    fetch(`/api/families/${currentFamilyId}/integrations/school`, { headers }).then(r => r.json()).then(data => {
      if (data.config) {
        const config = JSON.parse(data.config);
        setSchoolCity(config.baseUrl || '');
        setSchoolUsername(config.username || '');
        // Password is never returned from API for security
      }
      setSchoolLastSync(data.last_sync);
    });
  };

  const scrollTo = useCallback((id: SectionId) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── Member handlers ──
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
    if (!confirm(t('settings.deleteMemberConfirm'))) return;
    await fetch(`/api/members/${id}`, { method: 'DELETE', headers });
    loadData();
  };

  const startEdit = (m: MemberData) => { setEditingId(m.id); setEditName(m.name); setEditColor(m.color); };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await fetch(`/api/members/${editingId}`, { method: 'PUT', headers, body: JSON.stringify({ name: editName, color: editColor }) });
    setEditingId(null);
    loadData();
  };

  const moveMember = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= members.length) return;
    const updated = [...members];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    const order = updated.map((m, i) => ({ id: m.id, display_order: i + 1 }));
    await fetch('/api/members/reorder', { method: 'PUT', headers, body: JSON.stringify({ family_id: currentFamilyId, order }) });
    loadData();
  };

  // ── Category handlers ──
  const addCategory = async () => {
    if (!newCatName.trim()) return;
    await fetch('/api/categories', {
      method: 'POST', headers,
      body: JSON.stringify({ name: newCatName, icon: newCatIcon || '📌', family_id: currentFamilyId }),
    });
    setNewCatName('');
    setNewCatIcon('📌');
    loadData();
  };

  const startEditCat = (c: CategoryData) => { setEditingCatId(c.id); setEditCatName(c.name); setEditCatIcon(c.icon); };

  const saveEditCat = async () => {
    if (!editingCatId || !editCatName.trim()) return;
    await fetch(`/api/categories/${editingCatId}`, { method: 'PUT', headers, body: JSON.stringify({ name: editCatName, icon: editCatIcon }) });
    setEditingCatId(null);
    loadData();
  };

  const deleteCategory = async (id: number) => {
    if (!confirm(t('settings.categories.deleteConfirm'))) return;
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const data = await res.json();
      if (data.eventCount) {
        alert(t('settings.categories.inUseWarning', { count: data.eventCount }));
      }
      return;
    }
    loadData();
  };

  // ── User handler ──
  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(''); setUserSuccess('');
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) { setUserError(t('settings.allFieldsRequired')); return; }
    if (newUserPassword.length < 8) { setUserError(t('settings.passwordMinLength')); return; }
    try {
      const res = await fetch(`/api/families/${currentFamilyId}/users`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: newUserName, email: newUserEmail, password: newUserPassword, memberId: newUserMemberId || undefined }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || t('settings.userCreateFailed')); }
      setNewUserName(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserMemberId('');
      setUserSuccess(t('settings.userCreatedSuccess'));
      setTimeout(() => setUserSuccess(''), 3000);
      loadData();
    } catch (err: any) { setUserError(err.message); }
  };

  // ── General ──
  const saveFamilyName = async () => {
    if (!familyName.trim() || !currentFamilyId) return;
    setSaving(true);
    await fetch(`/api/families/${currentFamilyId}`, { method: 'PUT', headers, body: JSON.stringify({ name: familyName }) });
    await refreshUser();
    setSaving(false);
    loadData();
  };

  const inviteUrl = family ? `${window.location.origin}/invite/${family.invite_code}` : '';
  const copyInvite = () => { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  // ── School handlers ──
  const saveSchoolSettings = async () => {
    if (!schoolCity.trim() || !schoolUsername.trim() || !schoolPassword.trim()) {
      setSchoolMessage({ text: t('settings.integrations.school.allFieldsRequired'), type: 'error' });
      setTimeout(() => setSchoolMessage(null), 3000);
      return;
    }
    setSchoolSaving(true);
    try {
      const res = await fetch(`/api/families/${currentFamilyId}/integrations/school`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          config: { baseUrl: schoolCity, username: schoolUsername, password: schoolPassword }
        })
      });
      if (!res.ok) throw new Error('Failed to save settings');
      setSchoolMessage({ text: t('settings.integrations.school.settingsSaved'), type: 'success' });
      setTimeout(() => setSchoolMessage(null), 3000);
    } catch (err: any) {
      setSchoolMessage({ text: err.message, type: 'error' });
      setTimeout(() => setSchoolMessage(null), 3000);
    } finally {
      setSchoolSaving(false);
    }
  };

  const syncSchool = () => {
    if (!schoolCity.trim() || !schoolUsername.trim() || !schoolPassword.trim()) {
      setSchoolMessage({ text: t('settings.integrations.school.allFieldsRequired'), type: 'error' });
      setTimeout(() => setSchoolMessage(null), 3000);
      return;
    }
    setShowSyncModal(true);
  };

  const closeSyncModal = () => {
    setShowSyncModal(false);
    loadData(); // Refresh data after sync
  };

  if (!isOwner) return null;

  return (
    <>
      {showSyncModal && currentFamilyId && (
        <IntegrationSyncModal 
          onClose={closeSyncModal}
          familyId={currentFamilyId}
          username={schoolUsername}
          password={schoolPassword}
        />
      )}
      
      <div className="settings-page">
      <header className="settings-header">
        <h1>⚙️ {t('settings.title')}</h1>
        <Link to="/" className="settings-back-link">{t('settings.backToCalendar')}</Link>
      </header>

      <div className="settings-layout">
        {/* Sidebar */}
        <nav className="settings-sidebar">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`settings-sidebar-item${activeSection === s.id ? ' active' : ''}`}
              onClick={() => scrollTo(s.id)}
            >
              {t(s.sidebarKey)}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="settings-content" ref={contentRef}>

          {/* General */}
          <div className="settings-card" ref={el => { sectionRefs.current.general = el; }}>
            <h2 className="settings-card-title">{t('settings.sidebar.general')}</h2>
            <label className="settings-label">{t('settings.familyName')}</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                className="settings-input"
                onKeyDown={e => { if (e.key === 'Enter') saveFamilyName(); }}
              />
              <button className="btn-primary" onClick={saveFamilyName} disabled={saving}>
                {saving ? t('settings.saving') : t('settings.save')}
              </button>
            </div>
          </div>

          {/* Members */}
          <div className="settings-card" ref={el => { sectionRefs.current.members = el; }}>
            <h2 className="settings-card-title">{t('settings.sidebar.members')}</h2>
            <div className="settings-members">
              {members.map((m, i) => (
                <div key={m.id} className="settings-member-row">
                  {editingId === m.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', alignItems: 'center' }}>
                      <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="settings-color-input" />
                      <input value={editName} onChange={e => setEditName(e.target.value)} className="settings-input" style={{ flex: 1 }}
                        placeholder="Name" onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                      <button className="btn-sm" onClick={saveEdit}>✓ Save</button>
                      <button className="btn-sm" onClick={() => setEditingId(null)}>✕ Cancel</button>
                    </div>
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
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('settings.newMemberPlaceholder')}
                className="settings-input" style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') addMember(); }} />
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="settings-color-input" />
              <button className="btn-primary" onClick={addMember} disabled={!newName.trim()}>{t('settings.add')}</button>
            </div>
          </div>

          {/* Event Types / Categories */}
          <div className="settings-card" ref={el => { sectionRefs.current.eventTypes = el; }}>
            <h2 className="settings-card-title">{t('settings.sidebar.eventTypes')}</h2>
            <div className="settings-members">
              {categories.map(c => (
                <div key={c.id} className="settings-member-row">
                  {editingCatId === c.id ? (
                    <>
                      <input value={editCatIcon} onChange={e => setEditCatIcon(e.target.value)}
                        className="settings-input" style={{ width: '3rem', textAlign: 'center', fontSize: '1.2rem' }} />
                      <input value={editCatName} onChange={e => setEditCatName(e.target.value)}
                        className="settings-input" style={{ flex: 1 }}
                        onKeyDown={e => { if (e.key === 'Enter') saveEditCat(); if (e.key === 'Escape') setEditingCatId(null); }} autoFocus />
                      <button className="btn-sm" onClick={saveEditCat}>✓</button>
                      <button className="btn-sm" onClick={() => setEditingCatId(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.2rem', width: '2rem', textAlign: 'center' }}>{c.icon}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{c.name}</span>
                      {c.family_id && (
                        <>
                          <button className="btn-sm" onClick={() => startEditCat(c)}>✏️</button>
                          <button className="btn-sm btn-danger" onClick={() => deleteCategory(c.id)}>🗑</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <input value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} placeholder={t('settings.categories.iconPlaceholder')}
                className="settings-input" style={{ width: '3rem', textAlign: 'center', fontSize: '1.2rem' }} />
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder={t('settings.categories.namePlaceholder')}
                className="settings-input" style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') addCategory(); }} />
              <button className="btn-primary" onClick={addCategory} disabled={!newCatName.trim()}>{t('settings.categories.addNew')}</button>
            </div>
          </div>

          {/* Users */}
          <div className="settings-card" ref={el => { sectionRefs.current.users = el; }}>
            <h2 className="settings-card-title">{t('settings.sidebar.users')}</h2>
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 className="settings-subtitle">{t('settings.userAccounts')}</h3>
              {familyUsers.length > 0 ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('settings.tableHeaders.name')}</th>
                      <th>{t('settings.tableHeaders.email')}</th>
                      <th>{t('settings.tableHeaders.role')}</th>
                      <th>{t('settings.tableHeaders.linkedMember')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {familyUsers.map(u => {
                      const linkedMember = familyMembers.find(m => m.user_id === u.id);
                      return (
                        <tr key={u.id}>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td><span className={`role-badge ${u.family_role}`}>{u.family_role === 'owner' ? t('settings.roleOwner') : t('settings.roleMember')}</span></td>
                          <td>{linkedMember ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="member-dot" style={{ background: linkedMember.color, width: '8px', height: '8px' }} />
                              {linkedMember.name}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('settings.noUsers')}</p>
              )}
            </div>

            <div className="settings-inner-card">
              <h3 className="settings-subtitle">{t('settings.createUser')}</h3>
              {userError && <div className="auth-error">{userError}</div>}
              {userSuccess && <div className="settings-success">{userSuccess}</div>}
              <form onSubmit={createUser}>
                <label className="settings-label">{t('settings.userName')}</label>
                <input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder={t('settings.userNamePlaceholder')} required className="settings-input" />
                <label className="settings-label">{t('settings.userEmail')}</label>
                <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder={t('settings.userEmailPlaceholder')} required className="settings-input" />
                <label className="settings-label">{t('settings.tempPassword')}</label>
                <input type="text" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder={t('settings.tempPasswordPlaceholder')} required className="settings-input" />
                <label className="settings-label">{t('settings.linkMember')}</label>
                <select value={newUserMemberId} onChange={e => setNewUserMemberId(e.target.value ? parseInt(e.target.value) : '')} className="settings-input" style={{ cursor: 'pointer' }}>
                  <option value="">{t('settings.noLink')}</option>
                  {familyMembers.filter(m => !m.user_id).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>{t('settings.createUserBtn')}</button>
              </form>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem' }}>{t('settings.tempPasswordNote')}</p>
            </div>
          </div>

          {/* Integrations */}
          <div className="settings-card" ref={el => { sectionRefs.current.integrations = el; }}>
            <h2 className="settings-card-title">{t('settings.sidebar.integrations')}</h2>
            
            {/* School */}
            <div className="settings-inner-card">
              <h3 className="settings-subtitle">🏫 School</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {t('settings.integrations.school.description')}
              </p>
              
              {schoolMessage && (
                <div className={schoolMessage.type === 'error' ? 'auth-error' : 'settings-success'}>
                  {schoolMessage.text}
                </div>
              )}
              
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                School credentials:
              </h4>
              
              <label className="settings-label">{t('settings.integrations.school.baseUrl')}</label>
              <input 
                value={schoolCity} 
                onChange={e => setSchoolCity(e.target.value)}
                placeholder="https://example.com"
                className="settings-input"
              />
              
              <label className="settings-label">{t('settings.integrations.school.username')}</label>
              <input 
                value={schoolUsername} 
                onChange={e => setSchoolUsername(e.target.value)}
                placeholder={t('settings.integrations.school.usernamePlaceholder')}
                className="settings-input"
              />
              
              <label className="settings-label">{t('settings.integrations.school.password')}</label>
              <input 
                type="password"
                value={schoolPassword} 
                onChange={e => setSchoolPassword(e.target.value)}
                placeholder={t('settings.integrations.school.passwordPlaceholder')}
                className="settings-input"
              />
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button 
                  className="btn-primary" 
                  onClick={saveSchoolSettings} 
                  disabled={schoolSaving || !schoolCity.trim() || !schoolUsername.trim() || !schoolPassword.trim()}
                >
                  {schoolSaving ? t('settings.saving') : t('settings.save')}
                </button>
                <button 
                  className="btn-primary" 
                  onClick={syncSchool} 
                  disabled={!schoolCity.trim() || !schoolUsername.trim() || !schoolPassword.trim()}
                  style={{ backgroundColor: 'var(--color-success)' }}
                >
                  {t('settings.integrations.school.syncNow')}
                </button>
              </div>
              
              {schoolLastSync && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
                  {t('settings.integrations.school.lastSync')}: {new Date(schoolLastSync).toLocaleString('fi-FI')}
                </p>
              )}
              
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '1rem' }}>
                ℹ️ {t('settings.integrations.school.rateLimit')}
              </p>
            </div>
          </div>

          {/* Invite */}
          {family && (
            <div className="settings-card" ref={el => { sectionRefs.current.invite = el; }}>
              <h2 className="settings-card-title">{t('settings.sidebar.invite')}</h2>
              <label className="settings-label">{t('settings.inviteCode')}</label>
              <div style={{ marginBottom: '1.5rem' }}>
                <code className="settings-invite-code">{family.invite_code}</code>
              </div>
              <label className="settings-label">{t('settings.inviteLink')}</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input readOnly value={inviteUrl} className="settings-input" style={{ flex: 1 }} onClick={e => (e.target as HTMLInputElement).select()} />
                <button className="btn-primary" onClick={copyInvite} style={{ whiteSpace: 'nowrap' }}>
                  {copied ? t('settings.copied') : t('settings.copy')}
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem' }}>{t('settings.emailInvitesSoon')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
