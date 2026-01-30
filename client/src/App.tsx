import React, { useState, useEffect, useCallback } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import EventModal from './components/EventModal';
import DraggableEvent from './components/DraggableEvent';
import DroppableCell from './components/DroppableCell';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useAuth } from './context/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import AppNav from './components/AppNav';
import NLPBar from './components/NLPBar';
import TodoWidget from './components/TodoWidget';
import ShoppingWidget from './components/ShoppingWidget';
import Timeline from './components/Timeline';
import type { Member, Category, CalendarEvent, EventFormData } from './types';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmt(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function App() {
  const { t } = useTranslation();
  const { user, token, currentFamilyId, setCurrentFamilyId, logout } = useAuth();
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
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [copyWeekModal, setCopyWeekModal] = useState(false);
  const [copyWeekMsg, setCopyWeekMsg] = useState<string | null>(null);
  const [widgetRefresh, setWidgetRefresh] = useState(0);
  const refreshWidgets = () => setWidgetRefresh(k => k + 1);

  const jumpToDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    setWeekStart(getMonday(date));
    // Scroll to top of calendar
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const weekStr = fmt(weekStart);
  const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchEvents = useCallback(async () => {
    if (!currentFamilyId) return;
    const res = await fetch(`/api/events?week=${weekStr}&familyId=${currentFamilyId}`, { headers: authHeaders });
    if (res.ok) setEvents(await res.json());
  }, [weekStr, currentFamilyId, token]);

  useEffect(() => {
    if (!currentFamilyId) return;
    fetch(`/api/members?familyId=${currentFamilyId}`, { headers: authHeaders }).then(r => r.json()).then(setMembers);
    fetch('/api/categories', { headers: authHeaders }).then(r => r.json()).then(setCategories);
  }, [currentFamilyId, token]);

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
    const payload = { ...data, family_id: currentFamilyId };
    const url = modal?.event ? `/api/events/${modal.event.id}` : '/api/events';
    const method = modal?.event ? 'PUT' : 'POST';
    await fetch(url, { method, headers: authHeaders, body: JSON.stringify(payload) });
    setModal(null);
    fetchEvents();
  };

  const handleDelete = async () => {
    if (!modal?.event) return;
    await fetch(`/api/events/${modal.event.id}`, { method: 'DELETE', headers: authHeaders });
    setModal(null);
    fetchEvents();
  };

  const handleDragStart = (event: DragStartEvent) => {
    const ev = events.find(e => e.id === event.active.id);
    setActiveEvent(ev || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveEvent(null);
    const { active, over } = event;
    if (!over) return;

    const draggedEvent = events.find(e => e.id === active.id);
    if (!draggedEvent) return;

    const [, memberIdStr, dayIdxStr] = (over.id as string).split('-');
    const newMemberId = parseInt(memberIdStr);
    const newDayIdx = parseInt(dayIdxStr);
    const newDate = fmt(addDays(weekStart, newDayIdx));

    const oldDayIdx = draggedEvent.is_recurring
      ? draggedEvent.weekday
      : weekDates.findIndex(d => fmt(d) === draggedEvent.date);

    if (newMemberId === draggedEvent.member_id && newDayIdx === oldDayIdx) return;

    const updateData: Partial<EventFormData> = {
      member_id: newMemberId,
      ...(draggedEvent.is_recurring ? { weekday: newDayIdx } : { date: newDate }),
    };

    await fetch(`/api/events/${draggedEvent.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(updateData),
    });

    fetchEvents();
  };

  const nonRecurringCount = events.filter(e => !e.is_recurring).length;

  const handleCopyWeek = async () => {
    const targetWeek = fmt(addDays(weekStart, 7));
    const res = await fetch('/api/events/copy-week', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ familyId: currentFamilyId, sourceWeek: weekStr, targetWeek }),
    });
    if (res.ok) {
      const { copied, skipped } = await res.json();
      setCopyWeekModal(false);
      if (copied === 0 && skipped === 0) {
        setCopyWeekMsg(t('calendar.copyWeek.noEvents'));
      } else {
        let msg = t('calendar.copyWeek.success', { copied });
        if (skipped > 0) msg += ' · ' + t('calendar.copyWeek.skipped', { skipped });
        setCopyWeekMsg(msg);
      }
      setWeekStart(w => addDays(w, 7));
      setTimeout(() => setCopyWeekMsg(null), 4000);
    }
  };

  const DAYS = t('calendar.days', { returnObjects: true }) as string[];
  const monthNames = t('calendar.months', { returnObjects: true }) as string[];
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);

  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()}.–${weekEnd.getDate()}. ${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()}.${weekStart.getMonth() + 1}.–${weekEnd.getDate()}.${weekEnd.getMonth() + 1}. ${weekEnd.getFullYear()}`;

  if (user && user.families.length === 0) {
    return <Navigate to="/onboarding" />;
  }

  if (!currentFamilyId || !user) {
    return <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>{t('app.loading')}</p></div>;
  }

  const currentFamily = user.families.find(f => f.id === currentFamilyId);
  const isOwner = currentFamily?.user_role === 'owner' || user.role === 'superadmin';

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="app">
        <header>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <AppNav />
            {user.families.length > 1 && (
              <select
                className="family-selector"
                value={currentFamilyId}
                onChange={e => setCurrentFamilyId(parseInt(e.target.value))}
              >
                {user.families.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="week-nav">
              <button onClick={() => setWeekStart(w => addDays(w, -7))}>{t('calendar.weekNav.prev')}</button>
              <span className="current">{weekLabel}</span>
              <button onClick={() => setWeekStart(w => addDays(w, 7))}>{t('calendar.weekNav.next')}</button>
              <button onClick={() => setWeekStart(getMonday(new Date()))}>{t('calendar.weekNav.today')}</button>
              <button
                className="copy-week-btn"
                onClick={() => nonRecurringCount > 0 ? setCopyWeekModal(true) : setCopyWeekMsg(t('calendar.copyWeek.noEvents'))}
                title={t('calendar.copyWeek.button')}
              >📋</button>
            </div>
            <div className="user-menu">
              <span className="user-name">{user.name}</span>
              <LanguageSwitcher />
              {isOwner && <Link to="/settings" className="btn-sm" title={t('header.familySettings')}>⚙️</Link>}
              {user.role === 'superadmin' && <Link to="/admin" className="btn-sm" title={t('header.adminPanel')}>🔧</Link>}
              <button className="btn-sm" onClick={logout}>{t('header.logout')}</button>
            </div>
          </div>
        </header>

        <NLPBar familyId={currentFamilyId} token={token} memberNames={members?.map(m => m.name) || []} onAction={() => { fetchEvents(); refreshWidgets(); }} />

        <div className="dashboard-layout">
        <div className="dashboard-main">
        <div className="calendar-grid">
          <div className="grid-header corner"></div>
          {weekDates.map((d, i) => (
            <div key={i} className="grid-header">
              {DAYS[i]}
              <span className="date-num">{d.getDate()}.{d.getMonth() + 1}.</span>
            </div>
          ))}

          {members.map(member => (
            <React.Fragment key={member.id}>
              <div key={`label-${member.id}`} className="member-label">
                <span className="member-dot" style={{ background: member.color }} />
                {member.name}
              </div>
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const cellEvents = getEventsForCell(member.id, dayIdx);
                const dateStr = fmt(addDays(weekStart, dayIdx));
                return (
                  <DroppableCell
                    key={`${member.id}-${dayIdx}`}
                    id={`cell-${member.id}-${dayIdx}`}
                    onClick={() => setModal({ memberId: member.id, date: dateStr, weekday: dayIdx })}
                  >
                    {cellEvents.map(ev => (
                      <DraggableEvent
                        key={ev.id}
                        event={ev}
                        onClick={() => setModal({ event: ev })}
                      />
                    ))}
                  </DroppableCell>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        
        <div className="timeline-divider">
          <span className="timeline-divider-icon">✨</span>
        </div>
        
        <Timeline familyId={currentFamilyId} token={token} refreshKey={widgetRefresh} onEventClick={jumpToDate} />
        </div>{/* end dashboard-main */}

        <aside className="dashboard-sidebar">
          <TodoWidget familyId={currentFamilyId} token={token} refreshKey={widgetRefresh} />
          <ShoppingWidget familyId={currentFamilyId} token={token} refreshKey={widgetRefresh} />
        </aside>
        </div>{/* end dashboard-layout */}

        <DragOverlay>
          {activeEvent && (
            <div
              className="event-card dragging"
              style={{
                borderLeftColor: activeEvent.member_color,
                background: activeEvent.member_color + '30',
                width: '150px'
              }}
            >
              <div className="event-title">
                {activeEvent.category_icon && <span>{activeEvent.category_icon} </span>}
                {activeEvent.title}
              </div>
              <div className="event-time">{activeEvent.start_time}–{activeEvent.end_time}</div>
            </div>
          )}
        </DragOverlay>

        {copyWeekMsg && (
          <div className="copy-week-toast">{copyWeekMsg}</div>
        )}

        {copyWeekModal && (
          <div className="modal-overlay" onClick={() => setCopyWeekModal(false)}>
            <div className="modal copy-week-dialog" onClick={e => e.stopPropagation()}>
              <h2>📋 {t('calendar.copyWeek.button')}</h2>
              <p>{t('calendar.copyWeek.confirm', { count: nonRecurringCount })}</p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setCopyWeekModal(false)}>{t('calendar.copyWeek.cancel')}</button>
                <button className="btn-primary" onClick={handleCopyWeek}>{t('calendar.copyWeek.copy')}</button>
              </div>
            </div>
          </div>
        )}

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
    </DndContext>
  );
}
