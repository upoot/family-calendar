import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>📅 Perheen kalenteri</h1>
        <h2>Kirjaudu sisään</h2>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Sähköposti</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          <label>Salasana</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Kirjaudutaan...' : 'Kirjaudu'}
          </button>
        </form>
        <p className="auth-link">Ei tiliä? <Link to="/register">Rekisteröidy</Link></p>
      </div>
    </div>
  );
}
