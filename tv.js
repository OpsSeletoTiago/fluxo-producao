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
  const isCurrent = (month === state.currentMonth && year === state.currentYear);

  let html = `
    <div class="month-block ${isCurrent ? 'current-month-highlight' : ''}" style="margin-bottom: 30px;">
    <table class="monthly-table">
      <thead>
        <tr class="thead-month-row">
          <th colspan="${5 + stages.length}" class="th-month-label ${isCurrent ? 'month-label-highlight' : ''}" style="text-align: center;">
            ${monthName} ${year} ${isCurrent ? '— MÊS ATUAL' : ''}
          </th>
        </tr>
        <tr>
          <th class="th-base">Equipamento</th>
          <th class="th-base">Lote</th>
          <th class="th-base">Meta</th>
          <th class="th-base">Realizado</th>
          <th class="th-base">% Ating.</th>
          ${stages.map((s, idx) => `<th class="th-stage ${idx===stages.length-1?'last-stage-th':''}" style="background:${hexToRgba(s.color || '#4f8ef7',0.2)};color:var(--text-primary);">${s.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  let anyLots = false;
  let totalGoal = 0, totalReal = 0;

  let itemsToRender = [...state.planningItems];
  itemsToRender.sort((a, b) => {
    const goalsA = state.monthlyGoals[a.id]?.[month];
    const goalsB = state.monthlyGoals[b.id]?.[month];
    const prioA = goalsA?.priority !== undefined && goalsA?.priority !== null ? goalsA.priority : (a.priority || 0);
    const prioB = goalsB?.priority !== undefined && goalsB?.priority !== null ? goalsB.priority : (b.priority || 0);
    return prioA - prioB;
  });

  itemsToRender.forEach(item => {
    const goals = state.monthlyGoals[item.id] || {};
    const realized = state.monthlyRealized[item.id] || {};
    const goalVal = goals[month]?.goal ?? Math.round(item.annual_meta / 12);
    const realVal = realized[month]?.realized ?? '';

    totalGoal += Number(goalVal);
    if (realVal !== '') totalReal += Number(realVal);

    const monthLots = state.lots.filter(l => l.planning_item_id === item.id && l.month === month && l.year === year);
    if (monthLots.length > 0) {
      anyLots = true;
      html += monthLots.map(lot => {
        const stageCells = stages.map(stage => {
          if (!lot.end_assembly_date) return `<td class="td-stage" style="background:${hexToRgba(stage.color || '#4f8ef7',0.2)}"><span class="stage-date empty">—</span></td>`;
          
          const planned = computeStageDates(lot.end_assembly_date, stages, item.id)[stage.id];
          const saved = (state.stageStatuses[lot.id] || {})[stage.id];
          const status = resolveStatus(saved, planned);
          const completedDate = saved?.status === 'done' ? saved.completed_date : null;
          const rawDate = completedDate ? completedDate : planned;
          const dateObj = new Date(rawDate+'T12:00:00');
          const day = String(dateObj.getDate()).padStart(2,'0');
          const monthAbbr = MONTHS_ABBR[dateObj.getMonth()];
          const shortDate = `${day} ${monthAbbr}`;
          
          let badgeHtml = '';
          if (saved && saved.status === 'done') {
            const diff = Math.round((new Date(completedDate+'T12:00:00') - new Date(planned+'T12:00:00'))/86400000);
            if (diff > 0) badgeHtml = `<span class="stage-divider">|</span><span class="badge-status late">+${diff}</span>`;
            else if (diff < 0) badgeHtml = `<span class="stage-divider">|</span><span class="badge-status done">${diff}</span>`;
          } else if (status === 'late') {
            const today = new Date().toISOString().slice(0, 10);
            const diff = Math.round((new Date(today+'T12:00:00') - new Date(planned+'T12:00:00'))/86400000);
            badgeHtml = `<span class="stage-divider">|</span><span class="badge-status late">+${diff}</span>`;
          }
          const obsIcon = saved && (saved.notes || saved.observation) ? '<span class="obs-emoji">📝</span>' : '';
          
          return `<td class="td-stage cell-left" style="background:${hexToRgba(stage.color || '#4f8ef7', 0.15)}">
            <div class="stage-cell-content">
              <span class="neon-dot ${status}"></span>
              <span class="stage-date ${status}-date">${shortDate}</span>
              ${badgeHtml}
              ${obsIcon}
            </div>
          </td>`;
        }).join('');

        const pct = realVal !== '' && goalVal > 0 ? (realVal / goalVal) * 100 : null;
        const cls = progressClass(pct);

        return `
          <tr class="lot-row">
            <td class="td-equipment-name">${item.equipment?.name || '—'}</td>
            <td class="td-lot-name"><div class="lot-name-cell"><span>${lot.name}</span></div></td>
            <td class="td-meta" style="text-align:center; font-weight:600">${goalVal}</td>
            <td class="td-meta" style="text-align:center; font-weight:600">${realVal || '—'}</td>
            <td><span class="progress-chip ${cls}">${pct !== null ? pct.toFixed(0)+'%' : '—'}</span></td>
            ${stageCells}
          </tr>`;
      }).join('');
    }
  });

  if (!anyLots) html += `<tr><td colspan="${5 + stages.length}" class="td-empty">Nenhum lote em ${monthName}.</td></tr>`;

  const saldoVal = totalReal - totalGoal;
  const saldoCls = totalReal > 0 || totalGoal > 0 ? (saldoVal >= 0 ? 'color:var(--done)' : 'color:var(--late)') : '';

  html += `
    <tr class="saldo-row"><td colspan="2" style="font-weight:700; font-size:10px; color:var(--text-secondary)">TOTAL GERAL</td>
      <td style="text-align:center; font-weight:800">${totalGoal}</td><td style="text-align:center; font-weight:800">${totalReal > 0 ? totalReal : '—'}</td>
      <td style="${saldoCls}; font-weight:800; text-align:center">${saldoVal >= 0 ? '+' : ''}${saldoVal}</td><td colspan="${stages.length}"></td></tr>`;

  html += `</tbody></table></div>`;
  return html;
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  const stages = state.kanbanStages;

  // Removido o overflow:hidden e ajustado para acompanhar o conteúdo
  let html = '<div class="tv-kanban-swimlane" style="border: 3px solid #ffffff; border-radius: 16px; background: var(--bg-surface); box-shadow: 0 20px 60px rgba(0,0,0,0.6); display: inline-block; min-width: 100%; border-collapse: separate;">';
  
  // Header Row (Stages)
  html += '<div class="swimlane-header-row" style="display:flex; background: rgba(255,255,255,0.05); border-bottom: 3px solid var(--border-strong);">';
  html += `<div class="swimlane-legend-header" style="flex:0 0 210px; padding:12px; border-right:2px solid var(--border-strong); font-weight:900; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center;">
    <div style="font-size:20px; color:var(--accent); text-transform:uppercase; letter-spacing:1.5px; line-height:1.2;">
      ${MONTHS[state.currentMonth-1]}<br/>${state.currentYear}
    </div>
  </div>`;
  stages.forEach(stage => {
    html += `<div class="swimlane-stage-header" style="flex:1; padding:12px 6px; border-right:2px solid var(--border-strong); text-align:center; display:flex; flex-direction:column; justify-content:center;">
      <div style="font-size:16px; font-weight:900; color:var(--text-primary); line-height:1.2; text-transform:uppercase;">${stage.name}</div>
    </div>`;
  });
  html += '</div>';

  let lotsToRender = [...state.lots];
  lotsToRender.sort((a, b) => {
    const itemA = state.planningItems.find(x => x.id === a.planning_item_id);
    const itemB = state.planningItems.find(x => x.id === b.planning_item_id);
    const prioA = itemA && itemA._monthly_priority !== undefined ? itemA._monthly_priority : (itemA?.priority || 9999);
    const prioB = itemB && itemB._monthly_priority !== undefined ? itemB._monthly_priority : (itemB?.priority || 9999);
    return prioA - prioB;
  });

  // Body Rows (Lots)
  lotsToRender.forEach((lot, idx) => {
    const item = state.planningItems.find(x => x.id === lot.planning_item_id);
    const equipName = item?.equipment?.name || '—';
    const originalEndDate = lot.end_assembly_date;
    const isLast = idx === lotsToRender.length - 1;
    
    // Borda inferior apenas se não for o último (ou tratada pela div pai)
    const rowBorder = isLast ? '' : 'border-bottom:2px solid var(--border-strong);';
    
    html += `<div class="swimlane-row" style="display:flex; ${rowBorder}">`;
    
    const goals = state.monthlyGoals[item?.id]?.[state.currentMonth];
    const realized = state.monthlyRealized[item?.id]?.[state.currentMonth];
    const goalVal = goals?.goal ?? (item?.annual_meta ? Math.round(item.annual_meta / 12) : 0);
    const realVal = realized?.realized ?? 0;
    const pct = realVal && goalVal > 0 ? (realVal / goalVal) * 100 : 0;
    const cls = progressClass(pct);
    let pctBadgeHtml = `<div class="progress-chip ${cls}" style="position:absolute; top:8px; right:8px; display:inline-block; margin:0; padding:2px 6px; font-size:11px; font-weight:900;">${pct.toFixed(0)}%</div>`;

    html += `<div class="swimlane-legend-col" style="flex:0 0 210px; padding:14px 18px; border-right:2px solid var(--border-strong); background:var(--bg-card); display:flex; flex-direction:column; justify-content:center; position:relative;">
       ${pctBadgeHtml}
       <div style="font-size:17px; font-weight:900; color:var(--accent); margin-bottom:6px; text-transform:uppercase; line-height:1.2;">${equipName}</div>
       <div style="font-size:13px; font-weight:800; color:var(--text-primary); margin-bottom:4px;">LOTE: ${lot.name}</div>
       <div style="font-size:11px; font-weight:700; color:var(--text-secondary);">DATA PREV: ${originalEndDate ? formatDate(originalEndDate) : '—'}</div>
    </div>`;

    // Stage Columns
    stages.forEach(stage => {
      const plannedDate = originalEndDate ? computeStageDates(originalEndDate, stages, lot.planning_item_id)[stage.id] : null;
      const savedStatus = (state.stageStatuses[lot.id] || {})[stage.id];
      const resStatus = resolveStatus(savedStatus, plannedDate);
      
      let badgeHtml = '';
      if (savedStatus && savedStatus.status === 'done' && plannedDate && savedStatus.completed_date) {
         const diff = Math.round((new Date(savedStatus.completed_date + 'T12:00:00') - new Date(plannedDate + 'T12:00:00')) / 86400000);
         if (diff < 0) {
            badgeHtml = `<div style="background:var(--done); color:#000; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">${diff}d adiantado</div>`;
         } else if (diff > 0) {
            badgeHtml = `<div style="background:var(--late); color:#fff; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">${diff}d atrasado</div>`;
         } else {
            badgeHtml = `<div style="background:var(--done); color:#000; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">No prazo</div>`;
         }
      } else if (resStatus === 'late' && plannedDate) {
         const today = new Date().toISOString().slice(0, 10);
         const diff = Math.round((new Date(today + 'T12:00:00') - new Date(plannedDate + 'T12:00:00')) / 86400000);
         badgeHtml = `<div style="background:var(--late); color:#fff; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">+${diff}d atrasado</div>`;
      } else if (resStatus === 'open' && plannedDate) {
         badgeHtml = `<div style="background:var(--open); color:#000; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">EM ABERTO</div>`;
      }
      
      html += `<div class="swimlane-stage-col" style="flex:1; padding:10px; border-right:2px solid var(--border-strong); display:flex; align-items:stretch; justify-content:center;">
        <div class="kanban-card status-${resStatus}" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 6px !important; min-height:85px; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          <div class="kcard-date" style="font-size:18px; font-weight:900; display:flex; align-items:center; justify-content:center; gap:6px; white-space:nowrap; color:#ffffff; text-shadow:0 0 8px rgba(255,255,255,0.8), 0 0 14px rgba(255,255,255,0.6);">
             ${plannedDate ? formatDate(plannedDate) : '—'}
          </div>
          ${badgeHtml}
        </div>
      </div>`;
    });
    
    html += '</div>';
  });

  html += '</div>';
  board.innerHTML = html;
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

  const titleContainer = document.getElementById('current-month-label').parentElement;
  titleContainer.style.display = 'none';

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

// ── Sync Timer ────────────────────────────────────────────────────
let syncCountdown = 600; // 10 Minutos

setInterval(() => {
  syncCountdown--;
  if (syncCountdown <= 0) {
    syncCountdown = 600;
    console.log('Sincronização Periódica – Refreshing TV...');
    Promise.all([
      api.loadEquipment(),
      api.loadKanbanStages(),
      api.loadPlanningItems(state.currentYear), 
      api.loadAllMonthlyGoals(state.currentYear), 
      api.loadAllMonthlyRealized(state.currentYear), 
      api.loadAllStageOffsets()
    ]).then(() => setView(state.viewMode, state.showAnnual));
  }
  
  const timerDiv = document.getElementById('sync-timer-display');
  if (timerDiv) {
    const mins = Math.floor(syncCountdown / 60);
    const secs = syncCountdown % 60;
    const isClose = syncCountdown < 30;
    timerDiv.innerHTML = `<span style="font-size:14px; display:inline-block; ${isClose ? 'animation: breathe 1s infinite; color:var(--accent);' : ''}">🔄</span> ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }
}, 1000);

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

    // Sincronização em Tempo Real (Refresh da View)
    api.db.channel('tv-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
         if (window.tvSyncTimer) clearTimeout(window.tvSyncTimer);
         window.tvSyncTimer = setTimeout(async () => {
           console.log('Sincronização em Tempo Real – Refreshing TV...');
           syncCountdown = 600; // Reset do timer ao sofrer alteração real!
           await Promise.all([
             api.loadPlanningItems(state.currentYear), 
             api.loadAllMonthlyGoals(state.currentYear), 
             api.loadAllMonthlyRealized(state.currentYear), 
             api.loadAllStageOffsets()
           ]);
           setView(state.viewMode, state.showAnnual);
         }, 1500);
      })
      .subscribe();

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
