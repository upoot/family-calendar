import { useState } from 'react';

interface Props {
  familyId: number | null;
  token: string | null;
  onAction: () => void;
}

export default function NLPBar({ familyId, token, onAction }: Props) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

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
          setStatus({ text: `🛒 Lisätty kauppalistaan: ${parsed.title || input}`, type: 'success' });
          break;
        }
        case 'add_todo': {
          const now = new Date();
          const jan4 = new Date(now.getFullYear(), 0, 4);
          const dayDiff = (now.getTime() - jan4.getTime()) / 86400000;
          const weekNum = Math.ceil((dayDiff + jan4.getDay() + 1) / 7);
          const week = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

          await fetch(`/api/families/${familyId}/todos`, {
            method: 'POST', headers,
            body: JSON.stringify({
              title: parsed.title || input,
              week,
              assignedTo: parsed.memberId || null,
            }),
          });
          setStatus({ text: `✅ Tehtävä lisätty: ${parsed.title || input}`, type: 'success' });
          break;
        }
        case 'create_event':
          setStatus({ text: `📅 "${parsed.title || input}" — käytä kalenteria lisäämiseen toistaiseksi`, type: 'info' });
          break;
        default:
          setStatus({ text: `🤔 En tunnistanut: "${input}"`, type: 'info' });
      }

      setInput('');
      onAction();
    } catch (err) {
      setStatus({ text: `❌ Virhe: ${(err as Error).message}`, type: 'error' });
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
          placeholder="Kirjoita: &quot;lisää maitoa kauppalistaan&quot; tai &quot;muista pestä auto&quot;"
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
