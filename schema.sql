-- ==============================================================================
-- FLUXO DE PRODUÇÃO - MIGRATION SCRIPT
-- ==============================================================================
-- Copie e cole este script no SQL Editor do seu NOVO projeto do Supabase
-- ==============================================================================

-- 1. EQUIPMENT
CREATE TABLE IF NOT EXISTS public.equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. KANBAN STAGES
CREATE TABLE IF NOT EXISTS public.kanban_stages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    day_offset INTEGER DEFAULT 0,
    display_order INTEGER
);

-- 3. PLANNING ITEMS
CREATE TABLE IF NOT EXISTS public.planning_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority INTEGER DEFAULT 0,
    equipment_id UUID REFERENCES public.equipment(id) ON DELETE CASCADE,
    annual_meta INTEGER DEFAULT 0,
    year INTEGER DEFAULT EXTRACT(year FROM now())::INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. MONTHLY GOALS
CREATE TABLE IF NOT EXISTS public.monthly_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_item_id UUID REFERENCES public.planning_items(id) ON DELETE CASCADE,
    month INTEGER CHECK (month >= 1 AND month <= 12),
    year INTEGER,
    goal INTEGER DEFAULT 0,
    manually_set BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. MONTHLY REALIZED
CREATE TABLE IF NOT EXISTS public.monthly_realized (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_item_id UUID REFERENCES public.planning_items(id) ON DELETE CASCADE,
    month INTEGER CHECK (month >= 1 AND month <= 12),
    year INTEGER,
    realized INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. STAGE OFFSETS
CREATE TABLE IF NOT EXISTS public.stage_offsets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_item_id UUID REFERENCES public.planning_items(id) ON DELETE CASCADE,
    month INTEGER CHECK (month >= 1 AND month <= 12),
    stage_id INTEGER REFERENCES public.kanban_stages(id) ON DELETE CASCADE,
    offset_days INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 7. LOTS
CREATE TABLE IF NOT EXISTS public.lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_item_id UUID REFERENCES public.planning_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    end_assembly_date DATE,
    month INTEGER CHECK (month >= 1 AND month <= 12),
    year INTEGER,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 8. LOT STAGE STATUS
CREATE TABLE IF NOT EXISTS public.lot_stage_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id UUID REFERENCES public.lots(id) ON DELETE CASCADE,
    stage_id INTEGER REFERENCES public.kanban_stages(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'done', 'late')),
    completed_date DATE,
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);


-- ==============================================================================
-- INSERIR DADOS INICIAIS (ETAPAS DO FLUXO)
-- ==============================================================================
INSERT INTO public.kanban_stages (id, name, day_offset, display_order) VALUES
(1, 'Início Compras', -82, 1),
(2, 'Início Separação', -67, 2),
(3, 'Início Usinagem', -64, 3),
(4, 'Início Processamento', -64, 4),
(5, 'Fim Usinagem', -34, 5),
(6, 'Fim Processamento', -34, 6),
(7, 'Chegada', -34, 7),
(8, 'Fim Separação', -32, 8),
(9, 'Início Montagem', -30, 9),
(10, 'Fim Montagem', 0, 10);
