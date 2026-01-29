import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Todo {
  id: number;
  title: string;
  done: number;
  member_name: string | null;
  member_color: string | null;
}

interface Props {
  familyId: number | null;
  token: string | null;
  refreshKey: number;
}

function getISOWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export default function TodoWidget({ familyId, token, refreshKey }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const { t } = useTranslation();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    if (!familyId) return;
    const res = await fetch(`/api/families/${familyId}/todos?week=${getISOWeek()}`, { headers });
    if (res.ok) setTodos(await res.json());
  }, [familyId, token, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const toggleDone = async (todo: Todo) => {
    await fetch(`/api/families/${familyId}/todos/${todo.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ done: !todo.done }),
    });
    load();
  };

  const doneCount = todos.filter(t => t.done).length;
  const progress = todos.length ? (doneCount / todos.length) * 100 : 0;

  return (
    <div className="widget">
      <div className="widget-header">
        <h3>✅ {t('widgets.weeklyTodos')}</h3>
        <Link to="/todos" className="widget-link">{t('widgets.allLink')}</Link>
      </div>
      {todos.length > 0 && (
        <div className="widget-progress">
          <div className="widget-progress-bar">
            <div className="widget-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="widget-progress-text">{doneCount}/{todos.length}</span>
        </div>
      )}
      <div className="widget-list">
        {todos.slice(0, 6).map(todo => (
          <div key={todo.id} className={`widget-item ${todo.done ? 'widget-item-done' : ''}`} onClick={() => toggleDone(todo)}>
            <span className={`widget-check ${todo.done ? 'widget-checked' : ''}`}>
              {todo.done ? '✓' : ''}
            </span>
            <span className="widget-item-text">{todo.title}</span>
            {todo.member_color && (
              <span className="widget-dot" style={{ background: todo.member_color }} />
            )}
          </div>
        ))}
        {todos.length === 0 && <p className="widget-empty">{t('widgets.noTodos')}</p>}
      </div>
    </div>
  );
}
