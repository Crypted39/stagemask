import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  maskColor: string;
  onSave: (settings: { maskColor: string }) => void;
}

const PRESET_COLORS = [
  '#8bb410', // Default green
  '#ef4444', // Red
  '#f59e0b', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

export function SettingsModal({
  isOpen,
  onClose,
  maskColor,
  onSave,
}: SettingsModalProps) {
  const [tempMaskColor, setTempMaskColor] = useState(maskColor);

  // Reset temp color when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempMaskColor(maskColor);
    }
  }, [isOpen, maskColor]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ maskColor: tempMaskColor });
    onClose();
  };

  const handleCancel = () => {
    setTempMaskColor(maskColor); // Reset to original
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={handleCancel} title="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="setting-item">
            <label className="setting-label">Mask Color</label>
            <div className="color-picker-container">
              <div className="color-presets">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`color-preset ${tempMaskColor === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setTempMaskColor(color)}
                    title={color}
                  />
                ))}
              </div>
              <div className="color-custom">
                <label className="color-custom-label">Custom:</label>
                <input
                  type="color"
                  value={tempMaskColor}
                  onChange={(e) => setTempMaskColor(e.target.value)}
                  className="color-input"
                />
                <input
                  type="text"
                  value={tempMaskColor}
                  onChange={(e) => setTempMaskColor(e.target.value)}
                  className="color-text-input"
                  maxLength={7}
                  placeholder="#000000"
                />
              </div>
              <div className="color-preview">
                <span className="color-preview-label">Preview:</span>
                <div
                  className="color-preview-box"
                  style={{
                    backgroundColor: `${tempMaskColor}40`,
                    borderColor: tempMaskColor,
                  }}
                >
                  <div
                    className="color-preview-badge"
                    style={{ backgroundColor: tempMaskColor }}
                  >
                    1
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
