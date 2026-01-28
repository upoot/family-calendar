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
    </div>
  );
}
