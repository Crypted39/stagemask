import { useState } from 'react';
import { MaskRegion } from '../../core/types';

interface MaskPanelProps {
  masks: MaskRegion[];
  selectedMaskId: string | null;
  hoveredMaskId: string | null;
  onUpdate: (maskId: string, updates: Partial<MaskRegion>) => void;
  onRemove: (maskId: string) => void;
  onSelect: (maskId: string | null) => void;
  onHover: (maskId: string | null) => void;
}

export function MaskPanel({ 
  masks, 
  selectedMaskId,
  hoveredMaskId,
  onUpdate, 
  onRemove,
  onSelect,
  onHover,
}: MaskPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingReason, setEditingReason] = useState('');

  const handleStartEdit = (mask: MaskRegion) => {
    setEditingId(mask.id);
    setEditingReason(mask.reason || '');
  };

  const handleSaveReason = (maskId: string) => {
    onUpdate(maskId, { reason: editingReason });
    setEditingId(null);
    setEditingReason('');
  };

  const formatCoords = (mask: MaskRegion) => {
    if (mask.isPercentage) {
      return `${mask.x.toFixed(1)}%, ${mask.y.toFixed(1)}% → ${mask.width.toFixed(1)}% × ${mask.height.toFixed(1)}%`;
    }
    return `${Math.round(mask.x)}, ${Math.round(mask.y)} → ${Math.round(mask.width)} × ${Math.round(mask.height)}px`;
  };

  return (
    <aside className="mask-panel">
      <div className="mask-panel-header">
        <h3 className="mask-panel-title">Masks ({masks.length})</h3>
      </div>
      
      <div className="mask-list">
        {masks.length === 0 ? (
          <div style={{ 
            padding: '2rem 1rem', 
            textAlign: 'center', 
            color: 'var(--text-muted)',
            fontSize: '0.875rem'
          }}>
            <div style={{ marginBottom: '0.5rem' }}>No masks yet</div>
            <div style={{ fontSize: '0.75rem' }}>
              Click and drag on the image to create a mask region
            </div>
          </div>
        ) : (
          masks.map((mask, index) => (
            <div 
              key={mask.id} 
              className={`mask-list-item ${selectedMaskId === mask.id ? 'selected' : ''} ${hoveredMaskId === mask.id ? 'hovered' : ''}`}
              onClick={() => onSelect(mask.id)}
              onMouseEnter={() => onHover(mask.id)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                marginBottom: '0.25rem'
              }}>
                <span style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem', 
                  fontWeight: 600, 
                  color: 'var(--text-secondary)' 
                }}>
                  <span 
                    className="mask-number-badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      background: 'var(--mask-color-custom, var(--accent-error))',
                      color: 'white',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </span>
                  Mask #{index + 1}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(mask.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: '0 0.25rem',
                  }}
                  title="Remove mask"
                >
                  ×
                </button>
              </div>
              
              <div className="mask-list-item-coords">
                {formatCoords(mask)}
              </div>
              
              {editingId === mask.id ? (
                <div style={{ marginTop: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingReason}
                    onChange={(e) => setEditingReason(e.target.value)}
                    placeholder="Why is this masked?"
                    maxLength={500}
                    style={{
                      width: '100%',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveReason(mask.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => handleSaveReason(mask.id)}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="mask-list-item-reason"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(mask);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {mask.reason || 'Click to add reason...'}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {masks.length > 0 && (
        <div style={{ 
          padding: 'var(--spacing-md)', 
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)'
        }}>
          💡 Tip: Add reasons to document why areas are masked
        </div>
      )}
    </aside>
  );
}