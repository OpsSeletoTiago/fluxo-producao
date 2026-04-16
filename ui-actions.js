// ── UI Actions & Event Handlers ────────────────────────────────
import { state, toast } from './state.js';
import * as api from './api.js';
import { renderPlanningList, renderMonthlyTable, renderKanban, renderMonthLabel } from './ui-render.js';
import { db } from './supabase-config.js';

export async function selectItem(itemId) {
  state.selectedItemId = itemId;
  state.selectedLotId = null;
  const btnLot = document.getElementById('btn-add-lot');
  if (btnLot) btnLot.style.display = itemId ? 'inline-flex' : 'none';

  const item = state.planningItems.find(x => x.id === itemId);
  const titleEl = document.getElementById('exec-item-title');
  if (item) {
    titleEl.innerHTML = `<div class="equipment-badge" onclick="window.selectItem(null)"><span class="arrow">←</span><span>${item.equipment?.name || '—'}</span></div>`;
  } else {
    titleEl.innerHTML = `<span style="opacity:0.6">Cronograma Geral</span>`;
  }

  await Promise.all([
    itemId ? api.loadMonthlyGoals(itemId, state.currentYear) : Promise.resolve(),
    itemId ? api.loadMonthlyRealized(itemId, state.currentYear) : Promise.resolve(),
    api.loadLots(itemId, state.currentMonth, state.currentYear),
    api.loadStageOffsets(itemId, state.currentMonth),
  ]);

  const lotIds = state.lots.map(l => l.id);
  if (lotIds.length) await api.loadStageStatuses(lotIds);

  renderPlanningList();
  renderMonthlyTable();
  renderKanban();
}
window.selectItem = selectItem;

export async function movePriority(itemId, direction) {
  const items = state.planningItems;
  const idx = items.findIndex(x => x.id === itemId);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;

  const a = items[idx], b = items[swapIdx];
  items[idx] = b; items[swapIdx] = a;
  a._monthly_priority = swapIdx + 1;
  b._monthly_priority = idx + 1;

  await Promise.all([
    api.upsertMonthlyPriority(a.id, state.currentMonth, state.currentYear, a._monthly_priority),
    api.upsertMonthlyPriority(b.id, state.currentMonth, state.currentYear, b._monthly_priority)
  ]);
  renderPlanningList();
}
window.movePriority = movePriority;

// ── Drag and Drop Handlers ──────────────────────────────────────
window.handleDragStart = (e) => {
  e.dataTransfer.setData('text/plain', e.target.dataset.itemId);
  e.target.classList.add('dragging');
};

window.handleDragOver = (e) => {
  e.preventDefault();
  const draggingEl = document.querySelector('.dragging');
  const targetEl = e.target.closest('.planning-item');
  if (targetEl && targetEl !== draggingEl) {
    targetEl.classList.add('drag-over');
  }
};

window.handleDragLeave = (e) => {
  const targetEl = e.target.closest('.planning-item');
  if (targetEl) targetEl.classList.remove('drag-over');
};

window.handleDrop = async (e) => {
  e.preventDefault();
  const draggingId = e.dataTransfer.getData('text/plain');
  const targetEl = e.target.closest('.planning-item');
  if (!targetEl) return;
  const targetId = targetEl.dataset.itemId;
  targetEl.classList.remove('drag-over');
  document.querySelector('.dragging')?.classList.remove('dragging');

  if (draggingId === targetId) return;

  const items = [...state.planningItems];
  const fromIdx = items.findIndex(x => x.id === draggingId);
  const toIdx = items.findIndex(x => x.id === targetId);
  
  const [removed] = items.splice(fromIdx, 1);
  items.splice(toIdx, 0, removed);

  // Re-assign all priorities for current month based on new index
  const updates = items.map((item, index) => {
    item._monthly_priority = index + 1;
    return api.upsertMonthlyPriority(item.id, state.currentMonth, state.currentYear, index + 1);
  });

  await Promise.all(updates);
  state.planningItems = items;
  renderPlanningList();
  toast('Ordem atualizada');
};

// ── Other Handlers (Selection, Deletion, etc.) ──────────────────
export async function deleteLot(lotId, lotName) {
  if (!confirm(`Excluir lote "${lotName}"?`)) return;
  const { error } = await db.from('lots').delete().eq('id', lotId);
  if (error) { toast('Erro ao excluir', 'error'); return; }
  state.lots = state.lots.filter(l => l.id !== lotId);
  renderMonthlyTable();
  renderKanban();
}
window.deleteLot = deleteLot;

export async function selectLot(lotId) {
  state.selectedLotId = lotId;
  await api.loadStageStatuses([lotId]);
  renderMonthlyTable();
  renderKanban();
}
window.selectLot = selectLot;

export async function deleteItem(itemId, e) {
  e.stopPropagation();
  if (!confirm('Excluir item e dados relacionados?')) return;
  const { error } = await db.from('planning_items').delete().eq('id', itemId);
  if (error) { toast('Erro ao excluir', 'error'); return; }
  await api.loadPlanningItems(state.currentYear);
  renderPlanningList();
  renderMonthlyTable();
  renderKanban();
}
window.deleteItem = deleteItem;

export async function saveGoal(input) {
  const month = parseInt(input.dataset.month), itemId = input.dataset.item, val = parseInt(input.value) || 0;
  const existing = state.monthlyGoals[itemId]?.[month];
  const { data } = await api.saveMonthlyGoal(itemId, month, state.currentYear, val, existing?.id);
  if (!state.monthlyGoals[itemId]) state.monthlyGoals[itemId] = {};
  if (data) state.monthlyGoals[itemId][month] = data;
  renderMonthlyTable();
}
window.saveGoal = saveGoal;

export async function saveRealized(input) {
  const month = parseInt(input.dataset.month), itemId = input.dataset.item, val = parseInt(input.value) || 0;
  const existing = state.monthlyRealized[itemId]?.[month];
  const { data } = await api.saveMonthlyRealized(itemId, month, state.currentYear, val, existing?.id);
  if (!state.monthlyRealized[itemId]) state.monthlyRealized[itemId] = {};
  if (data) state.monthlyRealized[itemId][month] = data;
  renderMonthlyTable();
}
window.saveRealized = saveRealized;

export async function saveStageOffset(stageId, val) {
  if (!state.selectedItemId) return;
  const days = parseInt(val) || 0;
  await api.upsertStageOffset(state.selectedItemId, state.currentMonth, stageId, days);
  state.monthlyOffsets[state.selectedItemId] = state.monthlyOffsets[state.selectedItemId] || {};
  state.monthlyOffsets[state.selectedItemId][stageId] = days;
  renderMonthlyTable(); renderKanban();
}
window.saveStageOffset = saveStageOffset;

export async function setActiveMonth(month) {
  state.currentMonth = month;
  renderMonthLabel();
  await api.loadPlanningItems(state.currentYear);
  await selectItem(state.selectedItemId);
}
window.setActiveMonth = setActiveMonth;
