import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ChangePasswordPage() {
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
      setError('Salasanan on oltava vähintään 8 merkkiä');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Salasanat eivät täsmää');
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
        throw new Error(data.error || 'Salasanan vaihto epäonnistui');
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
        <h1>📅 Perheen kalenteri</h1>
        <h2>Vaihda salasana</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
          Tilillesi on asetettu väliaikainen salasana. Vaihda se ennen jatkamista.
        </p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Uusi salasana</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            placeholder="Vähintään 8 merkkiä"
          />
          <label>Vahvista salasana</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Kirjoita salasana uudelleen"
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Vaihdetaan...' : 'Vaihda salasana'}
          </button>
        </form>
      </div>
    </div>
  );
}
