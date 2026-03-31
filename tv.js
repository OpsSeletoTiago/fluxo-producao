/* =============================================================
   FLUXO DE PRODUÇÃO – tv.js (Modular Version)
   Standalone display mode logic
   ============================================================= */

import { state, toast } from './state.js';
import * as api from './api.js';
import { formatDate, computeStageDates, resolveStatus, progressClass, hexToRgba } from './utils.js';
import { MONTHS, MONTHS_ABBR } from './constants.js';

'use strict';

// TV Specific State Extensions
state.autoRotate = true;
state.rotateInterval = null;
state.rotateStep = 0; // 0: Lista, 1: Kanban, 2: Anual

// ── Rendering (TV Specific) ───────────────────────────────────────
function renderMonthBlock(month, year) {
  const stages = state.kanbanStages;
  const monthName = MONTHS[month - 1];
  const itemsToRender = state.planningItems;
  const isCurrent = (month === state.currentMonth && year === state.currentYear);

  let html = `
    <div class="month-block ${isCurrent ? 'current-month-highlight' : ''}" style="margin-bottom: 30px;">
    <table class="monthly-table">
      <thead>
        <tr class="thead-month-row">
          <th colspan="5" class="th-base"></th>
          <th colspan="${stages.length}" class="th-month-label">${monthName} ${year} ${isCurrent ? '(MÊS ATUAL)' : ''}</th>
        </tr>
        <tr>
          <th class="th-base">Equipamento</th>
          <th class="th-base">Lote</th>
          <th class="th-base">Meta</th>
          <th class="th-base">Realizado</th>
          <th class="th-base">% Ating.</th>
          ${stages.map(s => `<th class="th-stage">${s.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  let anyLots = false;
  itemsToRender.forEach(item => {
    const goals = state.monthlyGoals[item.id] || {};
    const realized = state.monthlyRealized[item.id] || {};
    const goalVal = goals[month]?.goal || Math.round(item.annual_meta / 12);
    const realVal = realized[month]?.realized ?? '';

    const monthLots = state.lots.filter(l => l.planning_item_id === item.id && l.month === month && l.year === year);
    if (monthLots.length > 0) {
      anyLots = true;
      html += monthLots.map(lot => {
        const stageCells = stages.map(stage => {
          if (!lot.end_assembly_date) return `<td class="td-stage">—</td>`;
          const planned = computeStageDates(lot.end_assembly_date, stages, item.id)[stage.id];
          const saved = (state.stageStatuses[lot.id] || {})[stage.id];
          const status = resolveStatus(saved, planned);
          const completedDate = saved?.status === 'done' ? saved.completed_date : null;
          const rawDate = completedDate ? completedDate : planned;
          const dateObj = new Date(rawDate + 'T12:00:00');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const monthAbbr = MONTHS_ABBR[dateObj.getMonth()];
          const shortDate = `${day} ${monthAbbr}`;
          const statusEmoji = status === 'done' ? '🟢' : status === 'late' ? '🔴' : '🟡';

          let badgeHtml = '';
          if (saved && saved.status === 'done') {
            const diff = Math.round((new Date(completedDate + 'T12:00:00') - new Date(planned + 'T12:00:00')) / 86400000);
            if (diff !== 0) badgeHtml = `<span class="stage-divider">|</span><span class="badge-status done">${diff > 0 ? '+' : ''}${diff}</span>`;
          } else if (status === 'late') {
            const today = new Date().toISOString().slice(0, 10);
            const diff = Math.round((new Date(today + 'T12:00:00') - new Date(planned + 'T12:00:00')) / 86400000);
            badgeHtml = `<span class="stage-divider">|</span><span class="badge-status late">+${diff}</span>`;
          }

          return `<td class="td-stage cell-left" style="background:${hexToRgba(stage.color || '#4f8ef7', 0.2)}">
            <div class="stage-cell-content">
              <span class="stage-emoji">${statusEmoji}</span>
              <span class="stage-date">${shortDate}</span>
              ${badgeHtml}
            </div>
          </td>`;
        }).join('');

        const pct = realVal !== '' && goalVal > 0 ? (realVal / goalVal) * 100 : null;
        return `
          <tr class="lot-row">
            <td class="td-equipment-name">${item.equipment?.name || '—'}</td>
            <td class="td-lot-name">${lot.name}</td>
            <td class="td-meta">${goalVal}</td>
            <td class="td-meta">${realVal || '—'}</td>
            <td><span class="progress-chip ${progressClass(pct)}">${pct !== null ? pct.toFixed(0)+'%' : '—'}</span></td>
            ${stageCells}
          </tr>`;
      }).join('');
    }
  });

  if (!anyLots) html += `<tr><td colspan="${5 + stages.length}" class="td-empty">Nenhum lote em ${monthName}.</td></tr>`;
  html += `</tbody></table></div>`;
  return html;
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  const stages = state.kanbanStages;

  board.innerHTML = stages.map(stage => {
    const cardsHtml = state.lots.map(lot => {
      const item = state.planningItems.find(x => x.id === lot.planning_item_id);
      const plannedDate = lot.end_assembly_date ? computeStageDates(lot.end_assembly_date, stages, lot.planning_item_id)[stage.id] : null;
      const resStatus = resolveStatus((state.stageStatuses[lot.id] || {})[stage.id], plannedDate);
      return `
        <div class="kanban-card status-${resStatus}" style="margin-bottom:8px">
          <div class="kcard-equip-name" style="font-size:10px; font-weight:800; color:var(--accent); text-transform:uppercase;">${item?.equipment?.name || '—'}</div>
          <div class="kcard-lot-name">${lot.name}</div>
          <div class="kcard-date">📅 ${plannedDate ? formatDate(plannedDate) : 'S/ data'}</div>
        </div>`;
    }).join('');

    return `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div class="col-stage-num">Etapa ${stage.id}</div>
        <div class="col-stage-name">${stage.name}</div>
      </div>
      <div class="kanban-col-body">${cardsHtml || '<div class="empty-col"></div>'}</div>
    </div>`;
  }).join('');
}

// ── Control Logic ────────────────────────────────────────────────
async function setView(mode, annual) {
  state.viewMode = mode;
  state.showAnnual = annual;
  
  // UI buttons
  document.querySelectorAll('#tv-controls .btn').forEach(b => b.classList.remove('active'));
  if (annual) document.getElementById('btn-tv-anual').classList.add('active');
  else if (mode === 'lista') document.getElementById('btn-tv-lista').classList.add('active');
  else if (mode === 'kanban') document.getElementById('btn-tv-kanban').classList.add('active');

  document.getElementById('monthly-table-wrap').classList.toggle('hidden', mode !== 'lista');
  document.getElementById('kanban-area').classList.toggle('hidden', mode !== 'kanban');

  await api.loadLots(null, state.currentMonth, state.currentYear);
  await api.loadStageStatuses(state.lots.map(l => l.id));
  
  if (mode === 'lista') {
    const wrap = document.getElementById('monthly-table-wrap');
    if (annual) {
      let html = '';
      for(let m=1; m<=12; m++) html += renderMonthBlock(m, state.currentYear);
      wrap.innerHTML = html;
      setTimeout(() => {
        const active = wrap.querySelector('.current-month-highlight');
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      wrap.innerHTML = renderMonthBlock(state.currentMonth, state.currentYear);
    }
  } else {
    renderKanban();
  }
}

function startRotation() {
  if (state.rotateInterval) clearInterval(state.rotateInterval);
  state.rotateInterval = setInterval(() => {
    if (!state.autoRotate) return;
    state.rotateStep = (state.rotateStep + 1) % 3;
    if (state.rotateStep === 0) setView('lista', false);
    else if (state.rotateStep === 1) setView('kanban', false);
    else setView('lista', true);
  }, 20000);
  document.getElementById('tv-indicator').style.display = 'block';
}

function stopRotation() {
  clearInterval(state.rotateInterval);
  document.getElementById('tv-indicator').style.display = 'none';
}

// ── Event Handlers ────────────────────────────────────────────────
document.getElementById('btn-tv-lista')?.addEventListener('click', () => { 
  state.autoRotate = false; 
  document.getElementById('check-auto').checked = false; 
  stopRotation(); 
  setView('lista', false); 
});
document.getElementById('btn-tv-kanban')?.addEventListener('click', () => { 
  state.autoRotate = false; 
  document.getElementById('check-auto').checked = false; 
  stopRotation(); 
  setView('kanban', false); 
});
document.getElementById('btn-tv-anual')?.addEventListener('click', () => { 
  state.autoRotate = false; 
  document.getElementById('check-auto').checked = false; 
  stopRotation(); 
  setView('lista', true); 
});

document.getElementById('check-auto')?.addEventListener('change', (e) => {
  state.autoRotate = e.target.checked;
  if (state.autoRotate) startRotation();
  else stopRotation();
});

document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  try {
    const now = new Date();
    state.currentMonth = now.getMonth() + 1;
    state.currentYear = now.getFullYear();
    document.getElementById('current-month-label').textContent = `${MONTHS[state.currentMonth-1]} / ${state.currentYear}`;

    initTheme();

    await Promise.all([
      api.loadEquipment(), 
      api.loadKanbanStages(), 
      api.loadPlanningItems(state.currentYear), 
      api.loadAllMonthlyGoals(state.currentYear), 
      api.loadAllMonthlyRealized(state.currentYear), 
      api.loadAllStageOffsets()
    ]);
    
    await setView('lista', false);
    if (state.autoRotate) startRotation();
  } catch (err) {
    console.error('TV Init Error:', err);
    toast('Erro ao carregar Modo TV', 'error');
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

// Start
init();
