import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  familyId: number | null;
  token: string | null;
  memberNames?: string[];
  onAction: () => void;
}

function getISOWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export default function NLPBar({ familyId, token, onAction }: Props) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !familyId) return;
    setLoading(true);
    setStatus(null);

    try {
      const parseRes = await fetch('/api/parse', {
        method: 'POST', headers,
        body: JSON.stringify({ text: input, familyId }),
      });
      const parsed = await parseRes.json();

      switch (parsed.type) {
        case 'add_shopping': {
          await fetch(`/api/families/${familyId}/shopping`, {
            method: 'POST', headers,
            body: JSON.stringify({ name: parsed.title || input }),
          });
          setStatus({ text: t('nlp.addedShopping', { item: parsed.title || input }), type: 'success' });
          break;
        }
        case 'add_todo': {
          const week = getISOWeek();
          const todoRes = await fetch(`/api/families/${familyId}/todos`, {
            method: 'POST', headers,
            body: JSON.stringify({
              title: parsed.title || input,
              week,
              assignedTo: parsed.memberId || null,
            }),
          });
          if (!todoRes.ok) throw new Error(`Todo: ${todoRes.status}`);
          setStatus({ text: t('nlp.addedTodo', { item: parsed.title || input }), type: 'success' });
          break;
        }
        case 'create_event':
          setStatus({ text: t('nlp.eventHint', { item: parsed.title || input }), type: 'info' });
          break;
        case 'query_availability':
          setStatus({ text: t('nlp.queryHint', { item: parsed.title || input }), type: 'info' });
          break;
        default:
          // Treat unknown as todo
          {
            const week = getISOWeek();
            const defRes = await fetch(`/api/families/${familyId}/todos`, {
              method: 'POST', headers,
              body: JSON.stringify({ title: input, week }),
            });
            if (!defRes.ok) throw new Error(`Todo: ${defRes.status}`);
            setStatus({ text: t('nlp.addedTodo', { item: input }), type: 'success' });
          }
      }

      setInput('');
      onAction();
    } catch (err) {
      setStatus({ text: t('nlp.error', { error: (err as Error).message }), type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 4000);
    }
  };

  return (
    <div className="nlp-bar">
      <form onSubmit={handleSubmit} className="nlp-form">
        <span className="nlp-icon">⚡</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`kauppa: maitoa / tehtävä: pese auto ${memberNames?.[0] || '[henkilö]'} / varaa: treeni ti klo 17`}
          className="nlp-input"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="nlp-submit">
          {loading ? '...' : '↵'}
        </button>
      </form>
      {status && (
        <div className={`nlp-status nlp-status-${status.type}`}>{status.text}</div>
      )}
    </div>
  );
}
