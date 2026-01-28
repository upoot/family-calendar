import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export default function RegisterPage() {
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
      await register(email, password, name);
      const redirect = searchParams.get('redirect');
      if (redirect) navigate(redirect);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>📅 Perheen kalenteri</h1>
        <h2>Rekisteröidy</h2>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Nimi</label>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
          <label>Sähköposti</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <label>Salasana</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={4} />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Rekisteröidään...' : 'Rekisteröidy'}
          </button>
        </form>
        <p className="auth-link">Onko jo tili? <Link to="/login">Kirjaudu</Link></p>
      </div>
    </div>
  );
}
