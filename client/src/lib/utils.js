import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatMs(ms) {
  if (ms === null || ms === undefined) return 'N/A';
  return `${Number(ms).toFixed(1)}ms`;
}

export function formatPercent(val) {
  if (val === null || val === undefined) return 'N/A';
  return `${Number(val).toFixed(1)}%`;
}

export function formatDuration(ms) {
  if (!ms) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function statusColor(isUp) {
  if (isUp === null || isUp === undefined) return 'text-gray-400';
  return isUp ? 'text-green-400' : 'text-red-400';
}

export function statusBg(isUp) {
  if (isUp === null || isUp === undefined) return 'bg-gray-500';
  return isUp ? 'bg-green-500' : 'bg-red-500';
}
