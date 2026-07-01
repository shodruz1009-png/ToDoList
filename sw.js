-- =========================================================
-- ToDoList uchun Supabase sozlash skripti
-- Buni Supabase loyihangizda: SQL Editor -> New query -> Run
-- =========================================================

-- 1) Eski jadval bo'lsa (id='main' bo'lgan eski umumiy jadval), uni o'chirib,
--    foydalanuvchiga bog'langan yangisini yaratamiz.
--    DIQQAT: agar eski app_data jadvalida saqlangan ma'lumotingiz bo'lsa,
--    avval uni ko'chirib oling, chunki bu buyruq jadvalni butunlay o'chiradi.
drop table if exists public.app_data;

create table public.app_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) Row Level Security — har bir foydalanuvchi FAQAT o'z qatorini ko'ra oladi
alter table public.app_data enable row level security;

create policy "Foydalanuvchi faqat o'z ma'lumotini ko'radi"
  on public.app_data for select
  using (auth.uid() = user_id);

create policy "Foydalanuvchi faqat o'z ma'lumotini qo'sha oladi"
  on public.app_data for insert
  with check (auth.uid() = user_id);

create policy "Foydalanuvchi faqat o'z ma'lumotini yangilay oladi"
  on public.app_data for update
  using (auth.uid() = user_id);

-- 3) Realtime yoqish (boshqa qurilmadagi o'zgarishlarni jonli olish uchun)
alter publication supabase_realtime add table public.app_data;
