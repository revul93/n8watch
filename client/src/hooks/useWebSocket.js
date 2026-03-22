import { useState, useEffect, useCallback } from 'react';
import { wsManager } from '../lib/websocket';

export function useWebSocket() {
  const [connected, setConnected] = useState(wsManager.connected);
  const [lastPingResults, setLastPingResults] = useState({});
  const [lastAlert, setLastAlert] = useState(null);

  useEffect(() => {
    wsManager.connect();

    const removeStatus = wsManager.onStatusChange(setConnected);

    const onPingResult = (data) => {
      if (!data) return;
      const targetId = data.target_id;
      if (!targetId) return;
      setLastPingResults(prev => ({ ...prev, [targetId]: data }));
    };

    const onAlertTriggered = (data) => {
      setLastAlert({ type: 'triggered', ...data, _ts: Date.now() });
    };

    const onAlertResolved = (data) => {
      setLastAlert({ type: 'resolved', ...data, _ts: Date.now() });
    };

    wsManager.on('ping_result', onPingResult);
    wsManager.on('alert', onAlertTriggered);
    wsManager.on('recovery', onAlertResolved);

    return () => {
      removeStatus();
      wsManager.off('ping_result', onPingResult);
      wsManager.off('alert', onAlertTriggered);
      wsManager.off('recovery', onAlertResolved);
    };
  }, []);

  const clearLastAlert = useCallback(() => setLastAlert(null), []);

  return { connected, lastPingResults, lastAlert, clearLastAlert };
}
