import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import SchoolIntegrationModal from './SchoolIntegrationModal';
import IntegrationSyncModal from './IntegrationSyncModal';

interface Member {
  id: number;
  name: string;
  color: string;
}

interface Integration {
  id: number;
  member_id: number;
  member_name: string;
  member_color: string;
  config: {
    baseUrl: string;
    use_simulation?: boolean;
  };
  last_sync: string | null;
  last_sync_status: {
    event_count: number;
    status: string;
    error_message: string | null;
    synced_at: string;
  } | null;
}

interface SchoolIntegrationListProps {
  familyId: number;
  token: string;
}

export default function SchoolIntegrationList({ familyId, token }: SchoolIntegrationListProps) {
  const { t } = useTranslation();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [syncingMemberId, setSyncingMemberId] = useState<number | null>(null);
  const [syncCredentials, setSyncCredentials] = useState<{ url: string; username: string; password: string; useSimulation?: boolean } | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  useEffect(() => {
    loadData();
  }, [familyId]);

  const loadData = async () => {
    // Load integrations
    const intRes = await fetch(`/api/families/${familyId}/integrations/school`, { headers });
    const intData = await intRes.json();
    setIntegrations(intData);

    // Load members
    const membersRes = await fetch(`/api/members?familyId=${familyId}`, { headers });
    const membersData = await membersRes.json();
    setMembers(membersData);
  };

  const handleAdd = () => {
    setEditingIntegration(null);
    setShowModal(true);
  };

  const handleEdit = (integration: Integration) => {
    setEditingIntegration(integration);
    setShowModal(true);
  };

  const handleDelete = async (integration: Integration) => {
    if (!confirm(`Poista ${integration.member_name}:n integraatio?`)) return;

    await fetch(`/api/families/${familyId}/integrations/school/${integration.member_id}`, {
      method: 'DELETE',
      headers
    });

    loadData();
  };

  const handleSync = (integration: Integration) => {
    setSyncingMemberId(integration.member_id);
    setSyncCredentials({
      url: integration.config.baseUrl,
      username: '',
      password: '',
      useSimulation: integration.config.use_simulation || false
    });
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingIntegration(null);
    loadData();
  };

  const handleSyncClose = () => {
    setSyncingMemberId(null);
    setSyncCredentials(null);
    loadData();
  };

  const formatSyncStatus = (integration: Integration) => {
    if (!integration.last_sync) {
      return <span style={{ color: 'var(--text-muted)' }}>Ei vielä synkattu</span>;
    }

    const date = new Date(integration.last_sync).toLocaleString('fi-FI');
    
    if (integration.last_sync_status) {
      const { status, event_count, error_message } = integration.last_sync_status;
      
      if (status === 'success') {
        return (
          <span style={{ color: 'var(--color-success)' }}>
            ✅ {date} ({event_count} koetta)
          </span>
        );
      } else if (status === 'error') {
        return (
          <span style={{ color: 'var(--color-danger)' }} title={error_message || undefined}>
            ❌ {date} (Virhe)
          </span>
        );
      }
    }

    return <span>{date}</span>;
  };

  return (
    <>
      <div className="settings-inner-card">
        <h3 className="settings-subtitle">🏫 School</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {t('settings.integrations.school.description')}
        </p>

        {integrations.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
              Konfiguroidut integraatiot:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {integrations.map(int => (
                <div
                  key={int.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: int.member_color
                      }}
                    />
                    <span style={{ fontWeight: 600, flex: 1 }}>{int.member_name}</span>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    {formatSyncStatus(int)}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-sm" onClick={() => handleEdit(int)}>
                      ✏️ Muokkaa
                    </button>
                    <button
                      className="btn-sm"
                      onClick={() => handleSync(int)}
                      style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)', color: 'white' }}
                    >
                      🔄 Synkronoi
                    </button>
                    <button className="btn-sm btn-danger" onClick={() => handleDelete(int)}>
                      🗑 Poista
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={handleAdd}>
          + Lisää integraatio
        </button>
      </div>

      {showModal && (
        <SchoolIntegrationModal
          familyId={familyId}
          token={token}
          members={members}
          existingIntegration={editingIntegration}
          onClose={handleModalClose}
        />
      )}

      {syncingMemberId && syncCredentials && (
        <IntegrationSyncModal
          familyId={familyId}
          memberId={syncingMemberId}
          initialCredentials={syncCredentials}
          onClose={handleSyncClose}
        />
      )}
    </>
  );
}
