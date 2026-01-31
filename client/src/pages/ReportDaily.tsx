import React, { useEffect, useState } from 'react';
import type { CalendarEvent, Member } from '../types';
import '../styles/report.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const FINNISH_WEEKDAYS = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai'];
const FINNISH_MONTHS = ['tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta', 'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta'];

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
  // Login doesn't return families — fetch from /api/auth/me
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

        // Weather
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

  return (
    <div className="report-page report-daily">
      <header className="report-header">
        <div className="report-header-left">
          <h1>{formatDate(date)}</h1>
          <span className="report-family">{familyName}</span>
        </div>
        {weather && <div className="report-weather">{weather}</div>}
      </header>

      {allDay.length > 0 && (
        <section className="report-section">
          <h2 className="report-section-title">Koko päivä</h2>
          <div className="report-events">
            {allDay.map(ev => (
              <div key={ev.id} className="report-event-card">
                <span className="report-dot" style={{ background: ev.member_color }} />
                <div className="report-event-info">
                  <span className="report-event-title">{ev.title}</span>
                  <span className="report-event-member">{ev.member_name}</span>
                  {ev.location && <span className="report-event-location">📍 {ev.location}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="report-section">
        <h2 className="report-section-title">Tapahtumat</h2>
        {timed.length === 0 && allDay.length === 0 && (
          <p className="report-empty">Ei tapahtumia tälle päivälle</p>
        )}
        <div className="report-events">
          {timed.map(ev => (
            <div key={ev.id} className="report-event-card">
              <span className="report-dot" style={{ background: ev.member_color }} />
              <div className="report-event-time">
                {ev.start_time?.slice(0, 5)}
                {ev.end_time && ` – ${ev.end_time.slice(0, 5)}`}
              </div>
              <div className="report-event-info">
                <span className="report-event-title">{ev.title}</span>
                <span className="report-event-member">{ev.member_name}</span>
                {ev.location && <span className="report-event-location">📍 {ev.location}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

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
