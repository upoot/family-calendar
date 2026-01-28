import { useState, useEffect } from 'react';
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

export default function EventModal({ event, members, categories, defaultMemberId, defaultDate, defaultWeekday, onSave, onDelete, onClose }: Props) {
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

  const WEEKDAYS = ['Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai', 'Sunnuntai'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{event ? 'Muokkaa tapahtumaa' : 'Uusi tapahtuma'}</h2>
        <form onSubmit={handleSubmit}>
          <label>Perheenjäsen</label>
          <select value={form.member_id} onChange={e => set('member_id', +e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <label>Otsikko</label>
          <input value={form.title} onChange={e => set('title', e.target.value)} autoFocus required />

          <div className="row">
            <div>
              <label>Alkaa</label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} required />
            </div>
            <div>
              <label>Päättyy</label>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} required />
            </div>
          </div>

          <label>Kategoria</label>
          <select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value ? +e.target.value : null)}>
            <option value="">— Ei kategoriaa —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>

          <label>Sijainti</label>
          <input value={form.location} onChange={e => set('location', e.target.value)} />

          <label>Kuvaus</label>
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
            <label htmlFor="recurring" style={{ margin: 0 }}>Toistuva viikoittain</label>
          </div>

          {form.is_recurring ? (
            <>
              <label>Viikonpäivä</label>
              <select value={form.weekday ?? 0} onChange={e => set('weekday', +e.target.value)}>
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </>
          ) : (
            <>
              <label>Päivämäärä</label>
              <input type="date" value={form.date ?? ''} onChange={e => set('date', e.target.value)} required={!form.is_recurring} />
            </>
          )}

          <div className="modal-actions">
            {event && onDelete && <button type="button" className="btn-danger" onClick={onDelete}>Poista</button>}
            <button type="button" className="btn-cancel" onClick={onClose}>Peruuta</button>
            <button type="submit" className="btn-primary">Tallenna</button>
          </div>
        </form>
      </div>
    </div>
  );
}
