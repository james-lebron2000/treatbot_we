-- PRD-2026Q4 T0-7: NCT ID 格式 CHECK 约束
-- 注意：MySQL 8.0.16+ 才支持 CHECK 强制；前期版本 CHECK 仅记录不强制（不报错也不阻塞）。
-- 本约束允许 NULL（trial 可能是国内自营试验，无 NCT 编号）。
ALTER TABLE trials
  ADD CONSTRAINT chk_nct_format CHECK (nct_id IS NULL OR nct_id REGEXP '^NCT[0-9]{8}$');
