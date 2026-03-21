import { useState, useEffect } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { cn, formatDuration } from '../lib/utils';
import { getActiveAlerts } from '../lib/api';

function LiveDuration({ startTime }) {
  const [elapsed, setElapsed] = useState(Date.now() - new Date(startTime).getTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Date.now() - new Date(startTime).getTime());
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  return <span>{formatDuration(elapsed)}</span>;
}

export default function ActiveAlerts({ lastAlert }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const data = await getActiveAlerts();
      setAlerts(Array.isArray(data) ? data : (data?.alerts || []));
    } catch (e) {
      console.error('Failed to fetch active alerts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Re-fetch when alert state changes via WebSocket
  useEffect(() => {
    if (lastAlert) {
      const timer = setTimeout(fetchAlerts, 500);
      return () => clearTimeout(timer);
    }
  }, [lastAlert]);

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="text-center py-6 text-gray-500 text-sm">Loading active alerts…</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <AlertTriangle size={16} className={cn(alerts.length > 0 ? 'text-red-400' : 'text-gray-500')} />
        <h2 className="text-sm font-semibold text-gray-200">
          Active Alerts
          {alerts.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold">
              {alerts.length}
            </span>
          )}
        </h2>
      </div>

      {alerts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-green-400 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          All systems operational
        </div>
      ) : (
        <div className="divide-y divide-gray-800">
          {alerts.map(alert => (
            <div key={alert.id} className="px-4 py-3 flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{alert.target_name || `Target ${alert.target_id}`}</p>
                <p className="text-xs text-gray-400 mt-0.5">{alert.message || alert.rule_name}</p>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                  <Clock size={11} />
                  <span>Active for: </span>
                  <span className="text-red-400 font-medium">
                    <LiveDuration startTime={alert.created_at} />
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
                  {alert.rule_name || 'alert'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
