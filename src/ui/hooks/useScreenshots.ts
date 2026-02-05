import { useState, useEffect, useCallback } from 'react';
import { FailedScreenshot } from '../../core/types';

interface UseScreenshotsResult {
  screenshots: FailedScreenshot[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useScreenshots(): UseScreenshotsResult {
  const [screenshots, setScreenshots] = useState<FailedScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScreenshots = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/failed-screenshots');
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      const data = await response.json();
      setScreenshots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load screenshots');
      setScreenshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScreenshots();
  }, [fetchScreenshots]);

  return {
    screenshots,
    loading,
    error,
    refresh: fetchScreenshots,
  };
}
