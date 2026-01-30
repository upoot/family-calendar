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

  useEffect(() => {
    if (!familyId || !token) {
      console.log('[Timeline] Missing familyId or token:', { familyId, hasToken: !!token });
      setEvents([]);
      return;
    }
    
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + 14); // Always fetch 2 weeks on refresh
        
        const start = today.toISOString().split('T')[0];
        const end = endDate.toISOString().split('T')[0];
        
        console.log('[Timeline] Fetching:', { familyId, start, end, refreshKey });
        
        const res = await fetch(`/api/events?familyId=${familyId}&start=${start}&end=${end}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log('[Timeline] Response:', res.status, res.ok);
        
        if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
        
        const data = await res.json();
        console.log('[Timeline] Received events:', data.length);
        
        // Sort by date and time
        const sorted = data.sort((a: TimelineEvent, b: TimelineEvent) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.start_time.localeCompare(b.start_time);
        });
        
        setEvents(sorted);
        setDaysAhead(14); // Reset to 2 weeks
        setHasMore(sorted.length > 0);
      } catch (err) {
        console.error('[Timeline] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [familyId, token, refreshKey]);

  const handleScroll = useCallback(async () => {
    if (!scrollRef.current || loading || !hasMore || !familyId || !token) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    
    // Load more when 100px from bottom
    if (scrollHeight - scrollTop - clientHeight < 100) {
      const newDays = daysAhead + 14;
      setLoading(true);
      
      try {
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + newDays);
        
        const start = today.toISOString().split('T')[0];
        const end = endDate.toISOString().split('T')[0];
        
        const res = await fetch(`/api/events?familyId=${familyId}&start=${start}&end=${end}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Failed to fetch events');
        
        const data = await res.json();
        
        const sorted = data.sort((a: TimelineEvent, b: TimelineEvent) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.start_time.localeCompare(b.start_time);
        });
        
        setEvents(sorted);
        setDaysAhead(newDays);
        setHasMore(sorted.length > 0 && newDays < 365);
      } catch (err) {
        console.error('Timeline fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
  }, [loading, hasMore, daysAhead, familyId, token]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const day = date.getDate();
    return `${weekday} ${day}`;
  };

  const getWeekNumber = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    // ISO 8601 week number
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = [];
    acc[event.date].push(event);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  const dates = Object.keys(eventsByDate);

  // Get unique members
  const uniqueMembers = Array.from(new Set(events.map(e => JSON.stringify({ name: e.member_name, color: e.member_color }))))
    .map(s => JSON.parse(s));

  console.log('[Timeline] Rendering:', { eventCount: events.length, dateCount: dates.length, dates: dates.slice(0, 5) });

  return (
    <div className="timeline-widget">
      <div className="timeline-header">
        <h3 className="timeline-title">📅 {t('timeline.title')}</h3>
        <div className="timeline-legend">
          {uniqueMembers.map(member => {
            const initials = member.name.length <= 2 ? member.name : member.name.slice(0, 2);
            return (
              <div key={member.name} className="timeline-legend-item">
                <span className="timeline-legend-avatar" style={{ background: member.color }}>
                  {initials}
                </span>
                <span className="timeline-legend-name">{member.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="timeline-list" ref={scrollRef} onScroll={handleScroll}>
        {!events.length && !loading && (
          <div className="timeline-empty">{t('timeline.noEvents')}</div>
        )}
        {dates.map((date, idx) => {
          const currentWeek = getWeekNumber(date);
          const prevWeek = idx > 0 ? getWeekNumber(dates[idx - 1]) : null;
          const showWeekDivider = idx === 0 || (prevWeek !== null && currentWeek !== prevWeek);
          
          return (
            <div key={date}>
              {showWeekDivider && (
                <div className="timeline-week-divider">
                  <span className="timeline-week-label">Viikko {currentWeek}</span>
                </div>
              )}
              <div className="timeline-day">
                <div className="timeline-date">{formatDate(date)}</div>
                <div className="timeline-events-row">
                  {eventsByDate[date].map(event => (
                    <div 
                      key={event.id}
                      className="timeline-event"
                      onClick={() => onEventClick?.(event.date)}
                      style={{
                        backgroundColor: event.member_color + '15',
                        borderColor: event.member_color + '40'
                      }}
                    >
                      <div className="timeline-event-title">
                        {event.category_icon && <span>{event.category_icon} </span>}
                        {event.title} {event.start_time.slice(0, 5)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="timeline-loading">{t('timeline.loading')}</div>
        )}
      </div>
    </div>
  );
}
