/* =============================================================
   FLUXO DE PRODUÇÃO – app.js  (Main Entry Point)
   Modularized Version with Drag and Drop
   ============================================================= */

import { state, toast } from './state.js';
import * as api from './api.js';
import { renderPlanningList, renderMonthlyTable, renderKanban, renderMonthLabel } from './ui-render.js';
import { openModal, closeModal } from './utils.js'; // Added these if I want them in utils, but they are simple
import './ui-actions.js'; // This registers window.* functions

'use strict';

// ── Initialization ─────────────────────────────────────────────
async function init() {
  try {
    // 1. Set current date/month
    const now = new Date();
    state.currentMonth = now.getMonth() + 1;
    state.currentYear = now.getFullYear();
    
    // 2. Load essential data
    await Promise.all([
      api.loadEquipment(),
      api.loadKanbanStages(),
      api.loadPlanningItems(state.currentYear)
    ]);

    // 3. Setup UI
    setupEventListeners();
    renderMonthLabel();
    
    // 4. Load initial global view (all lots)
    await window.selectItem(null);

    console.log('App initialized successfully');

  } catch (err) {
    console.error('Initialization error:', err);
    toast('Erro ao inicializar aplicativo', 'error');
  }
}

function setupEventListeners() {
  // Theme toggle
  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  });

  // Month navigation
  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    let m = state.currentMonth - 1;
    if (m < 1) { m = 12; state.currentYear--; }
    window.setActiveMonth(m);
  });
  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    let m = state.currentMonth + 1;
    if (m > 12) { m = 1; state.currentYear++; }
    window.setActiveMonth(m);
  });

  // View toggles
  document.getElementById('btn-view-lista')?.addEventListener('click', (e) => {
    state.viewMode = 'lista';
    e.target.classList.add('active');
    document.getElementById('btn-view-kanban').classList.remove('active');
    document.getElementById('monthly-table-wrap').classList.remove('hidden');
    document.getElementById('kanban-area').classList.add('hidden');
  });

  document.getElementById('btn-view-kanban')?.addEventListener('click', (e) => {
    state.viewMode = 'kanban';
    e.target.classList.add('active');
    document.getElementById('btn-view-lista').classList.remove('active');
    document.getElementById('monthly-table-wrap').classList.add('hidden');
    document.getElementById('kanban-area').classList.remove('hidden');
  });

  // Default to Lista mode in UI on initialization
  document.getElementById('kanban-area')?.classList.add('hidden');


  document.getElementById('check-annual')?.addEventListener('change', (e) => {
    state.showAnnual = e.target.checked;
    renderMonthlyTable();
  });

  // Year select
  document.getElementById('year-select')?.addEventListener('change', async (e) => {
    state.currentYear = parseInt(e.target.value);
    await api.loadPlanningItems(state.currentYear);
    renderPlanningList();
    renderMonthlyTable();
  });

  // Add Item Modal
  document.getElementById('btn-add-item')?.addEventListener('click', () => {
    const select = document.getElementById('item-equipment-select');
    select.innerHTML = state.equipment.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    document.getElementById('modal-add-item').style.display = 'flex';
  });

  document.getElementById('btn-save-item')?.addEventListener('click', async () => {
    const equipId = document.getElementById('item-equipment-select').value;
    const meta = parseInt(document.getElementById('item-annual-meta').value) || 0;
    if (!equipId) return;

    const { error } = await api.db.from('planning_items').insert({
      equipment_id: equipId,
      year: state.currentYear,
      annual_meta: meta,
      priority: state.planningItems.length + 1
    });

    if (error) { toast('Erro ao salvar item', 'error'); return; }
    
    document.getElementById('modal-add-item').style.display = 'none';
    await api.loadPlanningItems(state.currentYear);
    renderPlanningList();
    toast('Item adicionado');
  });

  // Add Lot Modal
  document.getElementById('btn-add-lot')?.addEventListener('click', () => {
    if (!state.selectedItemId) { toast('Selecione um equipamento primeiro'); return; }
    document.getElementById('modal-add-lot').style.display = 'flex';
  });

  document.getElementById('btn-save-lot')?.addEventListener('click', async () => {
    const name = document.getElementById('lot-name-input').value;
    const date = document.getElementById('lot-end-date-input').value;
    if (!name || !date) { toast('Preencha todos os campos'); return; }

    const { error } = await api.db.from('lots').insert({
      planning_item_id: state.selectedItemId,
      month: state.currentMonth,
      year: state.currentYear,
      name,
      end_assembly_date: date,
      active: true
    });

    if (error) { toast('Erro ao salvar lote', 'error'); return; }

    document.getElementById('modal-add-lot').style.display = 'none';
    document.getElementById('lot-name-input').value = '';
    document.getElementById('lot-end-date-input').value = '';
    
    await api.loadLots(state.selectedItemId, state.currentMonth, state.currentYear);
    renderMonthlyTable();
    renderKanban();
    toast('Lote criado');
  });

  // Stage Modal Save
  document.getElementById('btn-save-stage')?.addEventListener('click', async () => {
    const lotId = window._currentStageModalLotId;
    const stageId = window._currentStageModalStageId;
    const status = document.getElementById('modal-stage-status').value;
    const compDate = document.getElementById('modal-completed-date').value;
    const notes = document.getElementById('modal-stage-notes').value;

    const { error } = await api.db.from('lot_stage_status').upsert({
      lot_id: lotId,
      stage_id: stageId,
      status,
      completed_date: status === 'done' ? (compDate || new Date().toISOString().slice(0, 10)) : null,
      notes
    }, { onConflict: 'lot_id,stage_id' });

    if (error) { toast('Erro ao salvar status', 'error'); return; }

    document.getElementById('modal-stage').style.display = 'none';
    await api.loadStageStatuses([lotId]);
    renderMonthlyTable();
    renderKanban();
    toast('Status atualizado');
  });
}

