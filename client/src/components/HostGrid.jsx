import { useState, useEffect, useRef, useCallback } from 'react';
import HostCard from './HostCard';
import { LayoutGrid, AlignJustify, ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';

const CARD_HEIGHT_MIN = 120;
const CARD_MAX_COLS_DETAILED = 4;
const CARD_MAX_COLS_SUMMARY = 5;

export default function HostGrid({ targets = [], lastPingResults = {}, sparklineData = {}, selectedTargetIds = [], onTargetClick, onDeleteUserTarget }) {
  const [displayOrder, setDisplayOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hostGridOrder'));
      if (Array.isArray(saved)) return saved;
    } catch {}
    return targets.map(t => t.id);
  });
  const [draggingId, setDraggingId] = useState(null);

  // View mode: 'detailed' = full card, 'summary' = compact card
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('hostCardViewMode') || 'detailed';
  });

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'detailed' ? 'summary' : 'detailed';
      localStorage.setItem('hostCardViewMode', next);
      return next;
    });
  }, []);

  // Per-card column spans (horizontal stretch)
  const [cardColSpans, setCardColSpans] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hostCardColSpans') || '{}'); } catch { return {}; }
  });

  // Per-card heights (vertical stretch)
  const [cardHeights, setCardHeights] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hostCardHeights') || '{}'); } catch { return {}; }
  });

  // Refs to wrapper elements for reading actual heights on resize start
  const wrapperRefs = useRef({});

  const maxCols = viewMode === 'summary' ? CARD_MAX_COLS_SUMMARY : CARD_MAX_COLS_DETAILED;

  const handleExpandCard = useCallback((e, id) => {
    e.stopPropagation();
    setCardColSpans(prev => {
      const next = { ...prev, [id]: Math.min(maxCols, (prev[id] || 1) + 1) };
      localStorage.setItem('hostCardColSpans', JSON.stringify(next));
      return next;
    });
  }, [maxCols]);

  const handleCollapseCard = useCallback((e, id) => {
    e.stopPropagation();
    setCardColSpans(prev => {
      if ((prev[id] || 1) <= 1) return prev;
      const next = { ...prev, [id]: (prev[id] || 1) - 1 };
      localStorage.setItem('hostCardColSpans', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleCardResizeMouseDown = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const wrapperEl = wrapperRefs.current[id];
    const startY = e.clientY;
    const startH = wrapperEl ? wrapperEl.getBoundingClientRect().height : (cardHeights[id] || 200);

    const onMouseMove = (ev) => {
      const newH = Math.max(CARD_HEIGHT_MIN, Math.round(startH + ev.clientY - startY));
      setCardHeights(prev => ({ ...prev, [id]: newH }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setCardHeights(prev => {
        localStorage.setItem('hostCardHeights', JSON.stringify(prev));
        return prev;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [cardHeights]);

  // Sync displayOrder when targets list changes (add new, remove deleted)
  useEffect(() => {
    setDisplayOrder(prev => {
      const ids = targets.map(t => t.id);
      const kept = prev.filter(id => ids.includes(id));
      const added = ids.filter(id => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [targets]);

  const draggingIdRef = useRef(null);

  const handleCardDragStart = useCallback((e, id) => {
    e.stopPropagation();
    draggingIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('card', id);
  }, []);

  const handleCardDragEnter = useCallback((id) => {
    if (!draggingIdRef.current || draggingIdRef.current === id) return;
    setDisplayOrder(prev => {
      const from = prev.indexOf(draggingIdRef.current);
      const to = prev.indexOf(id);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, draggingIdRef.current);
      return next;
    });
  }, []);

  const handleCardDragEnd = useCallback(() => {
    setDisplayOrder(prev => {
      localStorage.setItem('hostGridOrder', JSON.stringify(prev));
      return prev;
    });
    draggingIdRef.current = null;
    setDraggingId(null);
  }, []);

  if (!targets.length) {
    return (
      <div className="text-center py-12 text-gray-500">
        No hosts configured.
      </div>
    );
  }

  const targetMap = new Map(targets.map(t => [t.id, t]));
  const orderedTargets = displayOrder.map(id => targetMap.get(id)).filter(Boolean);

  const gridClass = viewMode === 'summary'
    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex justify-end mb-3">
        <button
          onClick={toggleViewMode}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors"
          title={viewMode === 'detailed' ? 'Switch to summary view' : 'Switch to detailed view'}
          aria-label={viewMode === 'detailed' ? 'Switch to summary view' : 'Switch to detailed view'}
        >
          {viewMode === 'detailed' ? <AlignJustify size={13} /> : <LayoutGrid size={13} />}
          {viewMode === 'detailed' ? 'Summary' : 'Detailed'}
        </button>
      </div>
      <div className={gridClass}>
        {orderedTargets.map(target => {
          const colSpan = Math.min(cardColSpans[target.id] || 1, maxCols);
          const cardHeight = cardHeights[target.id];
          return (
            <div
              key={target.id}
              ref={el => { wrapperRefs.current[target.id] = el; }}
              draggable
              onDragStart={(e) => handleCardDragStart(e, target.id)}
              onDragEnter={() => handleCardDragEnter(target.id)}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragEnd={handleCardDragEnd}
              style={{
                gridColumn: colSpan > 1 ? `span ${colSpan}` : undefined,
                minHeight: cardHeight ? `${cardHeight}px` : undefined,
              }}
              className={cn(
                "relative group/hostcard cursor-grab active:cursor-grabbing flex flex-col",
                draggingId === target.id && "opacity-50",
              )}
            >
              {/* Horizontal span controls */}
              <div className="absolute top-1.5 left-1.5 z-10 flex gap-0.5 opacity-0 group-hover/hostcard:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={(e) => handleCollapseCard(e, target.id)}
                  disabled={(cardColSpans[target.id] || 1) <= 1}
                  className="p-0.5 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-800 disabled:opacity-30 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                  title="Narrow card"
                  aria-label="Narrow card"
                >
                  <ChevronLeft size={11} />
                </button>
                <button
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={(e) => handleExpandCard(e, target.id)}
                  disabled={(cardColSpans[target.id] || 1) >= maxCols}
                  className="p-0.5 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-800 disabled:opacity-30 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                  title="Widen card"
                  aria-label="Widen card"
                >
                  <ChevronRight size={11} />
                </button>
              </div>

              <div className="flex-1">
                <HostCard
                  target={target}
                  lastPingResult={lastPingResults[target.id]}
                  sparklineData={sparklineData[target.id] || []}
                  isSelected={selectedTargetIds.includes(target.id)}
                  onTargetClick={onTargetClick}
                  onDelete={onDeleteUserTarget}
                  viewMode={viewMode}
                />
              </div>

              {/* Vertical resize handle */}
              <div
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onMouseDown={(e) => handleCardResizeMouseDown(e, target.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { setCardHeights(prev => { const cur = prev[target.id] || 200; const v = Math.max(CARD_HEIGHT_MIN, cur - 20); const next = { ...prev, [target.id]: v }; localStorage.setItem('hostCardHeights', JSON.stringify(next)); return next; }); }
                  if (e.key === 'ArrowDown') { setCardHeights(prev => { const cur = prev[target.id] || 200; const v = cur + 20; const next = { ...prev, [target.id]: v }; localStorage.setItem('hostCardHeights', JSON.stringify(next)); return next; }); }
                }}
                tabIndex={0}
                role="separator"
                aria-orientation="horizontal"
                className="h-2 flex items-center justify-center cursor-row-resize group/resize mt-0.5 opacity-0 group-hover/hostcard:opacity-100 focus:opacity-100 transition-opacity focus:outline-none"
                title="Drag or use arrow keys to resize card height"
                aria-label="Drag or use arrow keys to resize card height"
              >
                <GripHorizontal size={12} className="text-gray-700 group-hover/resize:text-blue-500 focus:text-blue-500 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
