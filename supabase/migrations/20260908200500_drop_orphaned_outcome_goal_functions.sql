-- PostgreSQL does not record table dependencies from PL/pgSQL function bodies, so dropping
-- the retired Outcome Goal tables can leave their semantic wrappers behind. Remove every
-- Goal-specific entry point explicitly now that Outcome Goals are no longer part of Ariadne.

drop function if exists chatgpt.create_outcome_goal(text,text,numeric,text,text,numeric,date,date,text,integer,numeric,boolean);
drop function if exists chatgpt.update_outcome_goal(text,jsonb,text);

drop function if exists public.create_outcome_goal_semantic(jsonb);
drop function if exists public.delete_outcome_goal_revision_semantic(text,text);
drop function if exists public.delete_outcome_goal_semantic(text,timestamptz);
drop function if exists public.reorder_outcome_goals_semantic(text,jsonb,jsonb);
drop function if exists public.sync_outcome_goal_task_semantic(text);
drop function if exists public.update_outcome_goal_semantic(text,jsonb,text,text,timestamptz);
drop function if exists public.enforce_outcome_goal_owner();

drop function if exists ariadne_internal.apply_outcome_goal_update(uuid,text,jsonb,text);
drop function if exists ariadne_internal.apply_outcome_goal_update_checked(uuid,text,jsonb,text,text,timestamptz);
