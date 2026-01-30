import { useEffect, useState, useRef } from 'react';
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

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6-21 (22 exclusive)

export default function Timeline({ familyId, token, refreshKey, onEventClick }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
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
        endDate.setDate(today.getDate() + 14);
        
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
        
        const sorted = data.sort((a: TimelineEvent, b: TimelineEvent) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.start_time.localeCompare(b.start_time);
        });
        
        setEvents(sorted);
      } catch (err) {
        console.error('[Timeline] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [familyId, token, refreshKey]);

  const getWeekNumber = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
  };

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

  const timeToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const getEventPosition = (event: TimelineEvent) => {
    const startMinutes = timeToMinutes(event.start_time);
    const endMinutes = timeToMinutes(event.end_time);
    const duration = endMinutes - startMinutes;
    
    const startHour = Math.floor(startMinutes / 60);
    const startMinute = startMinutes % 60;
    
    // Grid starts at 6:00, each hour is one column
    const gridStart = 6 * 60; // 6:00 in minutes
    const minutesFromStart = startMinutes - gridStart;
    
    // Column index (0-15 for hours 6-21)
    const columnStart = Math.floor(minutesFromStart / 60) + 1; // +1 for day label column
    
    // Percentage within the hour
    const minuteOffset = (minutesFromStart % 60) / 60;
    
    // How many columns to span
    const columnSpan = Math.ceil(duration / 60);
    
    return {
      gridColumnStart: columnStart,
      gridColumnEnd: columnStart + Math.max(1, columnSpan),
      leftOffset: minuteOffset * 100, // percentage
      duration
    };
  };

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = [];
    acc[event.date].push(event);
    return acc;
  }, {} as Record<string, TimelineEvent[]>);

  const dates = Object.keys(eventsByDate);
  
  // Group dates by week
  const datesByWeek = dates.reduce((acc, date) => {
    const week = getWeekNumber(date);
    if (!acc[week]) acc[week] = [];
    acc[week].push(date);
    return acc;
  }, {} as Record<string, string[]>);
  
  const weeks = Object.keys(datesByWeek);

  return (
    <div className="timeline-widget">
      <h3 className="timeline-title">📅 {t('timeline.title')}</h3>
      <div className="timeline-list" ref={scrollRef}>
        {!events.length && !loading && (
          <div className="timeline-empty">{t('timeline.noEvents')}</div>
        )}
        {weeks.map(week => (
          <div key={week}>
            <div className="timeline-week-header">Viikko {week.split('-W')[1]}</div>
            <div className="timeline-grid">
              {/* Header row */}
              <div className="timeline-grid-header">
                <div className="timeline-grid-corner"></div>
                {HOURS.map(hour => (
                  <div key={hour} className="timeline-hour-label">
                    {hour}:00
                  </div>
                ))}
              </div>
              
              {/* Day rows */}
              {datesByWeek[week].map(date => (
                <div key={date} className="timeline-day-row">
                  <div className="timeline-day-label">{formatDate(date)}</div>
                  {HOURS.map(hour => (
                    <div key={hour} className="timeline-hour-cell">
                      {eventsByDate[date]
                        .filter(event => {
                          const startHour = parseInt(event.start_time.split(':')[0]);
                          return startHour === hour;
                        })
                        .map(event => {
                          const pos = getEventPosition(event);
                          return (
                            <div
                              key={event.id}
                              className="timeline-event"
                              onClick={() => onEventClick?.(event.date)}
                              style={{
                                backgroundColor: event.member_color + '15',
                                borderColor: event.member_color + '40',
                                left: `${pos.leftOffset}%`,
                                width: `${(pos.gridColumnEnd - pos.gridColumnStart) * 100}%`
                              }}
                            >
                              <span className="timeline-event-title">
                                {event.category_icon && `${event.category_icon} `}
                                {event.title}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  ))}
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
