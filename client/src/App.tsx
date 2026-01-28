import { useState, useEffect, useCallback } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import EventModal from './components/EventModal';
import DraggableEvent from './components/DraggableEvent';
import DroppableCell from './components/DroppableCell';
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

  const weekStr = fmt(weekStart);

  // Drag sensors - require small movement before drag starts (to allow clicks)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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

    // Parse drop target: "cell-{memberId}-{dayIdx}"
    const [, memberIdStr, dayIdxStr] = (over.id as string).split('-');
    const newMemberId = parseInt(memberIdStr);
    const newDayIdx = parseInt(dayIdxStr);
    const newDate = fmt(addDays(weekStart, newDayIdx));

    // Check if anything changed
    const oldDayIdx = draggedEvent.is_recurring 
      ? draggedEvent.weekday 
      : weekDates.findIndex(d => fmt(d) === draggedEvent.date);
    
    if (newMemberId === draggedEvent.member_id && newDayIdx === oldDayIdx) {
      return; // No change
    }

    // Update the event
    const updateData: Partial<EventFormData> = {
      member_id: newMemberId,
      ...(draggedEvent.is_recurring 
        ? { weekday: newDayIdx }
        : { date: newDate }
      ),
    };

    await fetch(`/api/events/${draggedEvent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });

    fetchEvents();
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);
  const monthNames = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
  
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()}.–${weekEnd.getDate()}. ${monthNames[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()}.${weekStart.getMonth() + 1}.–${weekEnd.getDate()}.${weekEnd.getMonth() + 1}. ${weekEnd.getFullYear()}`;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
            </>
          ))}
        </div>

        {/* Drag overlay - shows dragged item */}
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
