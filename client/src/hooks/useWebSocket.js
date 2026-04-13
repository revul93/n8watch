import { useState, useEffect, useCallback } from 'react';
import { wsManager } from '../lib/websocket';

export function useWebSocket() {
  const [connected, setConnected] = useState(wsManager.connected);
  const [lastPingResults, setLastPingResults] = useState({});
  const [lastAlert, setLastAlert] = useState(null);
  const [configReloadedAt, setConfigReloadedAt] = useState(null);
  const [lastConfigData, setLastConfigData] = useState(null);
  const [targetsChangedAt, setTargetsChangedAt] = useState(null);

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

    const onConfigReloaded = (data) => {
      setConfigReloadedAt(Date.now());
      setLastConfigData(data);
    };

    const onTargetsChanged = () => {
      setTargetsChangedAt(Date.now());
    };

    wsManager.on('ping_result', onPingResult);
    wsManager.on('alert', onAlertTriggered);
    wsManager.on('recovery', onAlertResolved);
    wsManager.on('config_reloaded', onConfigReloaded);
    wsManager.on('targets_changed', onTargetsChanged);

    return () => {
      removeStatus();
      wsManager.off('ping_result', onPingResult);
      wsManager.off('alert', onAlertTriggered);
      wsManager.off('recovery', onAlertResolved);
      wsManager.off('config_reloaded', onConfigReloaded);
      wsManager.off('targets_changed', onTargetsChanged);
    };
  }, []);

  const clearLastAlert = useCallback(() => setLastAlert(null), []);

  return { connected, lastPingResults, lastAlert, clearLastAlert, configReloadedAt, lastConfigData, targetsChangedAt };
}
