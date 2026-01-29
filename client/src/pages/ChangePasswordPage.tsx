import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const { token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError(t('changePassword.passwordMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('changePassword.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('changePassword.changeFailed'));
      }
      await refreshUser();
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>📅 {t('app.title')}</h1>
        <h2>{t('changePassword.title')}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
          {t('changePassword.description')}
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>{t('changePassword.newPassword')}</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            placeholder={t('changePassword.newPasswordPlaceholder')}
          />
          <label>{t('changePassword.confirmPassword')}</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            placeholder={t('changePassword.confirmPasswordPlaceholder')}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('changePassword.loading') : t('changePassword.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
