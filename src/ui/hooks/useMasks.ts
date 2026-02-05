import { useState, useEffect, useCallback, useRef } from "react";
import { MaskRegion } from "../../core/types";

interface UseMasksResult {
  masks: MaskRegion[];
  loading: boolean;
  error: string | null;
  addMask: (
    mask: Omit<MaskRegion, "id" | "createdAt">,
  ) => Promise<MaskRegion | null>;
  updateMask: (
    maskId: string,
    updates: Partial<MaskRegion>,
  ) => Promise<boolean>;
  removeMask: (maskId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useMasks(screenshotName: string): UseMasksResult {
  const [masks, setMasks] = useState<MaskRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track pending saves to debounce rapid updates (like during drag/resize)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMasksRef = useRef<MaskRegion[] | null>(null);

  // Save masks to server
  const saveToServer = useCallback(
    async (masksToSave: MaskRegion[]) => {
      if (!screenshotName) return;

      try {
        const response = await fetch(
          `/api/masks/${encodeURIComponent(screenshotName)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ masks: masksToSave }),
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save masks");
      }
    },
    [screenshotName],
  );

  // Debounced save - waits for 300ms of inactivity before saving
  const debouncedSave = useCallback(
    (masksToSave: MaskRegion[]) => {
      pendingMasksRef.current = masksToSave;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        if (pendingMasksRef.current) {
          saveToServer(pendingMasksRef.current);
          pendingMasksRef.current = null;
        }
      }, 300);
    },
    [saveToServer],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Save any pending changes before unmount
        if (pendingMasksRef.current) {
          saveToServer(pendingMasksRef.current);
        }
      }
    };
  }, [saveToServer]);

  // Fetch masks when screenshot changes
  const fetchMasks = useCallback(async () => {
    if (!screenshotName) {
      setMasks([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/masks/${encodeURIComponent(screenshotName)}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      const data = await response.json();
      setMasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load masks");
      setMasks([]);
    } finally {
      setLoading(false);
    }
  }, [screenshotName]);

  useEffect(() => {
    fetchMasks();
  }, [fetchMasks]);

  // Add a new mask
  const addMask = useCallback(
    async (
      maskData: Omit<MaskRegion, "id" | "createdAt">,
    ): Promise<MaskRegion | null> => {
      if (!screenshotName) return null;

      try {
        const response = await fetch(
          `/api/masks/${encodeURIComponent(screenshotName)}/add`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(maskData),
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const newMask = await response.json();
        setMasks((prev) => [...prev, newMask]);
        return newMask;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add mask");
        return null;
      }
    },
    [screenshotName],
  );

  // Update an existing mask (with debounced auto-save)
  const updateMask = useCallback(
    async (maskId: string, updates: Partial<MaskRegion>): Promise<boolean> => {
      setMasks((prev) => {
        const newMasks = prev.map((mask) =>
          mask.id === maskId ? { ...mask, ...updates } : mask,
        );
        // Trigger debounced save with the new masks
        debouncedSave(newMasks);
        return newMasks;
      });
      return true;
    },
    [debouncedSave],
  );

  // Remove a mask
  const removeMask = useCallback(
    async (maskId: string): Promise<boolean> => {
      if (!screenshotName) return false;

      try {
        const response = await fetch(
          `/api/masks/${encodeURIComponent(screenshotName)}/${maskId}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        setMasks((prev) => prev.filter((m) => m.id !== maskId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove mask");
        return false;
      }
    },
    [screenshotName],
  );

  return {
    masks,
    loading,
    error,
    addMask,
    updateMask,
    removeMask,
    refresh: fetchMasks,
  };
}
