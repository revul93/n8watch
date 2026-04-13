import { useState, useEffect, useRef, useCallback } from 'react';
import HostCard from './HostCard';
import { GripVertical } from 'lucide-react';
import { cn } from '../lib/utils';

export default function HostGrid({ targets = [], lastPingResults = {}, sparklineData = {}, selectedTargetIds = [], onTargetClick, onDeleteUserTarget }) {
  // Maintain a display order that can be reordered via drag-and-drop
  const [displayOrder, setDisplayOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hostGridOrder'));
      if (Array.isArray(saved)) return saved;
    } catch {}
    return targets.map(t => t.id);
  });

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
    e.stopPropagation(); // Prevent section drag from triggering
    draggingIdRef.current = id;
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
  }, []);

  if (!targets.length) {
    return (
      <div className="text-center py-12 text-gray-500">
        No hosts configured.
      </div>
    );
  }

  const orderedTargets = displayOrder
    .map(id => targets.find(t => t.id === id))
    .filter(Boolean);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
            draggingIdRef.current === target.id && "opacity-50",
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
          />
        </div>
      ))}
    </div>
  );
}
