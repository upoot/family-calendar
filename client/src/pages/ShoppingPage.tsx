import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import PageLayout from '../components/PageLayout';

interface ShoppingItem {
  id: number;
  name: string;
  category: string | null;
  checked: number;
  added_by_name: string | null;
}

const CATEGORIES = [
  { value: '', label: 'Ei kategoriaa' },
  { value: '🥛 Maito & meijeri', label: '🥛 Maito & meijeri' },
  { value: '🍎 Hedelmät & vihannekset', label: '🍎 Hedelmät & vihannekset' },
  { value: '🥩 Liha & kala', label: '🥩 Liha & kala' },
  { value: '🍞 Leipä', label: '🍞 Leipä' },
  { value: '🥤 Juomat', label: '🥤 Juomat' },
  { value: '🧊 Pakasteet', label: '🧊 Pakasteet' },
  { value: '🧻 Muu', label: '🧻 Muu' },
];

export default function ShoppingPage() {
  const { token, currentFamilyId } = useAuth();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    if (!currentFamilyId) return;
    const res = await fetch(`/api/families/${currentFamilyId}/shopping`, { headers });
    setItems(await res.json());
  }, [currentFamilyId, token]);

  useEffect(() => { load(); }, [load]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !currentFamilyId) return;
    await fetch(`/api/families/${currentFamilyId}/shopping`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: newName, category: newCategory || null }),
    });
    setNewName('');
    setNewCategory('');
    load();
  };

  const toggleChecked = async (item: ShoppingItem) => {
    await fetch(`/api/families/${currentFamilyId}/shopping/${item.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ checked: !item.checked }),
    });
    load();
  };

  const deleteItem = async (id: number) => {
    await fetch(`/api/families/${currentFamilyId}/shopping/${id}`, {
      method: 'DELETE', headers,
    });
    load();
  };

  const clearChecked = async () => {
    await fetch(`/api/families/${currentFamilyId}/shopping`, {
      method: 'DELETE', headers,
    });
    load();
  };

  // Group by category
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'Muut';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ShoppingItem[]>);

  const checkedCount = items.filter(i => i.checked).length;

  return (
    <PageLayout><div className="shopping-page">
      <div className="shopping-header">
        <h2>🛒 Ostoslista</h2>
        <div className="shopping-header-right">
          {checkedCount > 0 && (
            <>
              <span className="shopping-count">{checkedCount} / {items.length} ostettu</span>
              <button className="btn-small btn-danger" onClick={clearChecked}>Tyhjennä ostetut</button>
            </>
          )}
        </div>
      </div>

      <div className="shopping-list">
        {Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="shopping-category">
            <span className="shopping-cat-label">{category}</span>
            {catItems.map(item => (
              <div key={item.id} className={`shopping-item ${item.checked ? 'shopping-checked' : ''}`}>
                <button
                  className={`shopping-check ${item.checked ? 'shopping-check-done' : ''}`}
                  onClick={() => toggleChecked(item)}
                >
                  {item.checked ? '✓' : ''}
                </button>
                <span className="shopping-name">{item.name}</span>
                <button className="shopping-delete" onClick={() => deleteItem(item.id)}>✕</button>
              </div>
            ))}
          </div>
        ))}
        {items.length === 0 && <p className="shopping-empty">Ostoslista on tyhjä 🎉</p>}
      </div>

      <form className="shopping-add-form" onSubmit={addItem}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Lisää tuote..."
          className="shopping-input"
        />
        <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="shopping-select">
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={!newName.trim()}>+</button>
      </form>
    </div></PageLayout>
  );
}
