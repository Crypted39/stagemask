import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FailedScreenshot, MaskRegion } from '../../core/types';

interface ImageEditorProps {
  screenshot: FailedScreenshot;
  masks: MaskRegion[];
  viewMode: 'side-by-side' | 'diff' | 'overlay';
  selectedMaskId: string | null;
  hoveredMaskId: string | null;
  onAddMask: (rect: { x: number; y: number; width: number; height: number }) => void;
  onUpdateMask: (maskId: string, updates: Partial<MaskRegion>) => void;
  onRemoveMask: (maskId: string) => void;
  onSelectMask: (maskId: string | null) => void;
  onHoverMask: (maskId: string | null) => void;
}

interface DrawingRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export function ImageEditor({
  screenshot,
  masks,
  viewMode,
  selectedMaskId,
  hoveredMaskId,
  onAddMask,
  onUpdateMask,
  onRemoveMask,
  onSelectMask,
  onHoverMask,
}: ImageEditorProps) {
  // Core transform state - single source of truth for pan/zoom (shared across all panels)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });

  // Interaction states
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [panStartPoint, setPanStartPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [panStartTransform, setPanStartTransform] = useState<Transform | null>(null);

  // Drawing/editing states
  const [drawing, setDrawing] = useState<DrawingRect | null>(null);
  const [dragging, setDragging] = useState<{
    maskId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [resizing, setResizing] = useState<{ maskId: string; handle: string } | null>(
    null,
  );

  // Image dimensions
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Refs - we use the active container ref for the panel being interacted with
  const activeContainerRef = useRef<HTMLDivElement | null>(null);
  const baselineContainerRef = useRef<HTMLDivElement>(null);
  const actualContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Build image URLs
  const baselineUrl = `/api/image?path=${encodeURIComponent(screenshot.baselinePath)}`;
  const actualUrl = `/api/image?path=${encodeURIComponent(screenshot.actualPath)}`;
  const diffUrl = screenshot.diffPath
    ? `/api/image?path=${encodeURIComponent(screenshot.diffPath)}`
    : null;

  // Reset transform when screenshot changes
  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
    setImageDimensions({ width: 0, height: 0 });
    setImageLoaded(false);
    onSelectMask(null);
    setDrawing(null);
    setDragging(null);
    setResizing(null);
  }, [screenshot.screenshotName, onSelectMask]);

  // Get the first available container for initial fit calculation
  const getActiveContainer = useCallback((): HTMLDivElement | null => {
    return actualContainerRef.current || baselineContainerRef.current;
  }, []);

  // Recenter image when view mode changes
  useEffect(() => {
    if (!imageLoaded || imageDimensions.width === 0) return;

    // Small delay to allow the container to resize after view mode change
    const timer = setTimeout(() => {
      const container = getActiveContainer();
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const padding = 48;
        const availableWidth = containerRect.width - padding;
        const availableHeight = containerRect.height - padding;

        const scaleX = availableWidth / imageDimensions.width;
        const scaleY = availableHeight / imageDimensions.height;
        const fitScale = Math.min(scaleX, scaleY, 1);

        const scaledWidth = imageDimensions.width * fitScale;
        const scaledHeight = imageDimensions.height * fitScale;
        const x = (containerRect.width - scaledWidth) / 2;
        const y = (containerRect.height - scaledHeight) / 2;

        setTransform({ x, y, scale: fitScale });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [viewMode, imageLoaded, imageDimensions, getActiveContainer]);

  // Fit image to container on load
  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;

      // Only fit on first load
      if (imageLoaded) return;

      setImageDimensions({ width: naturalWidth, height: naturalHeight });
      setImageLoaded(true);

      const container = getActiveContainer();
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const padding = 48;
        const availableWidth = containerRect.width - padding;
        const availableHeight = containerRect.height - padding;

        const scaleX = availableWidth / naturalWidth;
        const scaleY = availableHeight / naturalHeight;
        const fitScale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

        // Center the image
        const scaledWidth = naturalWidth * fitScale;
        const scaledHeight = naturalHeight * fitScale;
        const x = (containerRect.width - scaledWidth) / 2;
        const y = (containerRect.height - scaledHeight) / 2;

        setTransform({ x, y, scale: fitScale });
      }
    },
    [imageLoaded, getActiveContainer],
  );

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback(
    (
      screenX: number,
      screenY: number,
      container: HTMLDivElement | null,
    ): { x: number; y: number } | null => {
      if (!container) return null;

      const containerRect = container.getBoundingClientRect();
      const relativeX = screenX - containerRect.left;
      const relativeY = screenY - containerRect.top;

      // Convert from screen space to image space
      const imageX = (relativeX - transform.x) / transform.scale;
      const imageY = (relativeY - transform.y) / transform.scale;

      return { x: imageX, y: imageY };
    },
    [transform],
  );

  // Zoom with mouse wheel, centered on cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent, container: HTMLDivElement | null) => {
      e.preventDefault();

      if (!container) return;

      const delta = -e.deltaY * 0.001;
      const newScale = Math.max(0.1, Math.min(5, transform.scale * (1 + delta)));

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      // Calculate the point under the cursor in image space before zoom
      const imageX = (mouseX - transform.x) / transform.scale;
      const imageY = (mouseY - transform.y) / transform.scale;

      // Calculate new position to keep the same point under cursor
      const newX = mouseX - imageX * newScale;
      const newY = mouseY - imageY * newScale;

      setTransform({ x: newX, y: newY, scale: newScale });
    },
    [transform],
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, container: HTMLDivElement | null) => {
      if (e.button !== 0) return;

      // Prevent image/text selection during drawing
      e.preventDefault();

      // Store the active container for subsequent moves
      activeContainerRef.current = container;

      const imagePos = screenToImage(e.clientX, e.clientY, container);
      if (!imagePos) return;

      // Panning mode (space pressed)
      if (isSpacePressed) {
        setIsPanning(true);
        setPanStartPoint({ x: e.clientX, y: e.clientY });
        setPanStartTransform({ ...transform });
        return;
      }

      // Check if clicking on a mask
      const clickedMask = masks.find((mask) => {
        return (
          imagePos.x >= mask.x &&
          imagePos.x <= mask.x + mask.width &&
          imagePos.y >= mask.y &&
          imagePos.y <= mask.y + mask.height
        );
      });

      if (clickedMask) {
        onSelectMask(clickedMask.id);
        setDragging({
          maskId: clickedMask.id,
          offsetX: imagePos.x - clickedMask.x,
          offsetY: imagePos.y - clickedMask.y,
        });
      } else {
        // Start drawing new mask
        onSelectMask(null);
        setDrawing({
          startX: imagePos.x,
          startY: imagePos.y,
          endX: imagePos.x,
          endY: imagePos.y,
        });
      }
    },
    [screenToImage, isSpacePressed, transform, masks, onSelectMask],
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Panning
      if (isPanning && panStartPoint && panStartTransform) {
        const dx = e.clientX - panStartPoint.x;
        const dy = e.clientY - panStartPoint.y;

        setTransform({
          ...panStartTransform,
          x: panStartTransform.x + dx,
          y: panStartTransform.y + dy,
        });
        return;
      }

      // Skip if in pan mode but not actively panning
      if (isSpacePressed) return;

      const container = activeContainerRef.current;
      const imagePos = screenToImage(e.clientX, e.clientY, container);
      if (!imagePos) return;

      // Drawing new mask
      if (drawing) {
        setDrawing((prev) =>
          prev ? { ...prev, endX: imagePos.x, endY: imagePos.y } : null,
        );
        return;
      }

      // Dragging existing mask
      if (dragging) {
        const mask = masks.find((m) => m.id === dragging.maskId);
        if (mask) {
          const newX = Math.max(
            0,
            Math.min(imageDimensions.width - mask.width, imagePos.x - dragging.offsetX),
          );
          const newY = Math.max(
            0,
            Math.min(imageDimensions.height - mask.height, imagePos.y - dragging.offsetY),
          );
          onUpdateMask(dragging.maskId, { x: newX, y: newY });
        }
        return;
      }

      // Resizing mask
      if (resizing) {
        const mask = masks.find((m) => m.id === resizing.maskId);
        if (mask) {
          const updates = calculateResize(mask, resizing.handle, imagePos);
          onUpdateMask(resizing.maskId, updates);
        }
        return;
      }
    },
    [
      isPanning,
      panStartPoint,
      panStartTransform,
      isSpacePressed,
      screenToImage,
      drawing,
      dragging,
      resizing,
      masks,
      imageDimensions,
      onUpdateMask,
    ],
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    // End panning
    if (isPanning) {
      setIsPanning(false);
      setPanStartPoint(null);
      setPanStartTransform(null);
      activeContainerRef.current = null;
      return;
    }

    // Finish drawing
    if (drawing) {
      const rect = normalizeRect(drawing);
      if (rect.width > 5 && rect.height > 5) {
        onAddMask(rect);
      }
      setDrawing(null);
    }

    setDragging(null);
    setResizing(null);
    activeContainerRef.current = null;
  }, [isPanning, drawing, onAddMask]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    // Only reset panning state if we leave the container
    // Don't clear drawing/dragging as user might re-enter
    if (isPanning) {
      setIsPanning(false);
      setPanStartPoint(null);
      setPanStartTransform(null);
    }
  }, [isPanning]);

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, maskId: string, handle: string) => {
      e.stopPropagation();
      e.preventDefault();
      // Set the active container from the event target's closest canvas-wrapper
      const wrapper = (e.target as HTMLElement).closest(
        '.canvas-wrapper',
      ) as HTMLDivElement | null;
      activeContainerRef.current = wrapper;
      onSelectMask(maskId);
      setResizing({ maskId, handle });
    },
    [onSelectMask],
  );

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === 'Escape') {
        setDrawing(null);
        setDragging(null);
        setResizing(null);
        onSelectMask(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMaskId) {
        e.preventDefault();
        onRemoveMask(selectedMaskId);
        onSelectMask(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(false);
        setIsPanning(false);
        setPanStartPoint(null);
        setPanStartTransform(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedMaskId, onRemoveMask, onSelectMask]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setTransform((prev) => {
      const newScale = Math.min(5, prev.scale + 0.25);
      // Zoom toward center of container
      const container = getActiveContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const imageX = (centerX - prev.x) / prev.scale;
        const imageY = (centerY - prev.y) / prev.scale;

        return {
          x: centerX - imageX * newScale,
          y: centerY - imageY * newScale,
          scale: newScale,
        };
      }
      return { ...prev, scale: newScale };
    });
  }, [getActiveContainer]);

  const zoomOut = useCallback(() => {
    setTransform((prev) => {
      const newScale = Math.max(0.1, prev.scale - 0.25);
      const container = getActiveContainer();
      if (container) {
        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const imageX = (centerX - prev.x) / prev.scale;
        const imageY = (centerY - prev.y) / prev.scale;

        return {
          x: centerX - imageX * newScale,
          y: centerY - imageY * newScale,
          scale: newScale,
        };
      }
      return { ...prev, scale: newScale };
    });
  }, [getActiveContainer]);

  const resetZoom = useCallback(() => {
    const container = getActiveContainer();
    if (container && imageDimensions.width > 0) {
      const containerRect = container.getBoundingClientRect();
      const padding = 48;
      const availableWidth = containerRect.width - padding;
      const availableHeight = containerRect.height - padding;

      const scaleX = availableWidth / imageDimensions.width;
      const scaleY = availableHeight / imageDimensions.height;
      const fitScale = Math.min(scaleX, scaleY, 1);

      const scaledWidth = imageDimensions.width * fitScale;
      const scaledHeight = imageDimensions.height * fitScale;
      const x = (containerRect.width - scaledWidth) / 2;
      const y = (containerRect.height - scaledHeight) / 2;

      setTransform({ x, y, scale: fitScale });
    }
  }, [imageDimensions, getActiveContainer]);

  // Helper functions
  const normalizeRect = (rect: DrawingRect) => {
    const x = Math.min(rect.startX, rect.endX);
    const y = Math.min(rect.startY, rect.endY);
    const width = Math.abs(rect.endX - rect.startX);
    const height = Math.abs(rect.endY - rect.startY);
    return { x, y, width, height };
  };

  const calculateResize = (
    mask: MaskRegion,
    handle: string,
    pos: { x: number; y: number },
  ): Partial<MaskRegion> => {
    const updates: Partial<MaskRegion> = {};
    const minSize = 10;

    switch (handle) {
      case 'nw':
        updates.x = Math.min(pos.x, mask.x + mask.width - minSize);
        updates.y = Math.min(pos.y, mask.y + mask.height - minSize);
        updates.width = mask.x + mask.width - updates.x;
        updates.height = mask.y + mask.height - updates.y;
        break;
      case 'ne':
        updates.y = Math.min(pos.y, mask.y + mask.height - minSize);
        updates.width = Math.max(minSize, pos.x - mask.x);
        updates.height = mask.y + mask.height - updates.y;
        break;
      case 'sw':
        updates.x = Math.min(pos.x, mask.x + mask.width - minSize);
        updates.width = mask.x + mask.width - updates.x;
        updates.height = Math.max(minSize, pos.y - mask.y);
        break;
      case 'se':
        updates.width = Math.max(minSize, pos.x - mask.x);
        updates.height = Math.max(minSize, pos.y - mask.y);
        break;
    }

    return updates;
  };

  const getCursorStyle = (): React.CSSProperties['cursor'] => {
    if (isPanning) return 'grabbing';
    if (isSpacePressed) return 'grab';
    return 'crosshair';
  };

  // Render masks overlay
  const renderMasks = (showHandles: boolean = true) => {
    return (
      <div
        className="mask-overlay"
        style={{ pointerEvents: isSpacePressed ? 'none' : 'auto' }}
      >
        {masks.map((mask, index) => {
          const isSelected = selectedMaskId === mask.id;
          const isHovered = hoveredMaskId === mask.id;

          return (
            <div
              key={mask.id}
              className={`mask-rect ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
              style={{
                left: mask.x * transform.scale,
                top: mask.y * transform.scale,
                width: mask.width * transform.scale,
                height: mask.height * transform.scale,
                cursor: isSpacePressed ? 'inherit' : 'move',
                pointerEvents: isSpacePressed ? 'none' : 'auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isSpacePressed) onSelectMask(mask.id);
              }}
              onMouseEnter={() => !isSpacePressed && onHoverMask(mask.id)}
              onMouseLeave={() => !isSpacePressed && onHoverMask(null)}
            >
              {/* Number badge - hide when selected */}
              {!isSelected && (
                <div
                  className="mask-number"
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '-10px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    background: 'var(--mask-color-custom, var(--accent-error))',
                    color: 'white',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }}
                >
                  {index + 1}
                </div>
              )}

              {showHandles && !isSpacePressed && isSelected && (
                <>
                  <div
                    className="mask-handle nw"
                    onMouseDown={(e) => handleResizeStart(e, mask.id, 'nw')}
                  />
                  <div
                    className="mask-handle ne"
                    onMouseDown={(e) => handleResizeStart(e, mask.id, 'ne')}
                  />
                  <div
                    className="mask-handle sw"
                    onMouseDown={(e) => handleResizeStart(e, mask.id, 'sw')}
                  />
                  <div
                    className="mask-handle se"
                    onMouseDown={(e) => handleResizeStart(e, mask.id, 'se')}
                  />
                  <button
                    className="mask-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMask(mask.id);
                    }}
                    tabIndex={-1}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}

        {drawing && (
          <div
            className="mask-rect drawing"
            style={{
              left: Math.min(drawing.startX, drawing.endX) * transform.scale,
              top: Math.min(drawing.startY, drawing.endY) * transform.scale,
              width: Math.abs(drawing.endX - drawing.startX) * transform.scale,
              height: Math.abs(drawing.endY - drawing.startY) * transform.scale,
              opacity: 0.7,
            }}
          />
        )}
      </div>
    );
  };

  // Render a single image canvas
  const renderImageCanvas = (
    imgSrc: string,
    imgRef: React.RefObject<HTMLImageElement | null> | null,
    containerRefProp: React.RefObject<HTMLDivElement | null>,
    showMasks: boolean,
    alt: string,
    overlayContent?: React.ReactNode,
  ) => {
    return (
      <div
        className="canvas-wrapper"
        ref={containerRefProp}
        onMouseDown={(e) => handleMouseDown(e, containerRefProp.current)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={(e) => handleWheel(e, containerRefProp.current)}
        style={{ cursor: getCursorStyle() }}
      >
        <div
          className="image-canvas"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px)`,
            transformOrigin: '0 0',
          }}
        >
          <img
            ref={imgRef}
            src={imgSrc}
            alt={alt}
            onLoad={handleImageLoad}
            style={{
              transform: `scale(${transform.scale})`,
              transformOrigin: '0 0',
            }}
            draggable={false}
          />
          {overlayContent}
          {showMasks && renderMasks(true)}
        </div>
      </div>
    );
  };

  return (
    <div className="editor-container">
      {viewMode === 'side-by-side' && (
        <>
          <div className="canvas-panel">
            <div className="canvas-panel-header">Expected (Baseline)</div>
            {renderImageCanvas(
              baselineUrl,
              null,
              baselineContainerRef,
              false,
              'Expected',
            )}
          </div>
          <div className="canvas-panel">
            <div className="canvas-panel-header">Actual</div>
            {renderImageCanvas(actualUrl, imageRef, actualContainerRef, true, 'Actual')}
          </div>
        </>
      )}

      {viewMode === 'diff' && diffUrl && (
        <div className="canvas-panel" style={{ flex: 1 }}>
          <div className="canvas-panel-header">Diff</div>
          {renderImageCanvas(diffUrl, imageRef, actualContainerRef, true, 'Diff')}
        </div>
      )}

      {viewMode === 'overlay' && (
        <div className="canvas-panel" style={{ flex: 1 }}>
          <div className="canvas-panel-header">Overlay (Expected / Actual)</div>
          {renderImageCanvas(
            baselineUrl,
            imageRef,
            actualContainerRef,
            true,
            'Expected',
            <img
              src={actualUrl}
              alt="Actual"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                opacity: 0.5,
                mixBlendMode: 'difference',
                transform: `scale(${transform.scale})`,
                transformOrigin: '0 0',
              }}
              draggable={false}
            />,
          )}
        </div>
      )}

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="btn btn-secondary btn-icon" onClick={zoomOut} tabIndex={-1}>
          −
        </button>
        <span className="zoom-level">{Math.round(transform.scale * 100)}%</span>
        <button className="btn btn-secondary btn-icon" onClick={zoomIn} tabIndex={-1}>
          +
        </button>
        <button
          className="btn btn-secondary btn-icon"
          onClick={resetZoom}
          title="Fit to view"
          tabIndex={-1}
        >
          ⟲
        </button>
      </div>

      {/* Instructions */}
      <div className="instructions">
        Draw to mask • <kbd>Del</kbd> delete • <kbd>Esc</kbd> cancel • <kbd>Space</kbd>
        +drag to pan • Scroll to zoom
      </div>
    </div>
  );
}
