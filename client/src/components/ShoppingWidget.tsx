import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ShoppingItem {
  id: number;
  name: string;
  category: string | null;
  checked: number;
}

interface Props {
  familyId: number | null;
  token: string | null;
  refreshKey: number;
}

export default function ShoppingWidget({ familyId, token, refreshKey }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const { t } = useTranslation();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    if (!familyId) return;
    const res = await fetch(`/api/families/${familyId}/shopping`, { headers });
    if (res.ok) setItems(await res.json());
  }, [familyId, token, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const toggleChecked = async (item: ShoppingItem) => {
    await fetch(`/api/families/${familyId}/shopping/${item.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ checked: !item.checked }),
    });
    load();
  };

  const unchecked = items.filter(i => !i.checked);
  const checkedCount = items.filter(i => i.checked).length;

  return (
    <div className="widget">
      <div className="widget-header">
        <h3>🛒 {t('widgets.shoppingList')}</h3>
        <Link to="/shopping" className="widget-link">{t('widgets.allLink')}</Link>
      </div>
      {items.length > 0 && checkedCount > 0 && (
        <span className="widget-badge">{t('widgets.bought', { count: checkedCount })}</span>
      )}
      <div className="widget-list">
        {unchecked.slice(0, 8).map(item => (
          <div key={item.id} className="widget-item" onClick={() => toggleChecked(item)}>
            <span className="widget-check">{''}</span>
            <span className="widget-item-text">{item.name}</span>
          </div>
        ))}
        {unchecked.length > 8 && (
          <p className="widget-more">{t('widgets.more', { count: unchecked.length - 8 })}</p>
        )}
        {items.length === 0 && <p className="widget-empty">{t('widgets.emptyList')}</p>}
      </div>
    </div>
  );
}
