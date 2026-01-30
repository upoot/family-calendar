import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './Timeline.css';

interface TimelineEvent {
  id: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  member_name: string;
  member_color: string;
  category_icon?: string;
}

interface Props {
  familyId: number | null;
  token: string | null;
  refreshKey?: number;
  onEventClick?: (dateStr: string) => void;
}

export default function Timeline({ familyId, token, refreshKey, onEventClick }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [daysAhead, setDaysAhead] = useState(14);
  const [hasMore, setHasMore] = useState(true);
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchEvents = useCallback(async (days: number) => {
    if (!familyId || !token) return;
    
    setLoading(true);
    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + days);
      
      const start = today.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];
      
      const res = await fetch(`/api/families/${familyId}/events?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Failed to fetch events');
      
      const data = await res.json();
      
      // Sort by date and time
      const sorted = data.sort((a: TimelineEvent, b: TimelineEvent) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.start_time.localeCompare(b.start_time);
      });
      
      setEvents(sorted);
      setHasMore(sorted.length > 0 && days < 365);
    } catch (err) {
      console.error('Timeline fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [familyId, token]);

  useEffect(() => {
    setDaysAhead(14);
    fetchEvents(14);
  }, [familyId, token, refreshKey, fetchEvents]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || loading || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    
    // Load more when 100px from bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      const newDays = daysAhead + 14;
      setDaysAhead(newDays);
      fetchEvents(newDays);
    }
  }, [loading, hasMore, daysAhead, fetchEvents]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.getTime() === today.getTime()) return t('timeline.today');
    if (date.getTime() === tomorrow.getTime()) return t('timeline.tomorrow');
    
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('fi-FI', options);
  };

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = [];
    acc[event.date].push(event);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  const dates = Object.keys(eventsByDate);

  return (
    <div className="timeline-widget">
      <h3 className="timeline-title">📅 {t('timeline.title')}</h3>
      <div className="timeline-list" ref={scrollRef} onScroll={handleScroll}>
        {!events.length && !loading && (
          <div className="timeline-empty">{t('timeline.noEvents')}</div>
        )}
        {dates.map(date => (
          <div key={date} className="timeline-day">
            <div className="timeline-date">{formatDate(date)}</div>
            <div className="timeline-events-row">
              {eventsByDate[date].map(event => (
                <div 
                  key={event.id}
                  className="timeline-event"
                  onClick={() => onEventClick?.(event.date)}
                >
                  <div 
                    className="timeline-event-bar" 
                    style={{ backgroundColor: event.member_color }}
                  />
                  <div className="timeline-event-content">
                    <div className="timeline-event-title">
                      {event.category_icon && <span>{event.category_icon} </span>}
                      {event.title}
                    </div>
                    <div className="timeline-event-meta">
                      <span className="timeline-time">{event.start_time}–{event.end_time}</span>
                      <span className="timeline-member">{event.member_name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="timeline-loading">{t('timeline.loading')}</div>
        )}
      </div>
    </div>
  );
}
