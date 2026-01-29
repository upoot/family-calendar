import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import PageLayout from '../components/PageLayout';
import type { Member } from '../types';

interface Todo {
  id: number;
  title: string;
  done: number;
  due_date: string | null;
  assigned_to: number | null;
  week: string;
  member_name: string | null;
  member_color: string | null;
}

function getISOWeek(d: Date = new Date()): string {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const jan4 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function offsetWeek(week: string, offset: number): string {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(y, 0, 4);
  const monday = new Date(jan4.getTime() + ((1 - ((jan4.getDay() + 6) % 7)) + (w - 1) * 7 + offset * 7) * 86400000);
  return getISOWeek(monday);
}

export default function TodoPage() {
  const { token, currentFamilyId } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [week, setWeek] = useState(getISOWeek());
  const [members, setMembers] = useState<Member[]>([]);
  const [assignTo, setAssignTo] = useState<number | ''>('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    if (!currentFamilyId) return;
    const [todosRes, membersRes] = await Promise.all([
      fetch(`/api/families/${currentFamilyId}/todos?week=${week}`, { headers }),
      fetch(`/api/members?familyId=${currentFamilyId}`, { headers }),
    ]);
    setTodos(await todosRes.json());
    setMembers(await membersRes.json());
  }, [currentFamilyId, week, token]);

  useEffect(() => { load(); }, [load]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentFamilyId) return;
    await fetch(`/api/families/${currentFamilyId}/todos`, {
      method: 'POST', headers,
      body: JSON.stringify({ title: newTitle, week, assignedTo: assignTo || null }),
    });
    setNewTitle('');
    setAssignTo('');
    load();
  };

  const toggleDone = async (todo: Todo) => {
    await fetch(`/api/families/${currentFamilyId}/todos/${todo.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ done: !todo.done }),
    });
    load();
  };

  const deleteTodo = async (id: number) => {
    await fetch(`/api/families/${currentFamilyId}/todos/${id}`, {
      method: 'DELETE', headers,
    });
    load();
  };

  const doneCount = todos.filter(t => t.done).length;
  const progress = todos.length ? (doneCount / todos.length) * 100 : 0;

  return (
    <PageLayout><div className="todo-page">
      <div className="todo-header">
        <div className="todo-week-nav">
          <button className="btn-icon" onClick={() => setWeek(w => offsetWeek(w, -1))}>←</button>
          <h2>{week}</h2>
          <button className="btn-icon" onClick={() => setWeek(w => offsetWeek(w, 1))}>→</button>
          {week !== getISOWeek() && (
            <button className="btn-small" onClick={() => setWeek(getISOWeek())}>Tänään</button>
          )}
        </div>
        <span className="todo-count">{doneCount} / {todos.length} tehty</span>
      </div>

      <div className="todo-progress-bar">
        <div className="todo-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="todo-list">
        {todos.map(todo => (
          <div key={todo.id} className={`todo-item ${todo.done ? 'todo-done' : ''}`}>
            <button className={`todo-checkbox ${todo.done ? 'todo-checked' : ''}`} onClick={() => toggleDone(todo)}>
              {todo.done ? '✓' : ''}
            </button>
            <span className="todo-title">{todo.title}</span>
            {todo.member_name && (
              <div className="todo-avatar" style={{ background: todo.member_color || '#8E8E93' }}>
                {todo.member_name[0]}
              </div>
            )}
            <button className="todo-delete" onClick={() => deleteTodo(todo.id)}>✕</button>
          </div>
        ))}
        {todos.length === 0 && <p className="todo-empty">Ei tehtäviä tälle viikolle ✨</p>}
      </div>

      <form className="todo-add-form" onSubmit={addTodo}>
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Lisää tehtävä..."
          className="todo-input"
        />
        <select value={assignTo} onChange={e => setAssignTo(e.target.value ? Number(e.target.value) : '')} className="todo-select">
          <option value="">Ei vastuuhenkilöä</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={!newTitle.trim()}>+</button>
      </form>
    </div></PageLayout>
  );
}
