import React, { useMemo, useState } from 'react';
import { FailedScreenshot } from '../../core/types';

interface ScreenshotListProps {
  screenshots: FailedScreenshot[];
  selected: FailedScreenshot | null;
  onSelect: (screenshot: FailedScreenshot) => void;
}

interface GroupedScreenshots {
  describeName: string;
  tests: {
    testName: string;
    screenshots: FailedScreenshot[];
  }[];
}

// Only show tooltip if text is truncated
const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
  const target = e.currentTarget;
  const textElement = target.querySelector('.screenshot-group-name, .screenshot-test-name, .screenshot-item-name') as HTMLElement;
  
  if (textElement && textElement.scrollWidth > textElement.clientWidth) {
    target.title = textElement.textContent || '';
  } else {
    target.removeAttribute('title');
  }
};

export function ScreenshotList({ screenshots, selected, onSelect }: ScreenshotListProps) {
  // Track collapsed state for describe groups and tests
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedTests, setCollapsedTests] = useState<Set<string>>(new Set());

  // Group screenshots by describe block, then by test
  const grouped = useMemo(() => {
    const groups: Map<string, Map<string, FailedScreenshot[]>> = new Map();

    for (const screenshot of screenshots) {
      const describeName = screenshot.describeName || 'Unknown Suite';
      const testName = screenshot.testName || 'Unknown Test';

      if (!groups.has(describeName)) {
        groups.set(describeName, new Map());
      }
      const describeGroup = groups.get(describeName)!;

      if (!describeGroup.has(testName)) {
        describeGroup.set(testName, []);
      }
      describeGroup.get(testName)!.push(screenshot);
    }

    // Convert to array structure
    const result: GroupedScreenshots[] = [];
    for (const [describeName, tests] of groups) {
      const testArray: GroupedScreenshots['tests'] = [];
      for (const [testName, testScreenshots] of tests) {
        testArray.push({ testName, screenshots: testScreenshots });
      }
      result.push({ describeName, tests: testArray });
    }

    return result;
  }, [screenshots]);

  const toggleGroup = (describeName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(describeName)) {
        next.delete(describeName);
      } else {
        next.add(describeName);
      }
      return next;
    });
  };

  const toggleTest = (testKey: string) => {
    setCollapsedTests(prev => {
      const next = new Set(prev);
      if (next.has(testKey)) {
        next.delete(testKey);
      } else {
        next.add(testKey);
      }
      return next;
    });
  };

  if (screenshots.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '2rem 1rem' }}>
        <div className="empty-state-icon" style={{ fontSize: '2rem' }}>✓</div>
        <h3 className="empty-state-title" style={{ fontSize: '1rem' }}>All tests passing</h3>
        <p className="empty-state-text" style={{ fontSize: '0.875rem' }}>
          No failed screenshot comparisons found.
        </p>
      </div>
    );
  }

  return (
    <div className="screenshot-list">
      {grouped.map((group) => {
        const isGroupCollapsed = collapsedGroups.has(group.describeName);
        const groupScreenshotCount = group.tests.reduce((sum, t) => sum + t.screenshots.length, 0);
        
        return (
          <div key={group.describeName} className="screenshot-group">
            <button 
              className="screenshot-group-header"
              onClick={() => toggleGroup(group.describeName)}
              onMouseEnter={handleMouseEnter}
            >
              <span className={`screenshot-group-chevron ${isGroupCollapsed ? 'collapsed' : ''}`}>
                ▼
              </span>
              <span className="screenshot-group-icon">📁</span>
              <span className="screenshot-group-name">{group.describeName}</span>
              <span className="screenshot-group-count">{groupScreenshotCount}</span>
            </button>
            
            {!isGroupCollapsed && (
              <div className="screenshot-group-content">
                {group.tests.map((test) => {
                  const testKey = `${group.describeName}::${test.testName}`;
                  const isTestCollapsed = collapsedTests.has(testKey);
                  const showTestHeader = group.tests.length > 1 || test.screenshots.length > 1;
                  
                  return (
                    <div key={test.testName} className="screenshot-test">
                      {showTestHeader && (
                        <button 
                          className="screenshot-test-header"
                          onClick={() => toggleTest(testKey)}
                          onMouseEnter={handleMouseEnter}
                        >
                          <span className={`screenshot-test-chevron ${isTestCollapsed ? 'collapsed' : ''}`}>
                            ▼
                          </span>
                          <span className="screenshot-test-icon">🧪</span>
                          <span className="screenshot-test-name">{test.testName}</span>
                          {test.screenshots.length > 1 && (
                            <span className="screenshot-test-count">{test.screenshots.length}</span>
                          )}
                        </button>
                      )}
                      
                      {(!showTestHeader || !isTestCollapsed) && (
                        <div className="screenshot-test-items">
                          {test.screenshots.map((screenshot) => (
                            <button
                              key={screenshot.actualPath}
                              className={`screenshot-item ${selected?.actualPath === screenshot.actualPath ? 'active' : ''}`}
                              onClick={() => onSelect(screenshot)}
                              onMouseEnter={handleMouseEnter}
                            >
                              <div className="screenshot-item-icon">✗</div>
                              <div className="screenshot-item-info">
                                <div className="screenshot-item-name">{screenshot.screenshotName}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}