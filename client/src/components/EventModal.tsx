import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarEvent, EventFormData, Member, Category } from '../types';

interface Props {
  event?: CalendarEvent | null;
  members: Member[];
  categories: Category[];
  defaultMemberId?: number;
  defaultDate?: string;
  defaultWeekday?: number;
  onSave: (data: EventFormData) => void;
  onDelete?: () => void;
  onClose: () => void;
}

// Categories that show ride fields
const RIDE_CATEGORIES = ['Harkat'];

export default function EventModal({ event, members, categories, defaultMemberId, defaultDate, defaultWeekday, onSave, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<EventFormData>({
    member_id: event?.member_id ?? defaultMemberId ?? members[0]?.id ?? 1,
    category_id: event?.category_id ?? null,
    title: event?.title ?? '',
    start_time: event?.start_time ?? '09:00',
    end_time: event?.end_time ?? '10:00',
    date: event?.date ?? defaultDate ?? null,
    weekday: event?.weekday ?? defaultWeekday ?? null,
    location: event?.location ?? '',
    description: event?.description ?? '',
    is_recurring: event ? !!event.is_recurring : false,
    ride_outbound: event?.ride_outbound ?? '',
    ride_return: event?.ride_return ?? '',
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = (key: keyof EventFormData, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  // Check if current category should show ride fields
  const selectedCategory = categories.find(c => c.id === form.category_id);
  const showRideFields = selectedCategory && RIDE_CATEGORIES.includes(selectedCategory.name);

  const WEEKDAYS = t('eventModal.weekdays', { returnObjects: true }) as string[];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{event ? t('eventModal.editEvent') : t('eventModal.newEvent')}</h2>
        <form onSubmit={handleSubmit}>
          <label>{t('eventModal.member')}</label>
          <select value={form.member_id} onChange={e => set('member_id', +e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <label>{t('eventModal.title')}</label>
          <input value={form.title} onChange={e => set('title', e.target.value)} autoFocus required />

          <div className="row">
            <div>
              <label>{t('eventModal.startTime')}</label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} required />
            </div>
            <div>
              <label>{t('eventModal.endTime')}</label>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} required />
            </div>
          </div>

          <label>{t('eventModal.category')}</label>
          <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value ? +e.target.value : null)}>
            <option value="">{t('eventModal.noCategory')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>

          {showRideFields && (
            <div className="ride-section">
              <div className="ride-header">{t('eventModal.rides')}</div>
              <div className="row">
                <div>
                  <label>{t('eventModal.rideOutbound')}</label>
                  <input
                    value={form.ride_outbound}
                    onChange={e => set('ride_outbound', e.target.value)}
                    placeholder={t('eventModal.rideOutboundPlaceholder')}
                  />
                </div>
                <div>
                  <label>{t('eventModal.rideReturn')}</label>
                  <input
                    value={form.ride_return}
                    onChange={e => set('ride_return', e.target.value)}
                    placeholder={t('eventModal.rideReturnPlaceholder')}
                  />
                </div>
              </div>
            </div>
          )}

          <label>{t('eventModal.location')}</label>
          <input value={form.location} onChange={e => set('location', e.target.value)} />

          <label>{t('eventModal.description')}</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} />

          <div className="toggle-row">
            <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={e => {
              const rec = e.target.checked;
              set('is_recurring', rec);
              if (rec) {
                set('date', null);
                if (form.weekday === null) set('weekday', defaultWeekday ?? 0);
              } else {
                set('weekday', null);
                if (!form.date) set('date', defaultDate ?? new Date().toISOString().slice(0, 10));
              }
            }} />
            <label htmlFor="recurring" style={{ margin: 0 }}>{t('eventModal.recurringWeekly')}</label>
          </div>

          {form.is_recurring ? (
            <>
              <label>{t('eventModal.weekday')}</label>
              <select value={form.weekday ?? 0} onChange={e => set('weekday', +e.target.value)}>
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </>
          ) : (
            <>
              <label>{t('eventModal.date')}</label>
              <input type="date" value={form.date ?? ''} onChange={e => set('date', e.target.value)} required={!form.is_recurring} />
            </>
          )}

          <div className="modal-actions">
            {event && onDelete && <button type="button" className="btn-danger" onClick={onDelete}>{t('eventModal.delete')}</button>}
            <button type="button" className="btn-cancel" onClick={onClose}>{t('eventModal.cancel')}</button>
            <button type="submit" className="btn-primary">{t('eventModal.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
