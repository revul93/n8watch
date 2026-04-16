import { useState, useEffect, useRef, useCallback } from 'react';
import HostCard from './HostCard';
import { GripVertical, LayoutGrid, AlignJustify } from 'lucide-react';
import { cn } from '../lib/utils';

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
        {orderedTargets.map(target => (
          <div
            key={target.id}
            draggable
            onDragStart={(e) => handleCardDragStart(e, target.id)}
            onDragEnter={() => handleCardDragEnter(target.id)}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnd={handleCardDragEnd}
            className={cn(
              "relative group cursor-grab active:cursor-grabbing",
              draggingId === target.id && "opacity-50",
            )}
          >
            {/* Drag handle — visible on card hover */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-50 transition-opacity pointer-events-none">
              <GripVertical size={12} className="text-gray-400 rotate-90" />
            </div>
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
        ))}
      </div>
    </div>
  );
}
