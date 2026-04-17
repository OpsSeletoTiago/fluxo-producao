// ── Utility Functions ──────────────────────────────────────────
import { state } from './state.js';

export function hexToRgba(hex, opacity) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${opacity})`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  // Use T12:00:00 to avoid timezone issues with pure ISO date strings
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysDiff(a, b) {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((da - db) / 86400000);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function computeStageDates(endAssemblyDate, stages, itemId = null) {
  const result = {};
  const sorted = [...stages].sort((a, b) => b.id - a.id);
  
  let currentBaseDate = endAssemblyDate;
  result[10] = currentBaseDate;

  const dObj = new Date(endAssemblyDate + 'T12:00:00');
  const dMonth = dObj.getMonth() + 1;
  const dYear = dObj.getFullYear();

  for (let i = 1; i < sorted.length; i++) {
    const stage = sorted[i]; 
    const itemOffsets = itemId ? (state.monthlyOffsets[itemId] || {}) : {};
    let offset = itemOffsets[stage.id];

    if (offset === undefined) {
      const globalMonthly = state.monthlyStageDefaults.find(
        ms => ms.stage_id === stage.id && ms.month === dMonth && ms.year === dYear
      );
      if (globalMonthly) offset = globalMonthly.offset_days;
    }

    if (offset === undefined) offset = stage.day_offset;
    
    currentBaseDate = addDays(currentBaseDate, offset || 0);
    result[stage.id] = currentBaseDate;
  }
  return result;
}

export function resolveStatus(statusObj, plannedDate) {
  if (statusObj && statusObj.status === 'done') return 'done';
  const today = todayISO();
  if (plannedDate < today) return 'late';
  return 'open';
}

export function progressClass(pct) {
  if (pct === null || isNaN(pct)) return 'none';
  if (pct < 45) return 'low';
  if (pct < 70) return 'mid';
  if (pct < 90) return 'good';
  return 'full';
}

export function progressLabel(pct) {
  if (pct === null || isNaN(pct)) return '—';
  return pct.toFixed(0) + '%';
}

export function openModal(id) { 
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex'; 
}

export function closeModal(id) { 
  const el = document.getElementById(id);
  if (el) el.style.display = 'none'; 
}
