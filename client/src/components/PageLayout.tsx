import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppNav from './AppNav';
import LanguageSwitcher from './LanguageSwitcher';

export default function PageLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <AppNav />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="user-menu">
            <span className="user-name">{user?.name}</span>
            <LanguageSwitcher />
            <Link to="/settings" className="btn-sm">⚙️</Link>
            <button className="btn-sm" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>
      <main className="page-content">
        {children}
      </main>
    </div>
  );
}
