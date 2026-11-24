-- clipvoice cache schema (Supabase / PostgreSQL)

create table if not exists transcripts (
  video_id      text primary key,
  source_lang   text,
  source        text not null check (source in ('captions', 'auto_captions', 'stt')),
  duration_s    real,
  segments      jsonb not null,            -- [{ index, start, end, original }]
  created_at    timestamptz not null default now()
);

create table if not exists translations (
  video_id      text not null references transcripts(video_id) on delete cascade,
  target_lang   text not null,
  translator    text not null,             -- e.g. 'gemini-2.5-flash', 'google-free'
  status        text not null default 'partial' check (status in ('partial', 'complete', 'failed')),
  chunks_done   int  not null default 0,
  total_chunks  int  not null,
  segments      jsonb not null default '[]'::jsonb,  -- [{ index, translated }]
  updated_at    timestamptz not null default now(),
  primary key (video_id, target_lang, translator)
);

create index if not exists translations_updated_idx on translations (updated_at desc);
