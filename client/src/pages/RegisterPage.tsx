import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const targetRoute = await register(email, password, name);
      const redirect = searchParams.get('redirect');
      navigate(redirect || targetRoute);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>📅 {t('app.title')}</h1>
        <h2>{t('register.title')}</h2>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>{t('register.name')}</label>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <label>{t('register.email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <label>{t('register.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={4} />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('register.loading') : t('register.submit')}
          </button>
        </form>
        <p className="auth-link">{t('register.hasAccount')} <Link to="/login">{t('register.login')}</Link></p>
      </div>
    </div>
  );
}
