import { useEffect, useRef, useState } from 'react';
import { getVersion } from '../lib/api';

const POLL_INTERVAL_MS = 30_000;
const RELOAD_DELAY_MS = 5_000;

/**
 * Polls /api/version every 30 seconds.
 * When the version value changes from the one captured on first load,
 * sets updateAvailable to true and reloads the page after a short delay
 * so the user has time to see the notification.
 */
export function useVersionCheck() {
  const initialVersionRef = useRef(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let pollTimer;
    let reloadTimer;

    async function check() {
      try {
        const data = await getVersion();
        const current = data?.version;
        if (!current) return;

        if (initialVersionRef.current === null) {
          initialVersionRef.current = current;
          return;
        }

        if (initialVersionRef.current !== current) {
          setUpdateAvailable(true);
          reloadTimer = setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
          return; // stop polling — reload is imminent
        }
      } catch {
        // ignore transient network errors and keep polling
      }
      pollTimer = setTimeout(check, POLL_INTERVAL_MS);
    }

    check();
    return () => {
      clearTimeout(pollTimer);
      clearTimeout(reloadTimer);
    };
  }, []);

  return { updateAvailable };
}
