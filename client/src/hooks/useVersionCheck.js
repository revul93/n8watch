import { useEffect, useRef } from 'react';
import { getVersion } from '../lib/api';

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls /api/version every 30 seconds.
 * When the version value changes from the one captured on first load,
 * the page is reloaded so the user gets the latest UI after an update.
 */
export function useVersionCheck() {
  const initialVersionRef = useRef(null);

  useEffect(() => {
    let timerId;

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
          window.location.reload();
        }
      } catch {
        // ignore transient network errors and keep polling
      } finally {
        timerId = setTimeout(check, POLL_INTERVAL_MS);
      }
    }

    check();
    return () => clearTimeout(timerId);
  }, []);
}
