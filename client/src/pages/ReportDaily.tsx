import React, { useEffect, useState } from 'react';
import type { CalendarEvent, Member } from '../types';
import '../styles/report.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const FINNISH_WEEKDAYS = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai'];

function formatDate(d: Date): string {
  return `${FINNISH_WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

async function authenticate(email: string, password: string): Promise<{ token: string; familyId: number; familyName: string }> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  const token = data.token;
  const meRes = await fetch(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) throw new Error('Failed to fetch user info');
  const me = await meRes.json();
  const family = me.families[0];
  return { token, familyId: family.id, familyName: family.name };
}

export default function ReportDaily() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [familyName, setFamilyName] = useState('');
  const [weather, setWeather] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = new URLSearchParams(window.location.search);
  const dateStr = params.get('date') || new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr + 'T00:00:00');

  useEffect(() => {
    (async () => {
      try {
        const email = params.get('email') || '';
        const password = params.get('password') || '';
        if (!email || !password) { setError('Kirjautumistiedot puuttuvat'); setLoading(false); return; }

        const { token, familyId, familyName: fn } = await authenticate(email, password);
        setFamilyName(fn);

        const [evRes, memRes] = await Promise.all([
          fetch(`${API}/api/events?familyId=${familyId}&start=${dateStr}&end=${dateStr}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API}/api/members?familyId=${familyId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setEvents(await evRes.json());
        setMembers(await memRes.json());

        fetch('https://wttr.in/Jyväskylä?format=%c+%t')
          .then(r => r.text())
          .then(t => setWeather(t.trim()))
          .catch(() => {});

        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="report-loading">Ladataan...</div>;
  if (error) return <div className="report-error">{error}</div>;

  const allDay = events.filter(e => !e.start_time || e.start_time === '00:00');
  const timed = events.filter(e => e.start_time && e.start_time !== '00:00')
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const hasEvents = allDay.length > 0 || timed.length > 0;

  // Count events per member
  const memberCounts: Record<number, number> = {};
  for (const ev of events) {
    const mid = (ev as any).member_id;
    if (mid) memberCounts[mid] = (memberCounts[mid] || 0) + 1;
  }

  // Parse weather
  const weatherIcon = weather.split(' ')[0] || '';
  const weatherTemp = weather.split(' ').slice(1).join(' ') || weather;

  return (
    <div className="report-page report-daily">
      <header className="report-header">
        <div className="report-header-left">
          <h1>{formatDate(date)}</h1>
          <span className="report-family">{familyName}</span>
        </div>
      </header>

      {!hasEvents ? (
        <div className="report-empty-state">
          <div className="report-empty-icon">☀️</div>
          <div className="report-empty-text">Vapaa päivä — ei tapahtumia!</div>
        </div>
      ) : (
        <div className="report-content">
          {/* Left: Timeline */}
          <div className="report-timeline">
            {allDay.map(ev => (
              <div key={ev.id} className="report-timeline-item" style={{ '--dot-color': ev.member_color } as React.CSSProperties}>
                <style>{`.report-timeline-item[style*="${ev.member_color}"]::before { border-color: ${ev.member_color}; }`}</style>
                <div className="report-timeline-time">Koko päivä</div>
                <div className="report-timeline-card">
                  <span className="report-timeline-title">{ev.title}</span>
                  <div className="report-timeline-meta">
                    <span className="report-timeline-member">
                      <span className="report-dot" style={{ background: ev.member_color }} />
                      {ev.member_name}
                    </span>
                    {ev.location && <span>📍 {ev.location}</span>}
                  </div>
                </div>
              </div>
            ))}
            {timed.map(ev => (
              <div key={ev.id} className="report-timeline-item">
                <style>{`#tl-${ev.id}::before { border-color: ${ev.member_color}; }`}</style>
                <div className="report-timeline-time" id={`tl-${ev.id}`}>
                  {ev.start_time?.slice(0, 5)}
                  {ev.end_time ? ` – ${ev.end_time.slice(0, 5)}` : ''}
                </div>
                <div className="report-timeline-card">
                  <span className="report-timeline-title">{ev.title}</span>
                  <div className="report-timeline-meta">
                    <span className="report-timeline-member">
                      <span className="report-dot" style={{ background: ev.member_color }} />
                      {ev.member_name}
                    </span>
                    {ev.location && <span>📍 {ev.location}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Info cards */}
          <div className="report-sidebar">
            {weather && (
              <div className="report-info-card report-weather-card">
                <h3>Sää — Jyväskylä</h3>
                <div className="report-weather-main">
                  <span className="report-weather-icon">{weatherIcon}</span>
                  <span className="report-weather-temp">{weatherTemp}</span>
                </div>
              </div>
            )}

            <div className="report-info-card">
              <h3>Yhteenveto</h3>
              <div className="report-member-summary">
                {members.map(m => {
                  const count = memberCounts[m.id] || 0;
                  return (
                    <div key={m.id} className="report-member-row">
                      <span className="report-dot" style={{ background: m.color }} />
                      <span className="report-member-name">{m.name}</span>
                      <span className="report-member-count">
                        {count === 0 ? 'Vapaa' : `${count} tapahtuma${count > 1 ? 'a' : ''}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {allDay.length > 0 && (
              <div className="report-info-card">
                <h3>Koko päivän tapahtumat</h3>
                <div className="report-allday-list">
                  {allDay.map(ev => (
                    <div key={ev.id} className="report-allday-item">
                      <span className="report-dot" style={{ background: ev.member_color }} />
                      <span className="report-allday-title">{ev.title}</span>
                      <span className="report-allday-member">{ev.member_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="report-footer">
        <div className="report-members">
          {members.map(m => (
            <span key={m.id} className="report-member-badge">
              <span className="report-dot" style={{ background: m.color }} />
              {m.name}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
