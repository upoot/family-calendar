import React, { useEffect, useState } from 'react';
import type { CalendarEvent, Member } from '../types';
import '../styles/report.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const FINNISH_WEEKDAYS_SHORT = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function fmtShort(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

async function authenticate(email: string, password: string): Promise<{ token: string; familyId: number; familyName: string }> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  const family = data.user.families[0];
  return { token: data.token, familyId: family.id, familyName: family.name };
}

export default function ReportWeekly() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [familyName, setFamilyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = new URLSearchParams(window.location.search);
  const dateStr = params.get('date') || new Date().toISOString().slice(0, 10);
  const monday = getMonday(new Date(dateStr + 'T00:00:00'));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekNum = getWeekNumber(monday);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  useEffect(() => {
    (async () => {
      try {
        const email = params.get('email') || '';
        const password = params.get('password') || '';
        if (!email || !password) { setError('Kirjautumistiedot puuttuvat'); setLoading(false); return; }

        const { token, familyId, familyName: fn } = await authenticate(email, password);
        setFamilyName(fn);

        const startStr = monday.toISOString().slice(0, 10);
        const endStr = sunday.toISOString().slice(0, 10);

        const [evRes, memRes] = await Promise.all([
          fetch(`${API}/api/families/${familyId}/events?start=${startStr}&end=${endStr}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API}/api/families/${familyId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setEvents(await evRes.json());
        setMembers(await memRes.json());
        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="report-loading">Ladataan...</div>;
  if (error) return <div className="report-error">{error}</div>;

  // Group events by date string
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const day of days) {
    eventsByDate[day.toISOString().slice(0, 10)] = [];
  }
  for (const ev of events) {
    const d = ev.date || '';
    if (eventsByDate[d]) eventsByDate[d].push(ev);
  }

  // Sort events within each day
  for (const key of Object.keys(eventsByDate)) {
    eventsByDate[key].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="report-page report-weekly">
      <header className="report-header">
        <div className="report-header-left">
          <h1>Viikko {weekNum}</h1>
          <span className="report-date-range">{fmtShort(monday)} – {fmtShort(sunday)}{sunday.getFullYear()}</span>
        </div>
        <span className="report-family">{familyName}</span>
      </header>

      <div className="report-week-grid">
        {days.map((day, i) => {
          const key = day.toISOString().slice(0, 10);
          const dayEvents = eventsByDate[key] || [];
          const isToday = key === today;
          return (
            <div key={key} className={`report-week-day ${isToday ? 'report-today' : ''}`}>
              <div className="report-day-header">
                <span className="report-day-name">{FINNISH_WEEKDAYS_SHORT[i]}</span>
                <span className="report-day-num">{day.getDate()}.{day.getMonth() + 1}.</span>
              </div>
              <div className="report-day-events">
                {dayEvents.length === 0 && (
                  <div className="report-day-empty">—</div>
                )}
                {dayEvents.map(ev => (
                  <div key={ev.id} className="report-week-event" style={{ borderLeftColor: ev.member_color }}>
                    <span className="report-week-event-time">
                      {ev.start_time && ev.start_time !== '00:00' ? ev.start_time.slice(0, 5) : ''}
                    </span>
                    <span className="report-week-event-title">{ev.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

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
