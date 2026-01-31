import { useDraggable } from '@dnd-kit/core';
import type { CalendarEvent } from '../types';

interface Props {
  event: CalendarEvent;
  onClick: () => void;
}

export default function DraggableEvent({ event, onClick }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
  });

  const hasRides = event.ride_outbound || event.ride_return;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`event-card ${isDragging ? 'dragging' : ''}`}
      style={{ 
        borderLeftColor: event.member_color, 
        background: event.member_color + '15',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
      }}
      title={event.description || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="event-title">
        {event.category_icon && <span>{event.category_icon} </span>}
        {event.title}
        {event.is_recurring ? <span className="recurring-badge">🔄</span> : null}
      </div>
      <div className="event-time">{event.start_time}–{event.end_time}</div>
      {event.location && <div className="event-location">📍 {event.location}</div>}
      {hasRides && (
        <div className="ride-badges">
          {event.ride_outbound && (
            <span className="ride-badge ride-outbound">🚗→ {event.ride_outbound}</span>
          )}
          {event.ride_return && (
            <span className="ride-badge ride-return">🚗← {event.ride_return}</span>
          )}
        </div>
      )}
    </div>
  );
}
