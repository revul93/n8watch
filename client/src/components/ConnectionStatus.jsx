import { useState, useEffect } from 'react';
import { wsManager } from '../lib/websocket';
import { cn } from '../lib/utils';

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(wsManager.connected);

  useEffect(() => {
    const remove = wsManager.onStatusChange(setConnected);
    return remove;
  }, []);

  return (
    <div className={cn('flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-full', connected ? 'text-green-400' : 'text-red-400')}>
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
        )}
      />
      {connected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
