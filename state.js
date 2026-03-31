// ── State Management ───────────────────────────────────────────
export const state = {
  equipment: [],
  kanbanStages: [],
  planningItems: [],
  lots: [],
  stageStatuses: {},    // { lotId: { stageId: statusObj } }
  monthlyGoals: {},     // { planningItemId: { month: goalObj } }
  monthlyRealized: {},  // { planningItemId: { month: realObj } }
  monthlyOffsets: {},   // { planningItemId: { stageId: offsetDays } } for current month
  monthlyStageDefaults: [], // Global defaults per month

  selectedItemId: null,
  selectedLotId: null,
  currentMonth: new Date().getMonth() + 1,
  currentYear: 2026,
  viewMode: 'lista',    // 'lista' | 'kanban'
  showAnnual: false,
};

export function toast(msg, type='info', duration=3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
