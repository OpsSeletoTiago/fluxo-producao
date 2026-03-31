// ── UI Rendering ───────────────────────────────────────────────
import { state } from './state.js';
import { formatDate, computeStageDates, resolveStatus, progressClass, progressLabel, hexToRgba } from './utils.js';
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
          <th colspan="5" class="th-base"></th>
          <th colspan="${stages.length}" class="th-month-label ${isCurrent ? 'month-label-highlight' : ''}">
            ${monthName} ${year} ${isCurrent ? '— MÊS ATUAL' : ''}
          </th>
        </tr>
        <tr>
          <th class="th-base">Equipamento</th>
          <th class="th-base">Lote</th>
          <th class="th-base">Meta</th>
          <th class="th-base">Realizado</th>
          <th class="th-base">% Ating.</th>
        ${stages.map(s => `<th class="th-stage" style="background:${hexToRgba(s.color || '#4f8ef7',0.2)};color:#fff;">${s.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

  let anyLots = false;
  let totalGoal = 0, totalReal = 0;

  itemsToRender.forEach(item => {
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
        html += `<tr><td class="td-equipment-name">${item.equipment?.name || '—'}</td><td colspan="${totalCols-1}" class="td-empty">Nenhum lote lançado.</td></tr>`;
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
            const statusEmoji = status === 'done' ? '🟢' : status === 'late' ? '🔴' : '🟡';
            let badgeHtml = '';
            if (saved && saved.status === 'done') {
              const diff = Math.round((new Date(completedDate+'T12:00:00') - new Date(planned+'T12:00:00'))/86400000);
              if (diff !== 0) badgeHtml = `<span class="stage-divider">|</span><span class="badge-status done">${diff > 0 ? '+' : ''}${diff}</span>`;
            } else if (status === 'late') {
              const today = todayISO();
              const diff = Math.round((new Date(today+'T12:00:00') - new Date(planned+'T12:00:00'))/86400000);
              badgeHtml = `<span class="stage-divider">|</span><span class="badge-status late">+${diff}</span>`;
            }
            const obsIcon = saved && (saved.notes || saved.observation) ? '<span class="obs-emoji">📝</span>' : '';
            return `<td class="td-stage cell-left" onclick="window.openStageModal('${lot.id}', ${stage.id}, '${planned}', '${lot.name}')" style="background:${hexToRgba(stage.color || '#4f8ef7', 0.2)}">
              <div class="stage-cell-content">
                <span class="stage-emoji">${statusEmoji}</span>
                <span class="stage-date">${shortDate}</span>
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
              <td class="td-meta"><input class="goal-input" type="number" value="${goalVal}" onchange="window.saveGoal(this)" data-month="${month}" data-item="${item.id}" onclick="event.stopPropagation()" /></td>
              <td class="td-meta"><input class="realized-input" type="number" value="${realVal}" placeholder="0" onchange="window.saveRealized(this)" data-month="${month}" data-item="${item.id}" onclick="event.stopPropagation()" /></td>
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
          return `<td class="td-stage"><input type="number" class="offset-input" value="${val}" ${s.id === 10 ? 'disabled' : ''} onchange="window.saveStageOffset(${s.id}, this.value)" /></td>`;
        }).join('')}
      </tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

export function renderMonthlyTable() {
  const container = document.getElementById('monthly-table-wrap');
  if (state.showAnnual) {
    let fullHtml = '';
    for (let m = 1; m <= 12; m++) fullHtml += renderMonthBlock(m, state.currentYear, state.selectedItemId);
    container.innerHTML = fullHtml;
    setTimeout(() => {
      const active = container.querySelector('.current-month-highlight');
      if (active) active.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else {
    container.innerHTML = renderMonthBlock(state.currentMonth, state.currentYear, state.selectedItemId);
  }
}

export function renderKanban() {
  const board = document.getElementById('kanban-board');
  const lotLabel = document.getElementById('kanban-lot-label');
  const stages = state.kanbanStages;
  const today = new Date().toISOString().slice(0, 10);

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
      const completedDate = savedStatus?.status === 'done' ? savedStatus.completed_date : null;

      let badge = '';
      if (resolvedStatus === 'done' && completedDate) {
        const diff = Math.round((new Date(completedDate+'T12:00:00') - new Date(plannedDate+'T12:00:00')) / 86400000);
        if (diff > 0) badge = `<span class="badge late">+${diff}d</span>`;
        else if (diff < 0) badge = `<span class="badge early">${diff}d</span>`;
      } else if (resolvedStatus === 'late') {
        const diff = Math.round((new Date(today+'T12:00:00') - new Date(plannedDate+'T12:00:00')) / 86400000);
        badge = `<span class="badge late">+${diff}d</span>`;
      }

      const item = state.planningItems.find(x => x.id === lot.planning_item_id);
      const equipName = item?.equipment?.name || '—';

      return `
      <div class="kanban-col">        <div class="kanban-col-header" style="background:${stage.color || '#4f8ef7'};color:#fff;opacity:0.6;">
          <div class="col-stage-num">Etapa ${stage.id}</div>
          <div class="col-stage-name">${stage.name}</div>
        </div>
        <div class="kanban-col-body">
          <div class="kanban-card status-${resolvedStatus}" onclick="window.openStageModal('${lot.id}', ${stage.id}, '${plannedDate}', '${lot.name}')">
            <div class="kcard-equip-name" style="font-size:8px; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:2px">${equipName}</div>
            ${badge}<div class="kcard-lot-name">${lot.name}</div><div class="kcard-date">📅 ${formatDate(plannedDate)}</div>
            ${completedDate ? `<div class="kcard-date" style="color:var(--done)">✓ ${formatDate(completedDate)}</div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  } else {
    lotLabel.textContent = `Cronograma Geral – ${MONTHS[state.currentMonth-1]}`;
    board.innerHTML = stages.map(stage => {
      const cardsHtml = state.lots.map(lot => {
        const item = state.planningItems.find(x => x.id === lot.planning_item_id);
        const plannedDate = lot.end_assembly_date ? computeStageDates(lot.end_assembly_date, stages, lot.planning_item_id)[stage.id] : null;
        const resStatus = resolveStatus((state.stageStatuses[lot.id] || {})[stage.id], plannedDate);
        return `<div class="kanban-card status-${resStatus}" onclick="window.selectLot('${lot.id}')" style="margin-bottom:8px">
          <div class="kcard-equip-name" style="font-size:8px; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:2px">${item?.equipment?.name || '—'}</div>
          <div class="kcard-lot-name" style="font-size:10px; font-weight:700">${lot.name}</div>
          <div class="kcard-date" style="font-size:9px">📅 ${plannedDate ? formatDate(plannedDate) : 'S/ data'}</div>
        </div>`;
      }).join('');
      return `<div class="kanban-col"><div class="kanban-col-header"><div class="col-stage-num">Etapa ${stage.id}</div><div class="col-stage-name">${stage.name}</div></div><div class="kanban-col-body">${cardsHtml || '<div class="empty-col"></div>'}</div></div>`;
    }).join('');
  }
}

export function renderMonthLabel() {
  const label = document.getElementById('current-month-label');
  if (label) label.textContent = `${MONTHS[state.currentMonth - 1]} ${state.currentYear}`;
}
