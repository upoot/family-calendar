import { useState, useEffect, useCallback } from 'react';
import EventModal from './components/EventModal';
import type { Member, Category, CalendarEvent, EventFormData } from './types';

const DAYS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function App() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modal, setModal] = useState<{
    event?: CalendarEvent;
    memberId?: number;
    date?: string;
    weekday?: number;
  } | null>(null);

  const weekStr = fmt(weekStart);

  const fetchEvents = useCallback(async () => {
    const res = await fetch(`/api/events?week=${weekStr}`);
    setEvents(await res.json());
  }, [weekStr]);

  useEffect(() => {
    fetch('/api/members').then(r => r.json()).then(setMembers);
    fetch('/api/categories').then(r => r.json()).then(setCategories);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const getEventsForCell = (memberId: number, dayIndex: number) => {
    const dateStr = fmt(addDays(weekStart, dayIndex));
    return events.filter(e => {
      if (e.member_id !== memberId) return false;
      if (e.is_recurring) return e.weekday === dayIndex;
      return e.date === dateStr;
    }).sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const handleSave = async (data: EventFormData) => {
    const url = modal?.event ? `/api/events/${modal.event.id}` : '/api/events';
    const method = modal?.event ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setModal(null);
    fetchEvents();
  };

  const handleDelete = async () => {
    if (!modal?.event) return;
    await fetch(`/api/events/${modal.event.id}`, { method: 'DELETE' });
    setModal(null);
    fetchEvents();
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);
  const monthNames = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
  
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()}.–${weekEnd.getDate()}. ${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()}.${weekStart.getMonth() + 1}.–${weekEnd.getDate()}.${weekEnd.getMonth() + 1}. ${weekEnd.getFullYear()}`;

  return (
    <div className="app">
      <header>
        <h1>📅 Perheen kalenteri</h1>
        <div className="week-nav">
          <button onClick={() => setWeekStart(w => addDays(w, -7))}>◀ Edellinen</button>
          <span className="current">{weekLabel}</span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}>Seuraava ▶</button>
          <button onClick={() => setWeekStart(getMonday(new Date()))}>Tänään</button>
        </div>
      </header>

      <div className="calendar-grid">
        <div className="grid-header corner"></div>
        {weekDates.map((d, i) => (
          <div key={i} className="grid-header">
            {DAYS[i]}
            <span className="date-num">{d.getDate()}.{d.getMonth() + 1}.</span>
          </div>
        ))}

        {members.map(member => (
          <>
            <div key={`label-${member.id}`} className="member-label">
              <span className="member-dot" style={{ background: member.color }} />
              {member.name}
            </div>
            {Array.from({ length: 7 }, (_, dayIdx) => {
              const cellEvents = getEventsForCell(member.id, dayIdx);
              const dateStr = fmt(addDays(weekStart, dayIdx));
              return (
                <div
                  key={`${member.id}-${dayIdx}`}
                  className="cell"
                  onClick={() => setModal({ memberId: member.id, date: dateStr, weekday: dayIdx })}
                >
                  {cellEvents.map(ev => (
                    <div
                      key={ev.id}
                      className="event-card"
                      style={{ borderLeftColor: ev.member_color, background: ev.member_color + '15' }}
                      onClick={e => { e.stopPropagation(); setModal({ event: ev }); }}
                    >
                      <div className="event-title">
                        {ev.category_icon && <span>{ev.category_icon} </span>}
                        {ev.title}
                        {ev.is_recurring ? <span className="recurring-badge">🔄</span> : null}
                      </div>
                      <div className="event-time">{ev.start_time}–{ev.end_time}</div>
                      {ev.location && <div className="event-location">📍 {ev.location}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        ))}
      </div>

      {modal && (
        <EventModal
          event={modal.event}
          members={members}
          categories={categories}
          defaultMemberId={modal.memberId}
          defaultDate={modal.date}
          defaultWeekday={modal.weekday}
          onSave={handleSave}
          onDelete={modal.event ? handleDelete : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
