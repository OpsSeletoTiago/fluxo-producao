/* =============================================================
   FLUXO DE PRODUÇÃO – app.js  (Main Application)
   Vanilla JS + Supabase
   ============================================================= */

'use strict';

// ── State ──────────────────────────────────────────────────────
const state = {
  equipment: [],
  kanbanStages: [],
  planningItems: [],
  lots: [],
  stageStatuses: {},    // { lotId: { stageId: statusObj } }
  monthlyGoals: {},     // { planningItemId: { month: goalObj } }
  monthlyRealized: {},  // { planningItemId: { month: realObj } }
  monthlyOffsets: {},   // { planningItemId: { stageId: offsetDays } } for current month

  selectedItemId: null,
  selectedLotId: null,
  currentMonth: null,   // 1–12
  currentYear: null,
  viewMode: 'lista',    // 'lista' | 'kanban'
  showAnnual: false,
};

// ── Month names ─────────────────────────────────────────────────
const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

// ── Utilities ──────────────────────────────────────────────────
function toast(msg, type='info', duration=3000) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.closeModal = closeModal;

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysDiff(a, b) {
  // positive = a is after b (late); negative = a is before b (early)
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((da - db) / 86400000);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Reverse Date Calculator (SEQUENTIAL) ────────────────────────
function computeStageDates(endAssemblyDate, stages, itemId = null) {
  const result = {};
  const sorted = [...stages].sort((a, b) => b.id - a.id);
  
  let currentBaseDate = endAssemblyDate;
  result[10] = currentBaseDate;

  for (let i = 1; i < sorted.length; i++) {
    const stage = sorted[i]; 
    const itemOffsets = itemId ? (state.monthlyOffsets[itemId] || {}) : {};
    const offset = itemOffsets[stage.id] !== undefined 
      ? itemOffsets[stage.id] 
      : stage.day_offset;
    
    currentBaseDate = addDays(currentBaseDate, offset);
    result[stage.id] = currentBaseDate;
  }
  return result;
}

// ── Auto status resolver ────────────────────────────────────────
// Only applies if status is 'open' — may auto-upgrade to 'late'
function resolveStatus(statusObj, plannedDate) {
  if (statusObj && statusObj.status === 'done') return 'done';
  const today = todayISO();
  if (plannedDate < today) return 'late';
  return 'open';
}

// ── Progress color ──────────────────────────────────────────────
function progressClass(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return 'none';
  if (pct < 45)  return 'low';
  if (pct < 70)  return 'mid';
  if (pct < 90)  return 'good';
  return 'full';
}

function progressLabel(pct) {
  if (pct === null || isNaN(pct)) return '—';
  return pct.toFixed(0) + '%';
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════

async function loadEquipment() {
  const { data, error } = await db.from('equipment').select('*').eq('active', true).order('name');
  if (error) { console.error(error); return; }
  state.equipment = data || [];
}

async function loadKanbanStages() {
  const { data, error } = await db.from('kanban_stages').select('*').order('display_order');
  if (error) { console.error(error); return; }
  state.kanbanStages = data || [];
}

async function loadPlanningItems(year) {
  const { data, error } = await db
    .from('planning_items')
    .select('*, equipment(name)')
    .eq('year', year);
  if (error) { console.error(error); return; }

  const { data: mGoals } = await db
    .from('monthly_goals')
    .select('planning_item_id, priority')
    .eq('year', year)
    .eq('month', state.currentMonth);
    
  let priorityMap = {};
  (mGoals || []).forEach(g => { priorityMap[g.planning_item_id] = g.priority || 0; });
  
  data.forEach(item => { item._monthly_priority = priorityMap[item.id] !== undefined ? priorityMap[item.id] : 999; });
  data.sort((a, b) => a._monthly_priority - b._monthly_priority);
  
  state.planningItems = data || [];
}

async function loadLots(planningItemId, month, year) {
  let query = db.from('lots').select('*').eq('active', true).eq('year', year);
  
  if (planningItemId) {
    query = query.eq('planning_item_id', planningItemId);
  }
  
  if (!state.showAnnual) {
    query = query.eq('month', month);
  }

  const { data, error } = await query.order('created_at');
  if (error) { console.error(error); return; }
  state.lots = data || [];
}

async function loadMonthlyGoals(planningItemId, year) {
  const { data, error } = await db
    .from('monthly_goals')
    .select('*')
    .eq('planning_item_id', planningItemId)
    .eq('year', year);
  if (error) { console.error(error); return; }
  state.monthlyGoals[planningItemId] = {};
  (data || []).forEach(g => { state.monthlyGoals[planningItemId][g.month] = g; });
}

async function loadMonthlyRealized(planningItemId, year) {
  const { data, error } = await db
    .from('monthly_realized')
    .select('*')
    .eq('planning_item_id', planningItemId)
    .eq('year', year);
  if (error) { console.error(error); return; }
  state.monthlyRealized[planningItemId] = {};
  (data || []).forEach(r => { state.monthlyRealized[planningItemId][r.month] = r; });
}

async function loadStageStatuses(lotIds) {
  if (!lotIds.length) return;
  const { data, error } = await db
    .from('lot_stage_status')
    .select('*')
    .in('lot_id', lotIds);
  if (error) { console.error(error); return; }
  lotIds.forEach(id => { state.stageStatuses[id] = {}; });
  (data || []).forEach(s => {
    if (!state.stageStatuses[s.lot_id]) state.stageStatuses[s.lot_id] = {};
    state.stageStatuses[s.lot_id][s.stage_id] = s;
  });
}

async function loadStageOffsets(planningItemId, month) {
  let query = db.from('stage_offsets').select('*').eq('month', month);
  if (planningItemId) query = query.eq('planning_item_id', planningItemId);
  
  const { data, error } = await query;
  if (error) { console.error(error); return; }
  
  // If loading for a specific item, we might want to preserve others or clear, 
  // but usually we reload all for the month in global view.
  if (!planningItemId) state.monthlyOffsets = {}; 

  (data || []).forEach(o => { 
    if (!state.monthlyOffsets[o.planning_item_id]) state.monthlyOffsets[o.planning_item_id] = {};
    state.monthlyOffsets[o.planning_item_id][o.stage_id] = o.offset_days; 
  });
}

// ═══════════════════════════════════════════════════════════════
// RENDERING – LEFT PANEL
// ═══════════════════════════════════════════════════════════════

function renderPlanningList() {
  const container = document.getElementById('planning-list');
  if (!state.planningItems.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Nenhum item.<br>Clique em <strong>+ Item</strong></p></div>`;
    return;
  }

  container.innerHTML = state.planningItems.map((item, idx) => {
    const isActive = item.id === state.selectedItemId;
    const equip = item.equipment ? item.equipment.name : '—';
    const metaM = Math.round(item.annual_meta / 12);
    return `
    <div class="planning-item${isActive ? ' active' : ''}" data-item-id="${item.id}">
      <div class="item-header">
        <div class="item-priority">${idx + 1}</div>
        <div class="item-name" title="${equip}">${equip}</div>
        <div class="item-actions">
          ${idx > 0 ? `<button class="btn btn-icon" onclick="movePriority('${item.id}','up')" title="Subir">↑</button>` : ''}
          ${idx < state.planningItems.length-1 ? `<button class="btn btn-icon" onclick="movePriority('${item.id}','down')" title="Descer">↓</button>` : ''}
          <button class="btn btn-icon btn-danger" onclick="deleteItem('${item.id}',event)" title="Excluir">×</button>
        </div>
      </div>
      <div class="item-meta-row">
        <span>Anual: <strong>${item.annual_meta}</strong></span>
        <span style="margin-left:8px">Mensal ≈ <strong>${metaM}</strong></span>
      </div>
    </div>`;
  }).join('');

  // Click to select
  container.querySelectorAll('.planning-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      selectItem(el.dataset.itemId);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// RENDERING – MONTHLY TABLE  (planilha: lotes × etapas)
// ═══════════════════════════════════════════════════════════════

// ── Helper: Renderiza um bloco (tabela) de um mês específico
function renderMonthBlock(month, year, planningItemId = null) {
  const stages = state.kanbanStages;
  const monthName = MONTHS[month - 1];
  const itemsToRender = planningItemId 
    ? state.planningItems.filter(x => x.id === planningItemId)
    : state.planningItems;

  if (itemsToRender.length === 0) return '';

  const totalCols = 5 + stages.length;

  // Cabeçalho da Tabela
  let html = `
    <table class="monthly-table">
      <thead>
        <tr class="thead-month-row">
          <th colspan="5" class="th-base"></th>
          <th colspan="${stages.length}" class="th-month-label">${monthName} ${year}</th>
        </tr>
        <tr>
          <th class="th-base">Equipamento</th>
          <th class="th-base">Lote</th>
          <th class="th-base">Meta</th>
          <th class="th-base">Realizado</th>
          <th class="th-base">% Ating.</th>
          ${stages.map(s => `<th class="th-stage" title="${s.name}">${s.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  let anyLots = false;
  let totalGoal = 0;
  let totalReal = 0;

  itemsToRender.forEach(item => {
    const goals = state.monthlyGoals[item.id] || {};
    const realized = state.monthlyRealized[item.id] || {};
    const goalObj = goals[month];
    const realObj = realized[month];
    const goalVal = goalObj ? goalObj.goal : Math.round(item.annual_meta / 12);
    const realVal = realObj ? (realObj.realized ?? '') : '';
    
    totalGoal += Number(goalVal);
    if (realVal !== '') totalReal += Number(realVal);

    const monthLots = state.lots.filter(l => l.planning_item_id === item.id && l.month === month && l.year === year);
    
    if (monthLots.length > 0 || !planningItemId) {
      anyLots = true;

      if (monthLots.length === 0) {
        html += `<tr>
          <td class="td-equipment-name">${item.equipment ? item.equipment.name : '—'}</td>
          <td colspan="${totalCols - 1}" class="td-empty">Nenhum lote lançado.</td>
        </tr>`;
      } else {
        html += monthLots.map(lot => {
          const stageCells = stages.map(stage => {
            if (!lot.end_assembly_date) return `<td class="td-stage"><span class="stage-date-empty">—</span></td>`;
            
            const planned = computeStageDates(lot.end_assembly_date, stages, item.id)[stage.id];
            const saved = (state.stageStatuses[lot.id] || {})[stage.id];
            const status = resolveStatus(saved, planned);
            const completedDate = saved && saved.status === 'done' ? saved.completed_date : null;

            const dotCls = status === 'done' ? 'done' : status === 'late' ? 'late' : 'open';
            const dateDisplay = completedDate
              ? `<span class="stage-date done-date" title="Concluído em ${formatDate(completedDate)}">${formatDate(completedDate)}</span>`
              : `<span class="stage-date ${status}-date">${formatDate(planned)}</span>`;

            return `<td class="td-stage td-stage-${status}"
              onclick="openStageModal('${lot.id}', ${stage.id}, '${planned}', '${lot.name}')">
              <div class="stage-cell">
                <span class="status-dot ${dotCls}"></span>
                ${dateDisplay}
              </div>
            </td>`;
          }).join('');

          const isSelected = lot.id === state.selectedLotId;
          const pct = realVal !== '' && goalVal > 0 ? (realVal / goalVal) * 100 : null;
          const cls = progressClass(pct);

          return `
            <tr class="lot-row${isSelected ? ' selected-lot-row' : ''}" onclick="selectLot('${lot.id}')">
              <td class="td-equipment-name">${item.equipment ? item.equipment.name : '—'}</td>
              <td class="td-lot-name">
                <div class="lot-name-cell">
                  <span>${lot.name}</span>
                  <button class="btn-delete-lot" onclick="event.stopPropagation(); deleteLot('${lot.id}', '${lot.name}')" title="Excluir Lote">&times;</button>
                </div>
              </td>
              <td class="td-meta">
                <input class="goal-input" type="number" value="${goalVal}" 
                  onchange="saveGoal(this)" data-month="${month}" data-item="${item.id}" onclick="event.stopPropagation()" />
              </td>
              <td class="td-meta">
                <input class="realized-input" type="number" value="${realVal}" placeholder="0"
                  onchange="saveRealized(this)" data-month="${month}" data-item="${item.id}" onclick="event.stopPropagation()" />
              </td>
              <td><span class="progress-chip ${cls}">${pct !== null ? progressLabel(pct) : '—'}</span></td>
              ${stageCells}
            </tr>`;
        }).join('');
      }
    }
  });

  if (!anyLots) {
     html += `<tr><td colspan="${totalCols}" class="td-empty">Nenhum lote em ${monthName}.</td></tr>`;
  }

  // Linha de Saldo
  const saldoVal = totalReal - totalGoal;
  const saldoCls = totalReal > 0 || totalGoal > 0 ? (saldoVal >= 0 ? 'color:var(--done)' : 'color:var(--late)') : '';

  html += `
    <tr class="saldo-row">
      <td colspan="2" style="font-weight:700; font-size:10px; color:var(--text-secondary)">TOTAL</td>
      <td style="text-align:center; font-weight:600">${totalGoal}</td>
      <td style="text-align:center; font-weight:600">${totalReal > 0 ? totalReal : '—'}</td>
      <td style="${saldoCls}; font-weight:700; text-align:center">${saldoVal >= 0 ? '+' : ''}${saldoVal}</td>
      <td colspan="${stages.length}"></td>
    </tr>`;

  // Linha de Offsets (apenas se visão individual)
  if (planningItemId) {
    html += `
      <tr class="offsets-row">
        <td colspan="5" style="font-weight:700; font-size:10px; color:var(--accent); text-align:right">PRAZOS (DIAS)</td>
        ${stages.map(s => {
          const itemOffsets = state.monthlyOffsets[planningItemId] || {};
          const val = itemOffsets[s.id] !== undefined ? itemOffsets[s.id] : s.day_offset;
          return `
            <td class="td-stage">
              <input type="number" class="offset-input" value="${val}" ${s.id === 10 ? 'disabled' : ''}
                onchange="saveStageOffset(${s.id}, this.value)" />
            </td>`;
        }).join('')}
      </tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

function renderMonthlyTable() {
  const container = document.getElementById('monthly-table-wrap');
  
  if (state.showAnnual) {
    let fullHtml = '';
    // De mês atual até Dezembro
    for (let m = state.currentMonth; m <= 12; m++) {
      fullHtml += renderMonthBlock(m, state.currentYear, state.selectedItemId);
    }
    container.innerHTML = fullHtml;
  } else {
    container.innerHTML = renderMonthBlock(state.currentMonth, state.currentYear, state.selectedItemId);
  }
}

// ═══════════════════════════════════════════════════════════════
// RENDERING – KANBAN BOARD
// ═══════════════════════════════════════════════════════════════

function renderKanban() {
  const board = document.getElementById('kanban-board');
  const lotLabel = document.getElementById('kanban-lot-label');
  const stages = state.kanbanStages;
  const today = todayISO();

  // Se houver um lote selecionado, mostramos o fluxo dele (como era antes)
  if (state.selectedLotId) {
    const lot = state.lots.find(l => l.id === state.selectedLotId);
    if (!lot) return;
    lotLabel.textContent = `Fluxo: ${lot.name}`;

    if (!lot.end_assembly_date) {
      board.innerHTML = `<div class="empty-state" style="margin:auto"><div class="icon">📅</div><p>Defina a data de Fim de Montagem</p></div>`;
      return;
    }

    const stageDates = computeStageDates(lot.end_assembly_date, stages, lot.planning_item_id);
    const stageStatusMap = state.stageStatuses[lot.id] || {};

    board.innerHTML = stages.map(stage => {
      const plannedDate = stageDates[stage.id];
      const savedStatus = stageStatusMap[stage.id];
      const resolvedStatus = resolveStatus(savedStatus, plannedDate);
      const completedDate = savedStatus && savedStatus.status === 'done' ? savedStatus.completed_date : null;

      let badge = '';
      if (resolvedStatus === 'done' && completedDate) {
        const diff = daysDiff(completedDate, plannedDate);
        if (diff > 0) badge = `<span class="badge late">+${diff}d</span>`;
        else if (diff < 0) badge = `<span class="badge early">${diff}d</span>`;
      } else if (resolvedStatus === 'late') {
        const diff = daysDiff(today, plannedDate);
        badge = `<span class="badge late">+${diff}d</span>`;
      }

      const item = state.planningItems.find(x => x.id === lot.planning_item_id);
      const equipName = item && item.equipment ? item.equipment.name : '—';

      return `
      <div class="kanban-col">
        <div class="kanban-col-header">
          <div class="col-stage-num">Etapa ${stage.id}</div>
          <div class="col-stage-name">${stage.name}</div>
        </div>
        <div class="kanban-col-body">
          <div class="kanban-card status-${resolvedStatus}"
            onclick="openStageModal('${lot.id}', ${stage.id}, '${plannedDate}', '${lot.name}')">
            <div class="kcard-equip-name" style="font-size:8px; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:2px">${equipName}</div>
            ${badge}
            <div class="kcard-lot-name">${lot.name}</div>
            <div class="kcard-date">📅 ${formatDate(plannedDate)}</div>
            ${completedDate ? `<div class="kcard-date" style="color:var(--done)">✓ ${formatDate(completedDate)}</div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  } else {
    // Visão Global: Fluxo completo de todos os lotes do mês
    lotLabel.textContent = `Cronograma Geral – ${MONTHS[state.currentMonth-1]}`;
    
    board.innerHTML = stages.map(stage => {
      const cardsHtml = state.lots.map(lot => {
        const item = state.planningItems.find(x => x.id === lot.planning_item_id);
        const equipName = item && item.equipment ? item.equipment.name : '—';
        
        const plannedDate = lot.end_assembly_date 
          ? computeStageDates(lot.end_assembly_date, stages, lot.planning_item_id)[stage.id]
          : null;
        const savedStatus = (state.stageStatuses[lot.id] || {})[stage.id];
        const resStatus = resolveStatus(savedStatus, plannedDate);

        return `
          <div class="kanban-card status-${resStatus}" onclick="selectLot('${lot.id}')" style="margin-bottom:8px">
            <div class="kcard-equip-name" style="font-size:8px; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:2px">${equipName}</div>
            <div class="kcard-lot-name" style="font-size:10px; font-weight:700">${lot.name}</div>
            <div class="kcard-date" style="font-size:9px">📅 ${plannedDate ? formatDate(plannedDate) : 'S/ data'}</div>
          </div>`;
      }).join('');

      return `
      <div class="kanban-col">
        <div class="kanban-col-header">
          <div class="col-stage-num">Etapa ${stage.id}</div>
          <div class="col-stage-name">${stage.name}</div>
        </div>
        <div class="kanban-col-body">
          ${cardsHtml || '<div class="empty-col"></div>'}
        </div>
      </div>`;
    }).join('');
  }
}

// ═══════════════════════════════════════════════════════════════
// INTERACTIONS – PLANNING PANEL
// ═══════════════════════════════════════════════════════════════

async function selectItem(itemId) {
  state.selectedItemId = itemId;
  state.selectedLotId = null;

  const btnLot = document.getElementById('btn-add-lot');
  if (btnLot) btnLot.style.display = itemId ? 'inline-flex' : 'none';

  const item = state.planningItems.find(x => x.id === itemId);
  const titleEl = document.getElementById('exec-item-title');
  titleEl.textContent = item ? `📦 ${item.equipment ? item.equipment.name : '—'}` : '← Todos Equipamentos';
  titleEl.style.cursor = item ? 'pointer' : 'default';
  
  // Make title clickable to reset
  if (item) {
    titleEl.onclick = () => selectItem(null);
  } else {
    titleEl.onclick = null;
  }

  // Load data for this item (or all)
  await Promise.all([
    itemId ? loadMonthlyGoals(itemId, state.currentYear) : Promise.resolve(),
    itemId ? loadMonthlyRealized(itemId, state.currentYear) : Promise.resolve(),
    loadLots(itemId, state.currentMonth, state.currentYear),
    loadStageOffsets(itemId, state.currentMonth),
  ]);

  // For global view, we need status for ALL lots found
  const lotIds = state.lots.map(l => l.id);
  if (lotIds.length) await loadStageStatuses(lotIds);

  renderPlanningList();
  renderMonthlyTable();
  renderKanban();
}

async function selectLot(lotId) {
  state.selectedLotId = lotId;
  const lotIds = [lotId];
  await loadStageStatuses(lotIds);
  renderMonthlyTable();
  renderKanban();
}

async function deleteLot(lotId, lotName) {
  if (!confirm(`Deseja realmente excluir o lote "${lotName}"? Esta ação não pode ser desfeita.`)) return;

  const { error } = await db.from('lots').delete().eq('id', lotId);
  if (error) {
    console.error(error);
    toast('Erro ao excluir lote', 'error');
    return;
  }

  toast('Lote excluído com sucesso');
  
  // Atualizar estado e UI
  state.lots = state.lots.filter(l => l.id !== lotId);
  if (state.selectedLotId === lotId) state.selectedLotId = null;
  
  renderMonthlyTable();
  renderKanban();
}

window.selectLot = selectLot;
window.deleteLot = deleteLot;

async function movePriority(itemId, direction) {
  const items = state.planningItems;
  const idx = items.findIndex(x => x.id === itemId);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;

  // Swap monthly priorities
  const a = items[idx], b = items[swapIdx];
  const prioA = a._monthly_priority;
  const prioB = b._monthly_priority;
  
  a._monthly_priority = prioB;
  b._monthly_priority = prioA;

  await Promise.all([
    db.from('monthly_goals').update({ priority: prioB }).eq('planning_item_id', a.id).eq('month', state.currentMonth),
    db.from('monthly_goals').update({ priority: prioA }).eq('planning_item_id', b.id).eq('month', state.currentMonth),
  ]);

  items[idx] = b;
  items[swapIdx] = a;
  renderPlanningList();
}

window.movePriority = movePriority;

async function deleteItem(itemId, e) {
  e.stopPropagation();
  if (!confirm('Excluir item? Isso removerá também os lotes e dados relacionados.')) return;
  const { error } = await db.from('planning_items').delete().eq('id', itemId);
  if (error) { toast('Erro ao excluir item', 'error'); return; }
  if (state.selectedItemId === itemId) {
    state.selectedItemId = null;
    state.selectedLotId = null;
    state.lots = [];
  }
  toast('Item excluído', 'success');
  await loadPlanningItems(state.currentYear);
  renderPlanningList();
  renderMonthlyTable();
  renderKanban();
}

window.deleteItem = deleteItem;

// ═══════════════════════════════════════════════════════════════
// INTERACTIONS – MONTHLY TABLE
// ═══════════════════════════════════════════════════════════════

async function saveGoal(input) {
  const month = parseInt(input.dataset.month);
  const itemId = input.dataset.item;
  const val = parseInt(input.value) || 0;

  const existing = state.monthlyGoals[itemId]?.[month];
  if (existing) {
    await db.from('monthly_goals').update({ goal: val, manually_set: true }).eq('id', existing.id);
  } else {
    const { data } = await db.from('monthly_goals').insert({
      planning_item_id: itemId, month, year: state.currentYear, goal: val, manually_set: true
    }).select().single();
    if (!state.monthlyGoals[itemId]) state.monthlyGoals[itemId] = {};
    if (data) state.monthlyGoals[itemId][month] = data;
  }
  renderMonthlyTable();
}

window.saveGoal = saveGoal;

async function saveRealized(input) {
  const month = parseInt(input.dataset.month);
  const itemId = input.dataset.item;
  const val = parseInt(input.value) || 0;

  const existing = state.monthlyRealized[itemId]?.[month];
  if (existing) {
    await db.from('monthly_realized').update({ realized: val, updated_at: new Date().toISOString() }).eq('id', existing.id);
    state.monthlyRealized[itemId][month].realized = val;
  } else {
    const { data } = await db.from('monthly_realized').insert({
      planning_item_id: itemId, month, year: state.currentYear, realized: val
    }).select().single();
    if (!state.monthlyRealized[itemId]) state.monthlyRealized[itemId] = {};
    if (data) state.monthlyRealized[itemId][month] = data;
  }
  renderMonthlyTable();
}

async function saveStageOffset(stageId, val) {
  if (!state.selectedItemId) return;
  const days = parseInt(val) || 0;
  
  const { data, error } = await db
    .from('stage_offsets')
    .upsert({
      planning_item_id: state.selectedItemId,
      month: state.currentMonth,
      stage_id: stageId,
      offset_days: days
    }, { onConflict: 'planning_item_id,month,stage_id' })
    .select().single();

  if (error) { toast('Erro ao salvar prazo', 'error'); return; }
  
  if (!state.monthlyOffsets[state.selectedItemId]) state.monthlyOffsets[state.selectedItemId] = {};
  state.monthlyOffsets[state.selectedItemId][stageId] = days;
  
  // Re-render everything to update dates
  renderMonthlyTable();
  renderKanban();
}

window.saveStageOffset = saveStageOffset;

window.saveRealized = saveRealized;

async function setActiveMonth(month) {
  state.currentMonth = month;
  renderMonthLabel();
  if (state.selectedItemId) {
    await Promise.all([
      loadLots(state.selectedItemId, month, state.currentYear),
      loadStageOffsets(state.selectedItemId, month)
    ]);
    const lotIds = state.lots.map(l => l.id);
    if (lotIds.length) await loadStageStatuses(lotIds);
  }
  renderMonthlyTable();
  renderKanban();
}

window.setActiveMonth = setActiveMonth;

// ═══════════════════════════════════════════════════════════════
// INTERACTIONS – KANBAN STAGE MODAL
// ═══════════════════════════════════════════════════════════════

let _stageLotId = null, _stageId = null;

function openStageModal(lotId, stageId, plannedDate, lotName) {
  _stageLotId = lotId;
  _stageId = stageId;

  const saved = state.stageStatuses[lotId]?.[stageId];
  const stage = state.kanbanStages.find(s => s.id === stageId);

  document.getElementById('modal-stage-title').textContent = stage ? stage.name : 'Etapa';
  document.getElementById('modal-stage-lot').textContent = lotName;
  document.getElementById('modal-stage-planned-date').textContent = formatDate(plannedDate);
  document.getElementById('modal-stage-status').value = saved ? saved.status : 'open';
  document.getElementById('modal-completed-date').value = saved ? (saved.completed_date || '') : '';
  document.getElementById('modal-stage-notes').value = saved ? (saved.notes || '') : '';

  openModal('modal-stage');
}

window.openStageModal = openStageModal;

document.getElementById('btn-save-stage').addEventListener('click', async () => {
  const status = document.getElementById('modal-stage-status').value;
  const completedDate = document.getElementById('modal-completed-date').value || null;
  const notes = document.getElementById('modal-stage-notes').value || null;

  const payload = {
    lot_id: _stageLotId,
    stage_id: _stageId,
    status,
    completed_date: status === 'done' ? completedDate : null,
    notes,
    updated_at: new Date().toISOString(),
  };

  const existing = state.stageStatuses[_stageLotId]?.[_stageId];
  let result;
  if (existing) {
    result = await db.from('lot_stage_status').update(payload).eq('id', existing.id).select().single();
  } else {
    result = await db.from('lot_stage_status').insert(payload).select().single();
  }

  if (result.error) { toast('Erro ao salvar status', 'error'); return; }

  if (!state.stageStatuses[_stageLotId]) state.stageStatuses[_stageLotId] = {};
  state.stageStatuses[_stageLotId][_stageId] = result.data;

  closeModal('modal-stage');
  toast('Status atualizado', 'success');
  renderKanban();
});

// ═══════════════════════════════════════════════════════════════
// ADD PLANNING ITEM
// ═══════════════════════════════════════════════════════════════

function populateEquipmentSelect() {
  const sel = document.getElementById('item-equipment-select');
  sel.innerHTML = `<option value="">Selecione o equipamento...</option>` +
    state.equipment.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}

document.getElementById('btn-add-item').addEventListener('click', () => {
  populateEquipmentSelect();
  document.getElementById('item-annual-meta').value = '';
  openModal('modal-add-item');
});

document.getElementById('btn-save-item').addEventListener('click', async () => {
  const equipmentId = document.getElementById('item-equipment-select').value;
  const annualMeta = parseInt(document.getElementById('item-annual-meta').value) || 0;

  if (!equipmentId) { toast('Selecione um equipamento', 'error'); return; }

  const duplicate = state.planningItems.find(x => String(x.equipment_id) === String(equipmentId));
  if (duplicate) { 
    toast('Este equipamento já está no planejamento deste ano.', 'error'); 
    return; 
  }

  const { data, error } = await db.from('planning_items').insert({
    equipment_id: equipmentId,
    annual_meta: annualMeta,
    year: state.currentYear
  }).select().single();

  if (error) { toast('Erro: ' + (error.message || 'falha ao criar item'), 'error'); return; }

  toast('Item criado!', 'success');
  closeModal('modal-add-item');

  await distributeMonthlyGoals(data.id, annualMeta);

  await loadPlanningItems(state.currentYear);
  renderPlanningList();
});

async function distributeMonthlyGoals(itemId, annualMeta) {
  const baseGoal = Math.floor(annualMeta / 12);
  const remainder = annualMeta % 12;
  const newPriority = state.planningItems.length + 1;

  const rows = Array.from({ length: 12 }, (_, i) => ({
    planning_item_id: itemId,
    month: i + 1,
    year: state.currentYear,
    goal: baseGoal + (i < remainder ? 1 : 0),
    manually_set: false,
    priority: newPriority,
  }));

  await db.from('monthly_goals').upsert(rows, { onConflict: 'planning_item_id,month,year' });
}

// ═══════════════════════════════════════════════════════════════
// ADD LOT
// ═══════════════════════════════════════════════════════════════

document.getElementById('btn-add-lot').addEventListener('click', () => {
  if (!state.selectedItemId) { toast('Selecione um item primeiro', 'error'); return; }
  document.getElementById('lot-name-input').value = '';
  document.getElementById('lot-end-date-input').value = '';
  openModal('modal-add-lot');
});

document.getElementById('btn-save-lot').addEventListener('click', async () => {
  const name = document.getElementById('lot-name-input').value.trim();
  const endDate = document.getElementById('lot-end-date-input').value;

  if (!name) { toast('Informe o nome do lote', 'error'); return; }

  // Fixed Month: Use the currently navigated month/year
  const month = state.currentMonth;
  const year = state.currentYear;

  const { error } = await db.from('lots').insert({
    planning_item_id: state.selectedItemId,
    name,
    end_assembly_date: endDate || null,
    month,
    year,
    active: true,
  });

  if (error) { toast('Erro ao criar lote', 'error'); return; }

  toast('Lote criado!', 'success');
  closeModal('modal-add-lot');
  await loadLots(state.selectedItemId, state.currentMonth, state.currentYear);
  const lotIds = state.lots.map(l => l.id);
  if (lotIds.length) await loadStageStatuses(lotIds);
  renderMonthlyTable();
  renderKanban();
});

// ═══════════════════════════════════════════════════════════════
// MONTH NAVIGATION
// ═══════════════════════════════════════════════════════════════

function renderMonthLabel() {
  document.getElementById('current-month-label').textContent =
    `${MONTHS[state.currentMonth - 1]} / ${state.currentYear}`;
}

document.getElementById('btn-prev-month').addEventListener('click', async () => {
  state.currentMonth--;
  if (state.currentMonth < 1) { state.currentMonth = 12; state.currentYear--; }
  renderMonthLabel();
  document.getElementById('year-select').value = state.currentYear;
  
  await loadPlanningItems(state.currentYear);
  renderPlanningList();
  
  await Promise.all([
    state.selectedItemId ? loadMonthlyGoals(state.selectedItemId, state.currentYear) : Promise.resolve(),
    state.selectedItemId ? loadMonthlyRealized(state.selectedItemId, state.currentYear) : Promise.resolve(),
    loadLots(state.selectedItemId, state.currentMonth, state.currentYear),
    loadStageOffsets(state.selectedItemId, state.currentMonth)
  ]);
  
  const lotIds = state.lots.map(l => l.id);
  if (lotIds.length) await loadStageStatuses(lotIds);
  
  renderMonthlyTable();
  renderKanban();
});

document.getElementById('btn-next-month').addEventListener('click', async () => {
  state.currentMonth++;
  if (state.currentMonth > 12) { state.currentMonth = 1; state.currentYear++; }
  renderMonthLabel();
  document.getElementById('year-select').value = state.currentYear;

  await loadPlanningItems(state.currentYear);
  renderPlanningList();

  await Promise.all([
    state.selectedItemId ? loadMonthlyGoals(state.selectedItemId, state.currentYear) : Promise.resolve(),
    state.selectedItemId ? loadMonthlyRealized(state.selectedItemId, state.currentYear) : Promise.resolve(),
    loadLots(state.selectedItemId, state.currentMonth, state.currentYear),
    loadStageOffsets(state.selectedItemId, state.currentMonth)
  ]);

  const lotIds = state.lots.map(l => l.id);
  if (lotIds.length) await loadStageStatuses(lotIds);
  
  renderMonthlyTable();
  renderKanban();
});

document.getElementById('year-select').addEventListener('change', async (e) => {
  state.currentYear = parseInt(e.target.value);
  await loadPlanningItems(state.currentYear);
  renderPlanningList();
  
  await Promise.all([
    state.selectedItemId ? loadMonthlyGoals(state.selectedItemId, state.currentYear) : Promise.resolve(),
    state.selectedItemId ? loadMonthlyRealized(state.selectedItemId, state.currentYear) : Promise.resolve(),
    loadLots(state.selectedItemId, state.currentMonth, state.currentYear),
    loadStageOffsets(state.selectedItemId, state.currentMonth)
  ]);
  
  const lotIds = state.lots.map(l => l.id);
  if (lotIds.length) await loadStageStatuses(lotIds);
  
  renderMonthlyTable();
  renderKanban();
});

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════

// ── View Mode Controls ──────────────────────────────────────────
document.getElementById('btn-view-lista').addEventListener('click', () => {
  state.viewMode = 'lista';
  document.getElementById('btn-view-lista').classList.add('active');
  document.getElementById('btn-view-kanban').classList.remove('active');
  document.getElementById('monthly-table-wrap').classList.remove('hidden');
  document.getElementById('kanban-area').classList.add('hidden');
  renderMonthlyTable();
});

document.getElementById('btn-view-kanban').addEventListener('click', () => {
  state.viewMode = 'kanban';
  document.getElementById('btn-view-kanban').classList.add('active');
  document.getElementById('btn-view-lista').classList.remove('active');
  document.getElementById('kanban-area').classList.remove('hidden');
  document.getElementById('monthly-table-wrap').classList.add('hidden');
  renderKanban();
});

document.getElementById('check-annual').addEventListener('change', async (e) => {
  state.showAnnual = e.target.checked;
  if (state.selectedItemId) {
    await loadLots(state.selectedItemId, state.currentMonth, state.currentYear);
    const lotIds = state.lots.map(l => l.id);
    if (lotIds.length) await loadStageStatuses(lotIds);
  } else {
    await loadLots(null, state.currentMonth, state.currentYear);
    const lotIds = state.lots.map(l => l.id);
    if (lotIds.length) await loadStageStatuses(lotIds);
  }
  renderMonthlyTable();
  renderKanban();
});

async function init() {
  const now = new Date();
  state.currentMonth = now.getMonth() + 1;
  state.currentYear = now.getFullYear();

  document.getElementById('year-select').value = state.currentYear;
  renderMonthLabel();

  // Ensure initial view state
  document.getElementById('kanban-area').classList.add('hidden');
  const btnLot = document.getElementById('btn-add-lot');
  if (btnLot) btnLot.style.display = 'none';

  await Promise.all([loadEquipment(), loadKanbanStages()]);
  await loadPlanningItems(state.currentYear);

  renderPlanningList();
  
  // Default: load all lots for current month
  await loadLots(null, state.currentMonth, state.currentYear);
  const lotIds = state.lots.map(l => l.id);
  if (lotIds.length) await loadStageStatuses(lotIds);

  renderMonthlyTable();
  renderKanban();
}

init();
