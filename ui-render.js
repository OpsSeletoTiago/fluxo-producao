// ── UI Rendering ───────────────────────────────────────────────
import { state } from './state.js';
import { formatDate, formatShortDate, computeStageDates, resolveStatus, progressClass, progressLabel, hexToRgba } from './utils.js';
import { MONTHS, MONTHS_ABBR } from './constants.js';

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}


export function renderPlanningList() {
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
    <div class="planning-item${isActive ? ' active' : ''}" 
         data-item-id="${item.id}" 
         draggable="true"
         ondragstart="handleDragStart(event)"
         ondragover="handleDragOver(event)"
         ondrop="handleDrop(event)"
         ondragleave="handleDragLeave(event)">
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

  // Re-bind click selection (since it's replaced)
  container.querySelectorAll('.planning-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.selectItem(el.dataset.itemId);
    });
  });
}

export function renderMonthBlock(month, year, planningItemId = null) {
  const stages = state.kanbanStages;
  const monthName = MONTHS[month - 1];
  const itemsToRender = planningItemId ? state.planningItems.filter(x => x.id === planningItemId) : state.planningItems;
  if (!itemsToRender.length) return '';

  const totalCols = 5 + stages.length;
  const isCurrent = (month === state.currentMonth && year === state.currentYear);

  let html = `
    <div class="month-block ${isCurrent ? 'current-month-highlight' : ''}">
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
        ${stages.map(s => `<th class="th-stage" style="background:${hexToRgba(s.color || '#4f8ef7',0.2)};color:var(--text-primary);">${s.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  let anyLots = false;
  let totalGoal = 0, totalReal = 0;

  const baseItems = planningItemId ? state.planningItems.filter(i => i.id === planningItemId) : state.planningItems;
  let sortedItemsToRender = [...baseItems];
  sortedItemsToRender.sort((a, b) => {
    const goalsA = state.monthlyGoals[a.id]?.[month];
    const goalsB = state.monthlyGoals[b.id]?.[month];
    const prioA = goalsA?.priority !== undefined && goalsA?.priority !== null ? goalsA.priority : (a.priority || 0);
    const prioB = goalsB?.priority !== undefined && goalsB?.priority !== null ? goalsB.priority : (b.priority || 0);
    return prioA - prioB;
  });

  sortedItemsToRender.forEach(item => {
    const goals = state.monthlyGoals[item.id] || {};
    const realized = state.monthlyRealized[item.id] || {};
    const goalVal = goals[month]?.goal ?? Math.round(item.annual_meta / 12);
    const realVal = realized[month]?.realized ?? '';
    
    totalGoal += Number(goalVal);
    if (realVal !== '') totalReal += Number(realVal);

    const monthLots = state.lots.filter(l => l.planning_item_id === item.id && l.month === month && l.year === year);
    if (monthLots.length > 0 || !planningItemId) {
      anyLots = true;
      if (monthLots.length === 0) {
        html += `<tr>
          <td class="td-equipment-name">${item.equipment?.name || '—'}</td>
          <td class="td-lot-name"><div class="lot-name-cell"><span style="color:var(--text-secondary);font-size:10px">Nenhum lote</span></div></td>
          <td class="td-meta"><input class="goal-input" type="number" value="${goalVal}" data-month="${month}" data-item="${item.id}" /></td>
          <td class="td-meta"><input class="realized-input" type="number" value="${realVal}" placeholder="0" data-month="${month}" data-item="${item.id}" /></td>
          <td><span class="progress-chip">—</span></td>
          <td colspan="${stages.length}" class="td-empty"></td>
        </tr>`;
      } else {
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
            const statusEmoji = status === 'done' ? '✅' : status === 'late' ? '🔴' : '🟡';
            let badgeHtml = '';
            if (saved && saved.status === 'done') {
              const diff = Math.round((new Date(completedDate+'T12:00:00') - new Date(planned+'T12:00:00'))/86400000);
              if (diff > 0) badgeHtml = `<span class="stage-divider">|</span><span class="badge-status late">+${diff}</span>`;
              else if (diff < 0) badgeHtml = `<span class="stage-divider">|</span><span class="badge-status done">${diff}</span>`;
            } else if (status === 'late') {
              const today = todayISO();
              const diff = Math.round((new Date(today+'T12:00:00') - new Date(planned+'T12:00:00'))/86400000);
              badgeHtml = `<span class="stage-divider">|</span><span class="badge-status late">+${diff}</span>`;
            }
            const obsIcon = saved && (saved.notes || saved.observation) ? '<span class="obs-emoji">📝</span>' : '';
            return `<td class="td-stage cell-left" onclick="window.openStageModal('${lot.id}', ${stage.id}, '${planned}', '${lot.name}')" style="background:${hexToRgba(stage.color || '#4f8ef7', 0.15)}">
              <div class="stage-cell-content">
                <span class="neon-dot ${status}"></span>
                <span class="stage-date ${status}-date">${shortDate}</span>
                ${badgeHtml}
                ${obsIcon}
              </div>
            </td>`;
          }).join('');

          const isSelected = lot.id === state.selectedLotId;
          const pct = realVal !== '' && goalVal > 0 ? (realVal / goalVal) * 100 : null;
          const cls = progressClass(pct);

          return `
            <tr class="lot-row${isSelected ? ' selected-lot-row' : ''}" onclick="window.selectLot('${lot.id}')">
              <td class="td-equipment-name">${item.equipment?.name || '—'}</td>
              <td class="td-lot-name"><div class="lot-name-cell"><span>${lot.name}</span><button class="btn-delete-lot" onclick="event.stopPropagation(); window.deleteLot('${lot.id}', '${lot.name}')" title="Excluir Lote">&times;</button></div></td>
              <td class="td-meta"><input class="goal-input" type="number" value="${goalVal}" data-month="${month}" data-item="${item.id}" onclick="event.stopPropagation()" /></td>
              <td class="td-meta"><input class="realized-input" type="number" value="${realVal}" placeholder="0" data-month="${month}" data-item="${item.id}" onclick="event.stopPropagation()" /></td>
              <td><span class="progress-chip ${cls}">${pct !== null ? progressLabel(pct) : '—'}</span></td>
              ${stageCells}
            </tr>`;
        }).join('');
      }
    }
  });

  if (!anyLots) html += `<tr><td colspan="${totalCols}" class="td-empty">Nenhum lote em ${monthName}.</td></tr>`;

  const saldoVal = totalReal - totalGoal;
  const saldoCls = totalReal > 0 || totalGoal > 0 ? (saldoVal >= 0 ? 'color:var(--done)' : 'color:var(--late)') : '';

  html += `
    <tr class="saldo-row"><td colspan="2" style="font-weight:700; font-size:10px; color:var(--text-secondary)">TOTAL</td>
      <td style="text-align:center; font-weight:600">${totalGoal}</td><td style="text-align:center; font-weight:600">${totalReal > 0 ? totalReal : '—'}</td>
      <td style="${saldoCls}; font-weight:700; text-align:center">${saldoVal >= 0 ? '+' : ''}${saldoVal}</td><td colspan="${stages.length}"></td></tr>`;

  if (planningItemId) {
    html += `
      <tr class="offsets-row"><td colspan="5" style="font-weight:700; font-size:10px; color:var(--accent); text-align:right">PRAZOS (DIAS)</td>
        ${stages.map(s => {
          const itemOffsets = state.monthlyOffsets[planningItemId] || {};
          let val = itemOffsets[s.id];
          if (val === undefined) {
            const globalMonthly = state.monthlyStageDefaults.find(ms => ms.stage_id === s.id && ms.month === month && ms.year === year);
            if (globalMonthly) val = globalMonthly.offset_days;
          }
          if (val === undefined) val = s.day_offset;
          return `<td class="td-stage"><input type="number" class="offset-input" value="${val}" ${s.id === 10 ? 'disabled' : ''} data-stage="${s.id}" /></td>`;
        }).join('')}
      </tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

export function renderAnnualDash() {
  if (state.selectedItemId) return ''; // Apenas em visão geral
  let html = `<div class="month-block" style="margin-top: 32px;"><table class="monthly-table">
    <thead>
      <tr class="thead-month-row"><th colspan="4" class="th-month-label" style="text-align: center;">RESUMO ANUAL — ${state.currentYear}</th></tr>
      <tr><th class="th-base">Equipamento</th><th class="th-base">Meta Anual Real</th><th class="th-base">Realizado Total</th><th class="th-base">% Atingido</th></tr>
    </thead>
    <tbody>`;
  let totalAnualGoal = 0;
  let totalAnualReal = 0;
  state.planningItems.forEach(item => {
    let itemGoal = 0;
    let itemReal = 0;
    for (let m = 1; m <= 12; m++) {
      itemGoal += Number(state.monthlyGoals[item.id]?.[m]?.goal ?? Math.round(item.annual_meta / 12));
      itemReal += Number(state.monthlyRealized[item.id]?.[m]?.realized ?? 0);
    }
    totalAnualGoal += itemGoal;
    totalAnualReal += itemReal;
    const pct = itemReal > 0 && itemGoal > 0 ? (itemReal / itemGoal) * 100 : null;
    html += `<tr>
      <td class="td-equipment-name">${item.equipment?.name || '—'}</td>
      <td class="td-meta" style="text-align:center; font-weight:600">${itemGoal}</td>
      <td class="td-meta" style="text-align:center; font-weight:600">${itemReal}</td>
      <td><span class="progress-chip ${progressClass(pct)}">${pct !== null ? progressLabel(pct) : '—'}</span></td>
    </tr>`;
  });
  const totalPct = totalAnualReal > 0 && totalAnualGoal > 0 ? (totalAnualReal / totalAnualGoal) * 100 : null;
  html += `<tr class="saldo-row">
    <td style="font-weight:700; font-size:10px; color:var(--text-secondary)">TOTAL GERAL</td>
    <td style="text-align:center; font-weight:800">${totalAnualGoal}</td>
    <td style="text-align:center; font-weight:800">${totalAnualReal}</td>
    <td><span class="progress-chip ${progressClass(totalPct)}">${totalPct !== null ? progressLabel(totalPct) : '—'}</span></td>
  </tr>`;
  html += `</tbody></table></div>`;
  return html;
}

export function renderMonthlyTable() {
  const container = document.getElementById('monthly-table-wrap');
  if (state.showAnnual) {
    let fullHtml = '';
    for (let m = 1; m <= 12; m++) fullHtml += renderMonthBlock(m, state.currentYear, state.selectedItemId);
    fullHtml += renderAnnualDash();
    container.innerHTML = fullHtml;
    setTimeout(() => {
      const active = container.querySelector('.current-month-highlight');
      if (active) active.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else {
    let html = renderMonthBlock(state.currentMonth, state.currentYear, state.selectedItemId);
    html += renderAnnualDash();
    container.innerHTML = html;
  }
}

export function renderKanban() {
  const board = document.getElementById('kanban-board');
  const lotLabel = document.getElementById('kanban-lot-label');
  const stages = state.kanbanStages;
  const today = todayISO(); 

  lotLabel.textContent = state.selectedLotId 
    ? `Fluxo: ${state.lots.find(l => l.id === state.selectedLotId)?.name || ''}` 
    : `Cronograma Geral – ${MONTHS[state.currentMonth-1]}`;

  let html = '<div class="tv-kanban-swimlane" style="border: 3px solid #ffffff; border-radius: 16px; background: var(--bg-surface); box-shadow: 0 20px 60px rgba(0,0,0,0.6); display: inline-block; min-width: 100%; border-collapse: separate;">';
  
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

  let lotsToRender = state.selectedLotId ? state.lots.filter(l => l.id === state.selectedLotId) : [...state.lots];
  lotsToRender.sort((a, b) => {
    const itemA = state.planningItems.find(x => x.id === a.planning_item_id);
    const itemB = state.planningItems.find(x => x.id === b.planning_item_id);
    const prioA = itemA && itemA._monthly_priority !== undefined ? itemA._monthly_priority : (itemA?.priority || 9999);
    const prioB = itemB && itemB._monthly_priority !== undefined ? itemB._monthly_priority : (itemB?.priority || 9999);
    return prioA - prioB;
  });

  if (lotsToRender.length === 0) {
    board.innerHTML = `<div class="empty-state" style="margin:auto"><div class="icon">🏗</div><p>Nenhum lote para renderizar</p></div>`;
    return;
  }

  lotsToRender.forEach((lot, idx) => {
    const item = state.planningItems.find(x => x.id === lot.planning_item_id);
    const equipName = item?.equipment?.name || '—';
    const originalEndDate = lot.end_assembly_date;
    const isLast = idx === lotsToRender.length - 1;
    const rowBorder = isLast ? '' : 'border-bottom:2px solid var(--border-strong);';
    
    html += `<div class="swimlane-row" style="display:flex; ${rowBorder}">`;
    
    const goals = state.monthlyGoals[item?.id]?.[state.currentMonth];
    const realized = state.monthlyRealized[item?.id]?.[state.currentMonth];
    const goalVal = goals?.goal ?? (item?.annual_meta ? Math.round(item.annual_meta / 12) : 0);
    const realVal = realized?.realized ?? 0;
    const pct = realVal && goalVal > 0 ? (realVal / goalVal) * 100 : 0;
    const cls = progressClass(pct);
    let pctBadgeHtml = `<div class="progress-chip ${cls}" style="position:absolute; top:8px; right:8px; display:inline-block; margin:0; padding:4px 8px; font-size:14px; font-weight:900; border-radius:8px; border:1px solid rgba(255,255,255,0.2);">${pct.toFixed(0)}%</div>`;

    html += `<div class="swimlane-legend-col" style="flex:0 0 210px; padding:14px 18px; border-right:2px solid var(--border-strong); background:var(--bg-card); display:flex; flex-direction:column; justify-content:center; position:relative; cursor:pointer;" onclick="window.selectLot('${lot.id}')">
       ${pctBadgeHtml}
       <div style="font-size:17px; font-weight:900; color:var(--accent); margin-bottom:6px; text-transform:uppercase; line-height:1.2;">${equipName}</div>
       <div style="font-size:13px; font-weight:800; color:var(--text-primary); margin-bottom:4px;">LOTE: ${lot.name}</div>
       <div style="font-size:11px; font-weight:700; color:var(--text-secondary);">DATA PREV: ${originalEndDate ? formatDate(originalEndDate) : '—'}</div>
    </div>`;

    stages.forEach(stage => {
      const plannedDate = originalEndDate ? computeStageDates(originalEndDate, stages, lot.planning_item_id)[stage.id] : null;
      const savedStatus = (state.stageStatuses[lot.id] || {})[stage.id];
      const resStatus = resolveStatus(savedStatus, plannedDate);
      
      let badgeHtml = '';
      if (savedStatus && savedStatus.status === 'done' && plannedDate && savedStatus.completed_date) {
         const diff = Math.round((new Date(savedStatus.completed_date + 'T12:00:00') - new Date(plannedDate + 'T12:00:00')) / 86400000);
         if (diff < 0) {
            badgeHtml = `<div style="background:var(--done); color:#000; padding:1px 4px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">[-${Math.abs(diff)}d]</div>`;
         } else if (diff > 0) {
            badgeHtml = `<div style="background:var(--late); color:#fff; padding:1px 4px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">+${diff}d</div>`;
         } else {
            badgeHtml = `<div style="background:var(--done); color:#000; padding:1px 4px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">Prazo</div>`;
         }
      } else if (resStatus === 'late' && plannedDate) {
         const diff = Math.round((new Date(today + 'T12:00:00') - new Date(plannedDate + 'T12:00:00')) / 86400000);
         badgeHtml = `<div style="background:var(--late); color:#fff; padding:1px 4px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">+${diff}d</div>`;
      } else if (resStatus === 'open' && plannedDate) {
         badgeHtml = `<div style="background:var(--open); color:#000; padding:1px 4px; border-radius:10px; font-size:11px; font-weight:900; margin-top:6px;">Aberto</div>`;
      }
      
      html += `<div class="swimlane-stage-col" style="flex:1; padding:10px; border-right:2px solid var(--border-strong); display:flex; align-items:stretch; justify-content:center; cursor:pointer;" onclick="window.openStageModal('${lot.id}', ${stage.id}, '${plannedDate}', '${lot.name}')">
        <div class="kanban-card status-${resStatus}" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:4px 2px !important; min-height:85px; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          <div class="kcard-date">
             ${plannedDate ? formatShortDate(plannedDate) : '—'}
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

export function renderMonthLabel() {
  const label = document.getElementById('current-month-label');
  if (label) label.textContent = `${MONTHS[state.currentMonth - 1]} ${state.currentYear}`;
}
