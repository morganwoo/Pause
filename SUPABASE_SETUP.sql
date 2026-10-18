-- Run once in Supabase SQL Editor. Existing legacy data stays intact but is not assigned to any user.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_items_user_id ON public.items(user_id);
CREATE TABLE IF NOT EXISTS public.user_budgets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_budget NUMERIC(12,2) NOT NULL DEFAULT 500
);
-- Defense in depth: do not expose data through Supabase Data API to unauthenticated users.
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "items_select_own" ON public.items;
DROP POLICY IF EXISTS "items_insert_own" ON public.items;
DROP POLICY IF EXISTS "items_update_own" ON public.items;
DROP POLICY IF EXISTS "items_delete_own" ON public.items;
CREATE POLICY "items_select_own" ON public.items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "items_insert_own" ON public.items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "items_update_own" ON public.items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "items_delete_own" ON public.items FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "budgets_select_own" ON public.user_budgets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "budgets_insert_own" ON public.user_budgets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "budgets_update_own" ON public.user_budgets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- No public policies for legacy app_budget.
