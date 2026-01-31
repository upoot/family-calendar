import React, { useState, useEffect } from 'react';
import type { Member, Category, CalendarEvent } from '../types';

interface DayViewProps {
  date: string;
  members: Member[];
  events: CalendarEvent[];
  categories: Category[];
  token: string;
  familyId: number;
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
}

const HOUR_HEIGHT = 60;
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

let weatherCache: { text: string; ts: number } | null = null;

export default function DayView({ date, members, events, categories, onClose, onEventClick }: DayViewProps) {
  const [weather, setWeather] = useState<string>('');

  useEffect(() => {
    const now = Date.now();
    if (weatherCache && now - weatherCache.ts < 30 * 60 * 1000) {
      setWeather(weatherCache.text);
      return;
    }
    fetch('https://wttr.in/Jyväskylä?format=%c+%t')
      .then(r => r.text())
      .then(text => {
        const trimmed = text.trim();
        weatherCache = { text: trimmed, ts: Date.now() };
        setWeather(trimmed);
      })
      .catch(() => setWeather(''));
  }, []);

  const d = new Date(date + 'T00:00:00');
  const dayNames = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai'];
  const monthNames = ['tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta', 'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta'];
  const dateLabel = `${dayNames[d.getDay()]} ${d.getDate()}. ${monthNames[d.getMonth()]}`;

  const getEventStyle = (ev: CalendarEvent) => {
    const [sh, sm] = ev.start_time.split(':').map(Number);
    const [eh, em] = ev.end_time.split(':').map(Number);
    const top = (sh - START_HOUR) * HOUR_HEIGHT + sm;
    const height = Math.max((eh - sh) * HOUR_HEIGHT + (em - sm), 20);
    return { top: `${top}px`, height: `${height}px` };
  };

  const getMemberEvents = (memberId: number) => {
    const dayOfWeek = d.getDay();
    const weekday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return events.filter(e => {
      if (e.member_id !== memberId) return false;
      if (e.is_recurring) return e.weekday === weekday;
      return e.date === date;
    });
  };

  return (
    <div className="day-view">
      <div className="day-view-header">
        <div className="day-view-header-left">
          <button className="day-view-back" onClick={onClose}>← Takaisin</button>
          <h2>{dateLabel}</h2>
        </div>
        {weather && <div className="day-view-weather">{weather}</div>}
      </div>

      <div className="day-view-grid" style={{ gridTemplateColumns: `60px repeat(${members.length}, 1fr)` }}>
        {/* Column headers */}
        <div className="day-view-corner"></div>
        {members.map(m => {
          const initials = m.name.length <= 2 ? m.name : m.name.slice(0, 2);
          return (
            <div key={m.id} className="day-view-member-header">
              <span className="member-avatar" style={{ background: m.color }}>{initials}</span>
              <span>{m.name}</span>
            </div>
          );
        })}

        {/* Time column + member columns */}
        <div className="day-view-times">
          {HOURS.map(h => (
            <div key={h} className="day-view-time-label" style={{ height: HOUR_HEIGHT }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {members.map(m => (
          <div key={m.id} className="day-view-member-col">
            {HOURS.map(h => (
              <div key={h} className="day-view-hour-row" style={{ height: HOUR_HEIGHT }} />
            ))}
            {getMemberEvents(m.id).map(ev => (
              <div
                key={ev.id}
                className="day-view-event"
                style={{
                  ...getEventStyle(ev),
                  background: ev.member_color + '25',
                  borderLeft: `3px solid ${ev.member_color}`,
                }}
                onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
              >
                <div className="day-view-event-title">
                  {ev.category_icon && <span>{ev.category_icon} </span>}
                  {ev.title}
                </div>
                <div className="day-view-event-time">{ev.start_time}–{ev.end_time}</div>
                {ev.location && <div className="day-view-event-location">📍 {ev.location}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