// ── Global Modal Helpers ───────────────────────────────────────
window.openStageModal = (lotId, stageId, plannedDate, lotName) => {
  window._currentStageModalLotId = lotId;
  window._currentStageModalStageId = stageId;
  
  const stage = state.kanbanStages.find(s => s.id === stageId);
  document.getElementById('modal-stage-title').textContent = `Etapa ${stageId}: ${stage?.name || ''}`;
  document.getElementById('modal-stage-lot').textContent = lotName;
  document.getElementById('modal-stage-planned-date').textContent = new Date(plannedDate+'T12:00:00').toLocaleDateString('pt-BR');
  
  const saved = (state.stageStatuses[lotId] || {})[stageId];
  document.getElementById('modal-stage-status').value = saved?.status || 'open';
  document.getElementById('modal-completed-date').value = saved?.completed_date || '';
  document.getElementById('modal-stage-notes').value = saved?.notes || '';
  
  document.getElementById('modal-stage').style.display = 'flex';
};

window.closeModal = (id) => {
  document.getElementById(id).style.display = 'none';
};

window.openMonthlyDefaultsModal = async () => {
  const tbody = document.getElementById('monthly-defaults-tbody');
  document.getElementById('monthly-modal-month-name').textContent = MONTHS[state.currentMonth - 1];
  
  tbody.innerHTML = state.kanbanStages.map(s => {
    const existing = state.monthlyStageDefaults.find(d => d.stage_id === s.id && d.month === state.currentMonth);
    const val = existing ? existing.offset_days : s.day_offset;
    return `
      <tr>
        <td>${s.name} (ID ${s.id})</td>
        <td>
          <input type="number" class="offset-input" id="mdef-${s.id}" value="${val}" ${s.id === 10 ? 'disabled' : ''} />
        </td>
      </tr>
    `;
  }).join('');
  
  document.getElementById('modal-monthly-defaults').style.display = 'flex';
};

window.saveMonthlyDefaults = async () => {
  const updates = state.kanbanStages.map(s => {
    const input = document.getElementById(`mdef-${s.id}`);
    if (!input || s.id === 10) return null;
    return {
      month: state.currentMonth,
      year: state.currentYear,
      stage_id: s.id,
      offset_days: parseInt(input.value) || 0
    };
  }).filter(x => x !== null);

  const { error } = await api.db.from('monthly_stage_defaults').upsert(updates, { onConflict: 'month,year,stage_id' });
  if (error) { toast('Erro ao salvar padrões', 'error'); return; }

  toast('Prazos mensais salvos');
  document.getElementById('modal-monthly-defaults').style.display = 'none';
  
  // Reload and refresh
  const { data: defs } = await api.db.from('monthly_stage_defaults').select('*').eq('year', state.currentYear);
  state.monthlyStageDefaults = defs || [];
  renderMonthlyTable();
  renderKanban();
};

// Start
init();
