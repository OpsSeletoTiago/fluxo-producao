// ── Database Operations ────────────────────────────────────────
import { db } from './supabase-config.js';
export { db };
import { state } from './state.js';

export async function loadEquipment() {
  const { data, error } = await db.from('equipment').select('*').eq('active', true).order('name');
  if (error) throw error;
  state.equipment = data || [];
}

export async function loadKanbanStages() {
  const { data, error } = await db.from('kanban_stages').select('*').order('display_order');
  if (error) throw error;
  state.kanbanStages = data || [];
}

export async function loadPlanningItems(year) {
  const { data, error } = await db
    .from('planning_items')
    .select('*, equipment(name)')
    .eq('year', year)
    .order('priority');
  if (error) throw error;

  const { data: mGoals } = await db
    .from('monthly_goals')
    .select('planning_item_id, priority')
    .eq('year', year)
    .eq('month', state.currentMonth);
    
  let priorityMap = {};
  (mGoals || []).forEach(g => { priorityMap[g.planning_item_id] = g.priority || 0; });
  
  data.forEach(item => { 
    item._monthly_priority = priorityMap[item.id] !== undefined ? priorityMap[item.id] : (item.priority || 0); 
  });
  data.sort((a, b) => (a._monthly_priority - b._monthly_priority) || ((a.priority || 0) - (b.priority || 0)));
  
  state.planningItems = data || [];

  const { data: defs } = await db.from('monthly_stage_defaults').select('*').eq('year', year);
  state.monthlyStageDefaults = defs || [];
}

export async function loadLots(planningItemId, month, year) {
  let query = db.from('lots').select('*').eq('active', true).eq('year', year);
  if (planningItemId) query = query.eq('planning_item_id', planningItemId);
  if (!state.showAnnual) query = query.eq('month', month);

  const { data, error } = await query.order('created_at');
  if (error) throw error;
  state.lots = data || [];
}

export async function loadMonthlyGoals(planningItemId, year) {
  const { data, error } = await db.from('monthly_goals').select('*').eq('planning_item_id', planningItemId).eq('year', year);
  if (error) throw error;
  state.monthlyGoals[planningItemId] = {};
  (data || []).forEach(g => { state.monthlyGoals[planningItemId][g.month] = g; });
}

export async function loadMonthlyRealized(planningItemId, year) {
  const { data, error } = await db.from('monthly_realized').select('*').eq('planning_item_id', planningItemId).eq('year', year);
  if (error) throw error;
  state.monthlyRealized[planningItemId] = {};
  (data || []).forEach(r => { state.monthlyRealized[planningItemId][r.month] = r; });
}

export async function loadAllMonthlyGoals(year) {
  const { data, error } = await db.from('monthly_goals').select('*').eq('year', year);
  if (error) throw error;
  state.monthlyGoals = {};
  (data || []).forEach(g => {
    if (!state.monthlyGoals[g.planning_item_id]) state.monthlyGoals[g.planning_item_id] = {};
    state.monthlyGoals[g.planning_item_id][g.month] = g;
  });
}

export async function loadAllMonthlyRealized(year) {
  const { data, error } = await db.from('monthly_realized').select('*').eq('year', year);
  if (error) throw error;
  state.monthlyRealized = {};
  (data || []).forEach(r => {
    if (!state.monthlyRealized[r.planning_item_id]) state.monthlyRealized[r.planning_item_id] = {};
    state.monthlyRealized[r.planning_item_id][r.month] = r;
  });
}

export async function loadStageStatuses(lotIds) {
  if (!lotIds.length) return;
  const { data, error } = await db.from('lot_stage_status').select('*').in('lot_id', lotIds);
  if (error) throw error;
  lotIds.forEach(id => { state.stageStatuses[id] = {}; });
  (data || []).forEach(s => {
    if (!state.stageStatuses[s.lot_id]) state.stageStatuses[s.lot_id] = {};
    state.stageStatuses[s.lot_id][s.stage_id] = s;
  });
}

export async function loadStageOffsets(planningItemId, month) {
  let query = db.from('stage_offsets').select('*').eq('month', month);
  if (planningItemId) query = query.eq('planning_item_id', planningItemId);
  const { data, error } = await query;
  if (error) throw error;
  if (!planningItemId) state.monthlyOffsets = {}; 
  (data || []).forEach(o => { 
    if (!state.monthlyOffsets[o.planning_item_id]) state.monthlyOffsets[o.planning_item_id] = {};
    state.monthlyOffsets[o.planning_item_id][o.stage_id] = o.offset_days; 
  });
}

export async function loadAllStageOffsets() {
  const { data, error } = await db.from('stage_offsets');
  if (error) throw error;
  state.monthlyOffsets = {};
  (data || []).forEach(o => { 
    if (!state.monthlyOffsets[o.planning_item_id]) state.monthlyOffsets[o.planning_item_id] = {};
    state.monthlyOffsets[o.planning_item_id][o.stage_id] = o.offset_days; 
  });
}

export async function saveMonthlyGoal(itemId, month, year, val, existingId = null) {
  if (existingId) {
    return await db.from('monthly_goals').update({ goal: val, manually_set: true }).eq('id', existingId);
  } else {
    return await db.from('monthly_goals').insert({ planning_item_id: itemId, month, year, goal: val, manually_set: true }).select().single();
  }
}

export async function saveMonthlyRealized(itemId, month, year, val, existingId = null) {
  if (existingId) {
    return await db.from('monthly_realized').update({ realized: val, updated_at: new Date().toISOString() }).eq('id', existingId);
  } else {
    return await db.from('monthly_realized').insert({ planning_item_id: itemId, month, year, realized: val }).select().single();
  }
}

export async function upsertMonthlyPriority(itemId, month, year, priority) {
  return await db.from('monthly_goals').upsert({
    planning_item_id: itemId, month, year, priority
  }, { onConflict: 'planning_item_id,month,year' });
}

export async function upsertStageOffset(itemId, month, stageId, days) {
  return await db.from('stage_offsets').upsert({
    planning_item_id: itemId, month, stage_id: stageId, offset_days: days
  }, { onConflict: 'planning_item_id,month,stage_id' }).select().single();
}
