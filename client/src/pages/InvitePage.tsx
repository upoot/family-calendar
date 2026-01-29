import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function InvitePage() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const { user, token, refreshUser, setCurrentFamilyId } = useAuth();
  const navigate = useNavigate();
  const [family, setFamily] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${code}`).then(r => r.json()).then(data => {
      if (data.error) setError(data.error);
      else setFamily(data);
    }).catch(() => setError('Failed to load invite'));
  }, [code]);

  const handleJoin = async () => {
    if (!token) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/invite/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.family_id) {
        setCurrentFamilyId(data.family_id);
        await refreshUser();
        setJoined(true);
        setTimeout(() => navigate('/'), 1500);
      }
    } catch {
      setError('Failed to join');
    } finally {
      setJoining(false);
    }
  };

  if (error) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>{t('invite.invalidInvite')}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <Link to="/login" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none', padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-md)' }}>
            {t('invite.login')}
          </Link>
        </div>
      </div>
    );
  }

  if (!family) {
    return <div className="auth-page"><div className="auth-card"><p>{t('invite.loading')}</p></div></div>;
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>{t('invite.joinFamily', { name: family.name })}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{t('invite.loginOrRegister')}</p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link to={`/login?redirect=/invite/${code}`} className="btn-primary" style={{ textDecoration: 'none', padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-md)' }}>{t('invite.login')}</Link>
            <Link to={`/register?redirect=/invite/${code}`} className="btn-cancel" style={{ textDecoration: 'none', padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>{t('invite.register')}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>{t('invite.joined', { name: family.name })}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{t('invite.redirecting')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>{t('invite.joinFamily', { name: family.name })}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} dangerouslySetInnerHTML={{ __html: t('invite.joinQuestion', { name: family.name }) }} />
        <button className="btn-primary" onClick={handleJoin} disabled={joining}>
          {joining ? t('invite.joining') : t('invite.join')}
        </button>
      </div>
    </div>
  );
}
