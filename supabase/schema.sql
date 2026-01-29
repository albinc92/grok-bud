-- Grok Bud Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/oabzwnivfpmjrpzjyrez/sql)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Posts table (favorites)
create table public.posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('image', 'chat')),
  prompt text not null,
  model text not null,
  image_url text,
  response text,
  videos jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now() not null
);

-- Settings table (one per user)
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key_encrypted text,
  theme text default 'dark' not null,
  image_model text default 'grok-2-image' not null,
  chat_model text default 'grok-3-mini' not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Usage stats table (one per user)
create table public.usage_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_tokens integer default 0 not null,
  image_count integer default 0 not null,
  video_count integer default 0 not null,
  updated_at timestamp with time zone default now() not null
);

-- Video jobs table (for tracking in-progress video generation)
create table public.video_jobs (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade not null,
  prompt text not null,
  duration integer not null,
  status text default 'pending' not null check (status in ('pending', 'done', 'error')),
  video_url text,
  error_message text,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone
);

-- Indexes for performance
create index posts_user_id_idx on public.posts(user_id);
create index posts_created_at_idx on public.posts(created_at desc);
create index video_jobs_user_id_idx on public.video_jobs(user_id);
create index video_jobs_status_idx on public.video_jobs(status);

-- Row Level Security (RLS) - users can only access their own data
alter table public.posts enable row level security;
alter table public.settings enable row level security;
alter table public.usage_stats enable row level security;
alter table public.video_jobs enable row level security;

-- RLS Policies for posts
create policy "Users can view own posts" on public.posts
  for select using (auth.uid() = user_id);

create policy "Users can insert own posts" on public.posts
  for insert with check (auth.uid() = user_id);

create policy "Users can update own posts" on public.posts
  for update using (auth.uid() = user_id);

create policy "Users can delete own posts" on public.posts
  for delete using (auth.uid() = user_id);

-- RLS Policies for settings
create policy "Users can view own settings" on public.settings
  for select using (auth.uid() = user_id);

create policy "Users can insert own settings" on public.settings
  for insert with check (auth.uid() = user_id);

create policy "Users can update own settings" on public.settings
  for update using (auth.uid() = user_id);

-- RLS Policies for usage_stats
create policy "Users can view own usage" on public.usage_stats
  for select using (auth.uid() = user_id);

create policy "Users can insert own usage" on public.usage_stats
  for insert with check (auth.uid() = user_id);

create policy "Users can update own usage" on public.usage_stats
  for update using (auth.uid() = user_id);

-- RLS Policies for video_jobs
create policy "Users can view own video jobs" on public.video_jobs
  for select using (auth.uid() = user_id);

create policy "Users can insert own video jobs" on public.video_jobs
  for insert with check (auth.uid() = user_id);

create policy "Users can update own video jobs" on public.video_jobs
  for update using (auth.uid() = user_id);

create policy "Users can delete own video jobs" on public.video_jobs
  for delete using (auth.uid() = user_id);

-- Function to auto-create settings and usage_stats on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.settings (user_id) values (new.id);
  insert into public.usage_stats (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call function on new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
