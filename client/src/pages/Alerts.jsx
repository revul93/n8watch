import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { getAlerts } from '../lib/api';
import ActiveAlerts from '../components/ActiveAlerts';
import AlertsTable from '../components/AlertsTable';
import AlertRules from '../components/AlertRules';
import { RefreshCw } from 'lucide-react';

export default function Alerts() {
  const { lastAlert } = useWebSocket();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const data = await getAlerts({ limit: 500 });
      const rows = Array.isArray(data) ? data : (data?.alerts || data?.rows || []);
      setAlerts(rows);
    } catch (e) {
      console.error('Failed to fetch alerts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Refresh table on new alert events
  useEffect(() => {
    if (lastAlert) {
      const timer = setTimeout(fetchAlerts, 1000);
      return () => clearTimeout(timer);
    }
  }, [lastAlert]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Active and historical alert events</p>
        </div>
        <button
          onClick={fetchAlerts}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <ActiveAlerts lastAlert={lastAlert} />

      <AlertRules />

      <AlertsTable alerts={alerts} loading={loading} />
    </div>
  );
}
