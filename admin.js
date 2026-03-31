/* =============================================================
   FLUXO DE PRODUÇÃO – admin.js  (Admin Panel)
   ============================================================= */

import { db } from './supabase-config.js';

'use strict';


// ── Auth ───────────────────────────────────────────────────────
async function login() {
  const email = document.getElementById('email-input').value;
  const password = document.getElementById('pwd-input').value;
  const err = document.getElementById('login-error');
  
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  
  if (error) {
    err.style.display = 'block';
    err.textContent = 'Erro: ' + error.message;
    document.getElementById('pwd-input').value = '';
  } else {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    loadAll();
  }
}
window.login = login;

// Auto-login check
async function checkCurrentSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    loadAll();
  }
}
async function logout() {
  await db.auth.signOut();
  window.location.reload();
}
window.logout = logout;

checkCurrentSession();

// ── State ──────────────────────────────────────────────────────
let _equipment = [];
let _stages = [];

// ── Load All ───────────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadEquipment(), loadStages()]);
}

// ── Equipment ──────────────────────────────────────────────────
async function loadEquipment() {
  const { data, error } = await db.from('equipment').select('*').order('name');
  if (error) { alert('Erro ao carregar equipamentos'); return; }
  _equipment = data || [];
  renderEquipmentTable();
}

