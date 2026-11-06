-- Quizamily : schéma initial
-- Voir docs/data-model.md pour la description du modèle.

create extension if not exists pgcrypto;

-- ---------- families ----------

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table families enable row level security;

-- ---------- persons ----------

create table persons (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kind text not null check (kind in ('player', 'profile', 'referenced')),
  user_id uuid references auth.users(id),
  display_name text not null,
  relationship_label text,
  gender text check (gender in ('homme', 'femme')),
  is_central boolean not null default false,
  is_deceased boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index persons_family_id_idx on persons(family_id);
create index persons_user_id_idx on persons(user_id);

alter table persons enable row level security;

-- ---------- relationships ----------

create table relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  person_a_id uuid not null references persons(id) on delete cascade,
  person_b_id uuid not null references persons(id) on delete cascade,
  relation_type text not null check (relation_type in ('parent_of', 'spouse_of')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (person_a_id <> person_b_id)
);

create index relationships_family_id_idx on relationships(family_id);
create index relationships_person_a_id_idx on relationships(person_a_id);
create index relationships_person_b_id_idx on relationships(person_b_id);

alter table relationships enable row level security;

-- ---------- invites ----------

create table invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references auth.users(id),
  expires_at timestamptz,
  used_by_person_id uuid references persons(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index invites_family_id_idx on invites(family_id);

alter table invites enable row level security;

-- ---------- question_templates ----------
-- Catalogue global édité par nous (pas par les familles). Source : docs/question-templates.toml

create table question_templates (
  id text primary key,
  category text not null,
  status text not null default 'mvp' check (status in ('mvp', 'plus_tard', 'a_trancher', 'ecartee')),
  template_text text not null,
  answer_input_kind text not null check (
    answer_input_kind in ('date', 'year', 'age', 'number', 'country', 'city', 'place', 'first_name', 'list', 'free_text')
  ),
  list_name text,
  related_role text,
  slots jsonb,
  condition text,
  note text,
  created_at timestamptz not null default now()
);

-- pas de RLS : catalogue public, en lecture pour tous les utilisateurs authentifiés (voir policies)

-- ---------- list_items ----------

create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_name text not null check (list_name in ('animaux', 'sports', 'voitures', 'metiers', 'films', 'personnalites')),
  value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  family_id uuid references families(id) on delete cascade,
  created_by_person_id uuid references persons(id),
  created_at timestamptz not null default now(),
  check ((status = 'pending' and family_id is not null) or (status = 'approved' and family_id is null))
);

create unique index list_items_approved_value_idx on list_items(list_name, lower(value)) where status = 'approved';
create unique index list_items_pending_value_idx on list_items(list_name, family_id, lower(value)) where status = 'pending';

alter table list_items enable row level security;

-- ---------- facts ----------

create table facts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  template_id text not null references question_templates(id),
  subject_person_id uuid not null references persons(id),
  related_person_id uuid references persons(id),
  slot_values jsonb,
  author_person_id uuid not null references persons(id),
  answer_value jsonb not null,
  answer_history jsonb not null default '[]',
  pending_correction jsonb,
  context_text text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create index facts_family_id_idx on facts(family_id);
create index facts_subject_person_id_idx on facts(subject_person_id);
create index facts_author_person_id_idx on facts(author_person_id);

-- un seul fait par combinaison template + sujet + personne liée + éléments choisis
-- (coalesce pour que deux faits sans related_person_id/slot_values soient bien comparés comme égaux)
create unique index facts_uniqueness_idx on facts (
  family_id,
  template_id,
  subject_person_id,
  coalesce(related_person_id::text, ''),
  coalesce(slot_values::text, '{}')
);

alter table facts enable row level security;

-- ---------- fact_attachments ----------

create table fact_attachments (
  id uuid primary key default gen_random_uuid(),
  fact_id uuid not null references facts(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio')),
  url text not null,
  author_person_id uuid not null references persons(id),
  created_at timestamptz not null default now()
);

create index fact_attachments_fact_id_idx on fact_attachments(fact_id);

alter table fact_attachments enable row level security;

-- ---------- quiz_sessions ----------

create table quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index quiz_sessions_family_id_idx on quiz_sessions(family_id);

alter table quiz_sessions enable row level security;

-- ---------- quiz_questions ----------

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  fact_id uuid not null references facts(id),
  answer_value_snapshot jsonb not null,
  validator_person_id uuid references persons(id),
  validation_completed_at timestamptz,
  taken_over_at timestamptz,
  created_at timestamptz not null default now()
);

create index quiz_questions_session_id_idx on quiz_questions(session_id);
create index quiz_questions_fact_id_idx on quiz_questions(fact_id);

alter table quiz_questions enable row level security;

-- ---------- question_recipients ----------

create table question_recipients (
  id uuid primary key default gen_random_uuid(),
  quiz_question_id uuid not null references quiz_questions(id) on delete cascade,
  person_id uuid not null references persons(id),
  answer_given jsonb,
  result text not null default 'unanswered' check (
    result in ('correct', 'incorrect', 'unanswered', 'voided', 'pending_validation')
  ),
  answered_at timestamptz,
  validated_by_person_id uuid references persons(id),
  validated_at timestamptz,
  unique (quiz_question_id, person_id)
);

create index question_recipients_quiz_question_id_idx on question_recipients(quiz_question_id);
create index question_recipients_person_id_idx on question_recipients(person_id);

alter table question_recipients enable row level security;

-- ---------- fact_reactions ----------

create table fact_reactions (
  id uuid primary key default gen_random_uuid(),
  fact_id uuid not null references facts(id) on delete cascade,
  person_id uuid not null references persons(id),
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (fact_id, person_id, emoji)
);

create index fact_reactions_fact_id_idx on fact_reactions(fact_id);

alter table fact_reactions enable row level security;

-- ---------- fact_comments ----------

create table fact_comments (
  id uuid primary key default gen_random_uuid(),
  fact_id uuid not null references facts(id) on delete cascade,
  person_id uuid not null references persons(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index fact_comments_fact_id_idx on fact_comments(fact_id);

alter table fact_comments enable row level security;
