import React, { useState, useEffect, useCallback } from 'react';
import { ScreenshotList } from './components/ScreenshotList';
import { ImageEditor } from './components/ImageEditor';
import { MaskPanel } from './components/MaskPanel';
import { SettingsModal } from './components/SettingsModal';
import { useScreenshots } from './hooks/useScreenshots';
import { useMasks } from './hooks/useMasks';
import { FailedScreenshot, MaskRegion } from '../core/types';

type ViewMode = 'side-by-side' | 'diff' | 'overlay';

const DEFAULT_MASK_COLOR = '#8bb410';

export function App() {
  const { screenshots, loading, error, refresh } = useScreenshots();
  const [selectedScreenshot, setSelectedScreenshot] = useState<FailedScreenshot | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [hoveredMaskId, setHoveredMaskId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    // Load theme from localStorage, default to 'dark'
    const savedTheme = localStorage.getItem('stagemask-theme');
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  const [maskColor, setMaskColor] = useState<string>(() => {
    // Load mask color from localStorage, default to highlight color
    return localStorage.getItem('stagemask-color') || DEFAULT_MASK_COLOR;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const screenshotName = selectedScreenshot?.screenshotName || '';
  const { masks, addMask, updateMask, removeMask } = useMasks(screenshotName);

  // Apply theme to document and persist to localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('stagemask-theme', theme);
  }, [theme]);

  // Apply mask color as CSS variable and persist to localStorage
  useEffect(() => {
    document.documentElement.style.setProperty('--mask-color-custom', maskColor);
    // Convert hex to rgba for fill
    const r = parseInt(maskColor.slice(1, 3), 16);
    const g = parseInt(maskColor.slice(3, 5), 16);
    const b = parseInt(maskColor.slice(5, 7), 16);
    document.documentElement.style.setProperty(
      '--mask-fill-custom',
      `rgba(${r}, ${g}, ${b}, 0.25)`,
    );
    document.documentElement.style.setProperty(
      '--mask-fill-hover-custom',
      `rgba(${r}, ${g}, ${b}, 0.35)`,
    );
    document.documentElement.style.setProperty(
      '--mask-fill-active-custom',
      `rgba(${r}, ${g}, ${b}, 0.45)`,
    );
    localStorage.setItem('stagemask-color', maskColor);
  }, [maskColor]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleSaveSettings = useCallback((settings: { maskColor: string }) => {
    setMaskColor(settings.maskColor);
  }, []);

  // Auto-select first screenshot
  useEffect(() => {
    if (screenshots.length > 0 && !selectedScreenshot) {
      setSelectedScreenshot(screenshots[0]);
    }
  }, [screenshots, selectedScreenshot]);

  // Reset mask selection when screenshot changes
  useEffect(() => {
    setSelectedMaskId(null);
    setHoveredMaskId(null);
  }, [selectedScreenshot]);

  const handleAddMask = useCallback(
    async (rect: { x: number; y: number; width: number; height: number }) => {
      if (!selectedScreenshot) return;

      await addMask({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        isPercentage: false,
      });
    },
    [selectedScreenshot, addMask],
  );

  const handleUpdateMask = useCallback(
    async (maskId: string, updates: Partial<MaskRegion>) => {
      await updateMask(maskId, updates);
    },
    [updateMask],
  );

  const handleRemoveMask = useCallback(
    async (maskId: string) => {
      await removeMask(maskId);
      // Clear selection if removed mask was selected
      if (selectedMaskId === maskId) {
        setSelectedMaskId(null);
      }
    },
    [removeMask, selectedMaskId],
  );

  const handleSelectMask = useCallback((maskId: string | null) => {
    setSelectedMaskId(maskId);
  }, []);

  const handleHoverMask = useCallback((maskId: string | null) => {
    setHoveredMaskId(maskId);
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <svg viewBox="0 0 800 800" className="header-logo" aria-label="StageMask logo">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="50"
              strokeMiterlimit="133.3333"
              d="M342.3,694.1c17.7,15.1,26.6,22.7,60.8,32.3c34.3,9.6,45.6,7.7,68.1,3.8c74-12.6,184.1-53.2,217.2-182.4
              l28.2-109.9c14.7-57.3,22-85.9,12.3-108.4c-3.3-7.5-7.8-14.4-13.4-20.3c-16.6-17.5-44.9-20.5-101.3-26.6
              c-41.8-4.5-62.7-6.7-83.1-11.7c-7.1-1.7-14.1-3.7-21.1-5.9c-20-6.4-39.2-15.3-77.5-33.3c-51.8-24.3-77.7-36.4-100.5-29.9
              c-7.6,2.2-14.8,5.7-21.3,10.6c-19.2,14.4-26.5,43.1-41.2,100.3l-28.2,109.9C208.3,551.8,284.2,644.5,342.3,694.1z"
            />
            <path
              opacity="0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="50"
              strokeMiterlimit="133.3333"
              d="M553.8,270.3l-23.3-91c-14.7-57.3-22-85.9-41.2-100.3c-6.4-4.8-13.6-8.4-21.3-10.6
              c-22.8-6.5-48.7,5.7-100.5,29.9c-38.4,18-57.5,26.9-77.6,33.3c-7,2.2-14,4.2-21.1,5.9c-20.4,5-41.3,7.2-83.1,11.7
              c-56.5,6.1-84.7,9.1-101.3,26.6c-5.6,5.9-10.1,12.7-13.4,20.3c-9.7,22.5-2.4,51.1,12.3,108.4l28.2,109.9C134,502.1,192,549,250,574"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="50"
              strokeLinecap="round"
              strokeMiterlimit="133.3333"
              d="M528.1,417.3c12.1-16.9,34.6-25.2,56.9-19.3c22.3,6,37.7,24.5,39.7,45.1"
            />
            <path
              opacity="0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="50"
              strokeLinecap="round"
              strokeMiterlimit="133.3333"
              d="M257.3,272c-12.1-16.9-34.6-25.2-56.9-19.3c-22.3,6-37.7,24.5-39.7,45.1"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="50"
              strokeLinecap="round"
              strokeMiterlimit="133.3333"
              d="M334.9,365.5c12.1-16.9,34.6-25.2,56.9-19.3c22.3,6,37.7,24.5,39.7,45.1"
            />
            <path
              opacity="0.5"
              fill="currentColor"
              stroke="currentColor"
              strokeMiterlimit="10"
              d="M470.8,205.7c8,11.2,5.4,26.8-5.8,34.9c-11.2,8-26.9,5.4-34.9-5.8L470.8,205.7z M387.1,176.8
              c32-8.6,65.4,3.2,83.7,28.9l-40.7,29.1c-5.8-8.1-17.5-13-30.1-9.6L387.1,176.8z M344.6,204.9c10.3-13.3,25-23.4,42.5-28.1l12.9,48.3
              c-6.8,1.8-12.3,5.7-15.9,10.4L344.6,204.9z"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="50"
              strokeLinecap="round"
              strokeMiterlimit="133.3333"
              d="M530.2,586.6c0,0-16.9-39-76.5-55c-59.6-16-93.7,9.4-93.7,9.4"
            />
          </svg>
          StageMask
        </div>
        <div className="toolbar-group">
          <button className="btn btn-secondary" onClick={refresh}>
            ↻ Refresh
          </button>
          <button
            className="btn btn-secondary btn-icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="main-content">
        {/* Sidebar with screenshot list */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2 className="sidebar-title">Failed Screenshots</h2>
          </div>
          <div className="sidebar-content">
            {loading ? (
              <div className="empty-state">
                <div className="empty-state-text">Loading...</div>
              </div>
            ) : error ? (
              <div className="empty-state">
                <div
                  className="empty-state-text"
                  style={{ color: 'var(--accent-error)' }}
                >
                  {error}
                </div>
              </div>
            ) : (
              <ScreenshotList
                screenshots={screenshots}
                selected={selectedScreenshot}
                onSelect={setSelectedScreenshot}
              />
            )}
          </div>
        </aside>

        {/* Editor area */}
        <main className="editor">
          {selectedScreenshot ? (
            <>
              {/* Toolbar */}
              <div className="editor-toolbar">
                <div className="view-toggle">
                  <button
                    className={`view-toggle-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
                    onClick={() => setViewMode('side-by-side')}
                  >
                    Side by Side
                  </button>
                  <button
                    className={`view-toggle-btn ${viewMode === 'diff' ? 'active' : ''}`}
                    onClick={() => setViewMode('diff')}
                  >
                    Diff
                  </button>
                  <button
                    className={`view-toggle-btn ${viewMode === 'overlay' ? 'active' : ''}`}
                    onClick={() => setViewMode('overlay')}
                  >
                    Overlay
                  </button>
                </div>

                <div style={{ flex: 1 }} />

                <div className="toolbar-group">
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {selectedScreenshot.screenshotName}
                  </span>
                </div>
              </div>

              {/* Canvas area */}
              <div className="canvas-container">
                <ImageEditor
                  screenshot={selectedScreenshot}
                  masks={masks}
                  viewMode={viewMode}
                  selectedMaskId={selectedMaskId}
                  hoveredMaskId={hoveredMaskId}
                  onAddMask={handleAddMask}
                  onUpdateMask={handleUpdateMask}
                  onRemoveMask={handleRemoveMask}
                  onSelectMask={handleSelectMask}
                  onHoverMask={handleHoverMask}
                />
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📸</div>
              <h2 className="empty-state-title">No Screenshot Selected</h2>
              <p className="empty-state-text">
                {screenshots.length === 0
                  ? 'No failed screenshot tests found. Run your Playwright tests first.'
                  : 'Select a failed screenshot from the list to start adding masks.'}
              </p>
            </div>
          )}
        </main>

        {/* Mask panel */}
        {selectedScreenshot && (
          <MaskPanel
            masks={masks}
            selectedMaskId={selectedMaskId}
            hoveredMaskId={hoveredMaskId}
            onUpdate={handleUpdateMask}
            onRemove={handleRemoveMask}
            onSelect={handleSelectMask}
            onHover={handleHoverMask}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <div className="status-item">
          <span
            className={`status-dot ${screenshots.length > 0 ? 'error' : 'success'}`}
          />
          {screenshots.length} failed screenshot{screenshots.length !== 1 ? 's' : ''}
        </div>
        <div className="status-item">
          {masks.length} mask{masks.length !== 1 ? 's' : ''} configured
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        maskColor={maskColor}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
