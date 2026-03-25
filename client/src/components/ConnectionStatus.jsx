import { useState, useEffect, useMemo } from 'react';
import { wsManager } from '../lib/websocket';
import { getSystemStatus } from '../lib/api';
import { cn } from '../lib/utils';

function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(wsManager.connected);
  const [now, setNow] = useState(new Date());
  const [serverStartedAt, setServerStartedAt] = useState(null);

  useEffect(() => {
    const remove = wsManager.onStatusChange(setConnected);
    return remove;
  }, []);

  // Live clock — updates every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch server start time once
  useEffect(() => {
    getSystemStatus()
      .then(data => setServerStartedAt(data.started_at ?? null))
      .catch(() => {});
  }, []);

  const serverUptimeSec = serverStartedAt
    ? Math.floor((now.getTime() - serverStartedAt) / 1000)
    : null;

  const dateStr = useMemo(
    () => now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    // Recompute only when the date portion changes (minute precision is sufficient)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now.toDateString()]
  );
  const timeStr = useMemo(
    () => now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [now]
  );

  return (
    <div className="flex items-center gap-3 text-xs">
      {/* Datetime */}
      <div className="hidden sm:flex flex-col items-end text-gray-400 leading-tight">
        <span className="font-medium">{timeStr}</span>
        <span>{dateStr}</span>
      </div>

      {/* System uptime */}
      {serverUptimeSec !== null && (
        <div className="hidden md:flex flex-col items-end text-gray-400 leading-tight">
          <span className="text-gray-500">Uptime</span>
          <span className="font-medium text-gray-300">{formatUptime(serverUptimeSec)}</span>
        </div>
      )}

      {/* Connection status */}
      <div className={cn('flex items-center gap-2 font-medium px-2 py-1 rounded-full', connected ? 'text-green-400' : 'text-red-400')}>
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          )}
        />
        {connected ? 'Connected' : 'Disconnected'}
      </div>
    </div>
  );
}
