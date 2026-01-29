import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/', label: '📅 Kalenteri' },
  { path: '/todos', label: '✅ Tehtävät' },
  { path: '/shopping', label: '🛒 Kauppa' },
];

export default function AppNav() {
  const { pathname } = useLocation();

  return (
    <nav className="app-tabs">
      {TABS.map(tab => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`app-tab ${pathname === tab.path ? 'app-tab-active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