function renderEquipmentTable() {
  const tbody = document.getElementById('equip-tbody');
  if (!_equipment.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">📦</div><p>Nenhum equipamento cadastrado</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = _equipment.map((e, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td>
        <span id="name-display-${e.id}">${e.name}</span>
        <input id="name-edit-${e.id}" type="text" class="realized-input" value="${e.name}" style="display:none;width:160px" />
      </td>
      <td>
        <span id="desc-display-${e.id}" style="color:var(--text-secondary)">${e.description || '—'}</span>
        <input id="desc-edit-${e.id}" type="text" class="realized-input" value="${e.description || ''}" style="display:none;width:220px" placeholder="Descrição..." />
      </td>
      <td>
        <span class="tag" style="color:${e.active ? 'var(--done)' : 'var(--late)'}">
          ${e.active ? '● Ativo' : '● Inativo'}
        </span>
      </td>
      <td style="text-align:right; display:flex; gap:4px; justify-content:flex-end;">
        <span id="actions-${e.id}">
          <button class="btn btn-icon btn-sm" onclick="editEquipment('${e.id}')" title="Editar">✏</button>
          <button class="btn btn-icon btn-sm ${e.active ? 'btn-danger' : ''}" onclick="toggleEquipment('${e.id}', ${e.active})" title="${e.active ? 'Desativar' : 'Reativar'}">
            ${e.active ? '⊘' : '↺'}
          </button>
        </span>
        <span id="edit-actions-${e.id}" style="display:none; gap:4px">
          <button class="btn btn-primary btn-icon btn-sm" onclick="saveEquipmentEdit('${e.id}')">✓</button>
          <button class="btn btn-icon btn-sm" onclick="cancelEquipmentEdit('${e.id}')">×</button>
        </span>
      </td>
    </tr>
  `).join('');
}

function editEquipment(id) {
  document.getElementById(`name-display-${id}`).style.display = 'none';
  document.getElementById(`desc-display-${id}`).style.display = 'none';
  document.getElementById(`name-edit-${id}`).style.display = 'inline-block';
  document.getElementById(`desc-edit-${id}`).style.display = 'inline-block';
  document.getElementById(`actions-${id}`).style.display = 'none';
  document.getElementById(`edit-actions-${id}`).style.display = 'flex';
}
window.editEquipment = editEquipment;

function cancelEquipmentEdit(id) {
  document.getElementById(`name-display-${id}`).style.display = 'inline';
  document.getElementById(`desc-display-${id}`).style.display = 'inline';
  document.getElementById(`name-edit-${id}`).style.display = 'none';
  document.getElementById(`desc-edit-${id}`).style.display = 'none';
  document.getElementById(`actions-${id}`).style.display = 'inline';
  document.getElementById(`edit-actions-${id}`).style.display = 'none';
}
window.cancelEquipmentEdit = cancelEquipmentEdit;

async function saveEquipmentEdit(id) {
  const newName = document.getElementById(`name-edit-${id}`).value.trim();
  const newDesc = document.getElementById(`desc-edit-${id}`).value.trim();
  if (!newName) { alert('O nome não pode estar vazio.'); return; }

  const { error } = await db.from('equipment').update({ name: newName, description: newDesc || null }).eq('id', id);
  if (error) { alert('Erro ao salvar: ' + error.message); return; }

  const item = _equipment.find(e => e.id === id);
  if (item) { item.name = newName; item.description = newDesc || null; }
  renderEquipmentTable();
}
window.saveEquipmentEdit = saveEquipmentEdit;

async function toggleEquipment(id, currentActive) {
  const action = currentActive ? 'desativar' : 'reativar';
  if (!confirm(`Deseja ${action} este equipamento?`)) return;

  const { error } = await db.from('equipment').update({ active: !currentActive }).eq('id', id);
  if (error) { alert('Erro ao atualizar'); return; }
  await loadEquipment();
}
window.toggleEquipment = toggleEquipment;

function showAddEquipment() {
  document.getElementById('add-equip-form').style.display = 'block';
  document.getElementById('equip-name').focus();
}
window.showAddEquipment = showAddEquipment;

async function saveEquipment() {
  const name = document.getElementById('equip-name').value.trim();
  const desc = document.getElementById('equip-desc').value.trim();
  if (!name) { alert('Informe o nome do equipamento'); return; }

  // Prevent duplicates
  const duplicate = _equipment.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (duplicate) { alert(`Já existe um equipamento com o nome "${duplicate.name}".`); return; }

  const { error } = await db.from('equipment').insert({ name, description: desc || null, active: true });
  if (error) { alert('Erro ao criar equipamento: ' + error.message); return; }

  document.getElementById('equip-name').value = '';
  document.getElementById('equip-desc').value = '';
  document.getElementById('add-equip-form').style.display = 'none';
  await loadEquipment();
}
window.saveEquipment = saveEquipment;

// ── Kanban Stages ──────────────────────────────────────────────
async function loadStages() {
  const { data, error } = await db.from('kanban_stages').select('*').order('display_order');
  if (error) { alert('Erro ao carregar etapas'); return; }
  _stages = data || [];
  renderStagesTable();
}

function renderStagesTable() {
  const tbody = document.getElementById('stages-tbody');
  if (!_stages.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Nenhuma etapa encontrada</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = _stages.map(s => {
    const color = s.color || '#4f8ef7';
    return `
    <tr>
      <td><span class="tag">ID: ${s.id}</span></td>
      <td>
        <span id="stage-name-display-${s.id}">${s.name}</span>
        <input id="stage-name-edit-${s.id}" type="text" class="realized-input" value="${s.name}" style="display:none;width:160px" />
      </td>
      <td>
        <span id="stage-offset-display-${s.id}">${s.day_offset}</span>
        <input class="offset-input" type="number" id="stage-offset-edit-${s.id}" value="${s.day_offset}" style="display:none" />
      </td>
      <td>
        <div id="stage-color-display-${s.id}" style="display:flex;align-items:center;gap:6px;">
          <div style="width:20px;height:20px;border-radius:5px;background:${color};border:1px solid rgba(255,255,255,0.2);flex-shrink:0;"></div>
          <span style="font-size:10px;color:var(--text-muted);font-family:monospace">${color}</span>
        </div>
        <input type="color" id="stage-color-edit-${s.id}" value="${color}" style="display:none;width:48px;height:32px;border:none;background:none;cursor:pointer;padding:0" />
      </td>
      <td style="text-align:right;">
        <span id="stage-actions-${s.id}">
          <button class="btn btn-icon btn-sm" onclick="editStage('${s.id}')" title="Editar">✏</button>
          <button class="btn btn-icon btn-danger btn-sm" onclick="deleteStage('${s.id}', '${s.name}')" title="Excluir" ${s.id === 10 ? 'disabled' : ''}>×</button>
        </span>
        <span id="stage-edit-actions-${s.id}" style="display:none; gap:4px; justify-content:flex-end;">
          <button class="btn btn-primary btn-icon btn-sm" onclick="saveStageEdit('${s.id}')">✓</button>
          <button class="btn btn-icon btn-sm" onclick="cancelStageEdit('${s.id}')">×</button>
        </span>
      </td>
    </tr>`;
  }).join('');
}

function editStage(id) {
  document.getElementById(`stage-name-display-${id}`).style.display = 'none';
  document.getElementById(`stage-offset-display-${id}`).style.display = 'none';
  document.getElementById(`stage-color-display-${id}`).style.display = 'none';
  document.getElementById(`stage-name-edit-${id}`).style.display = 'inline-block';
  document.getElementById(`stage-offset-edit-${id}`).style.display = 'inline-block';
  document.getElementById(`stage-color-edit-${id}`).style.display = 'inline-block';
  document.getElementById(`stage-actions-${id}`).style.display = 'none';
  document.getElementById(`stage-edit-actions-${id}`).style.display = 'flex';
}
window.editStage = editStage;

function cancelStageEdit(id) {
  document.getElementById(`stage-name-display-${id}`).style.display = 'flex';
  document.getElementById(`stage-offset-display-${id}`).style.display = 'inline';
  document.getElementById(`stage-color-display-${id}`).style.display = 'flex';
  document.getElementById(`stage-name-edit-${id}`).style.display = 'none';
  document.getElementById(`stage-offset-edit-${id}`).style.display = 'none';
  document.getElementById(`stage-color-edit-${id}`).style.display = 'none';
  document.getElementById(`stage-actions-${id}`).style.display = 'inline';
  document.getElementById(`stage-edit-actions-${id}`).style.display = 'none';
}
window.cancelStageEdit = cancelStageEdit;

async function saveStageEdit(id) {
  const newName = document.getElementById(`stage-name-edit-${id}`).value.trim();
  const newOffset = parseInt(document.getElementById(`stage-offset-edit-${id}`).value);
  const newColor = document.getElementById(`stage-color-edit-${id}`).value;
  
  if (!newName) { alert('O nome não pode estar vazio.'); return; }
  if (isNaN(newOffset)) { alert('Offset inválido.'); return; }

  const { error } = await db.from('kanban_stages').update({ name: newName, day_offset: newOffset, color: newColor }).eq('id', id);
  if (error) { alert('Erro ao salvar: ' + error.message); return; }

  alert('Etapa atualizada com sucesso!');
  await loadStages();
}
window.saveStageEdit = saveStageEdit;

async function deleteStage(id, name) {
  if (id === 10 || id === '10') { alert('A etapa base de Fim de Montagem não pode ser excluída.'); return; }
  if (!confirm(`Deseja realmente excluir a etapa "${name}"? Isso pode afetar lotes existentes.`)) return;

  const { error } = await db.from('kanban_stages').delete().eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }

  alert('Etapa excluída!');
  await loadStages();
}
window.deleteStage = deleteStage;

async function saveNewStage() {
  const idStr = document.getElementById('new-stage-id').value.trim();
  const name = document.getElementById('new-stage-name').value.trim();
  const offsetStr = document.getElementById('new-stage-offset').value.trim();

  if (!idStr || !name || !offsetStr) { alert('Preencha ID, Nome e Offset'); return; }

  const id = parseInt(idStr);
  const offset = parseInt(offsetStr);

  if (isNaN(id) || isNaN(offset)) { alert('ID e Offset devem ser números válidos.'); return; }

  const duplicate = _stages.find(s => s.id === id);
  if (duplicate) { alert(`Já existe uma etapa com ID ${id}. Escolha outro ID.`); return; }

  const { error } = await db.from('kanban_stages').insert({
    id,
    name,
    day_offset: offset,
    display_order: id // simple default
  });

  if (error) { alert('Erro ao criar etapa: ' + error.message); return; }

  document.getElementById('new-stage-id').value = '';
  document.getElementById('new-stage-name').value = '';
  document.getElementById('new-stage-offset').value = '0';
  document.getElementById('add-stage-form').style.display = 'none';
  
  alert('Nova etapa adicionada com sucesso!');
  await loadStages();
}
window.saveNewStage = saveNewStage;

document.getElementById('btn-save-stages').addEventListener('click', async () => {
  const updates = _stages.map(s => {
    const input = document.getElementById(`offset-${s.id}`);
    const val = parseInt(input ? input.value : s.day_offset);
    return { id: s.id, name: s.name, day_offset: isNaN(val) ? s.day_offset : val, display_order: s.display_order };
  });

  const { error } = await db.from('kanban_stages').upsert(updates);
  if (error) { alert('Erro ao salvar etapas: ' + error.message); return; }

  alert('Etapas salvas com sucesso!');
  await loadStages();
});
