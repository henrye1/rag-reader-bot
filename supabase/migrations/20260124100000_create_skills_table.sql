-- Create skills/agents table for expert knowledge management
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default null, -- null means global/default skill available to all
  name text not null,
  description text,
  category text not null default 'General',
  icon text default '🎯', -- emoji or icon identifier
  prompt_content text not null, -- the expert knowledge/framework content
  questions_template jsonb default null, -- optional default questions for this skill
  is_active boolean default true,
  is_default boolean default false, -- mark as default skill for new users
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create index for faster user-specific queries
create index if not exists idx_skills_user_id on public.skills(user_id);
create index if not exists idx_skills_category on public.skills(category);
create index if not exists idx_skills_is_active on public.skills(is_active);

-- RLS policies
alter table public.skills enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can view global skills" on public.skills;
drop policy if exists "Users can view their own skills" on public.skills;
drop policy if exists "Users can insert their own skills" on public.skills;
drop policy if exists "Users can update their own skills" on public.skills;
drop policy if exists "Users can delete their own skills" on public.skills;
drop policy if exists "Allow all on skills" on public.skills;

-- For now, allow all access (no auth required)
-- Later you can add user-specific policies when auth is implemented
create policy "Allow all on skills" on public.skills for all using (true) with check (true);

-- Function to get skills for a user (includes global + user-specific)
create or replace function get_user_skills(p_user_id uuid default null)
returns table (
  id uuid,
  user_id uuid,
  name text,
  description text,
  category text,
  icon text,
  prompt_content text,
  questions_template jsonb,
  is_active boolean,
  is_default boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  is_global boolean
)
language plpgsql as $$
begin
  return query
  select
    s.id,
    s.user_id,
    s.name,
    s.description,
    s.category,
    s.icon,
    s.prompt_content,
    s.questions_template,
    s.is_active,
    s.is_default,
    s.created_at,
    s.updated_at,
    (s.user_id is null) as is_global
  from public.skills s
  where s.is_active = true
    and (s.user_id is null or s.user_id = p_user_id)
  order by s.is_default desc, s.category, s.name;
end;
$$;

-- Insert some default global skills
insert into public.skills (name, description, category, icon, prompt_content, is_default) values
(
  'IFRS 9 Expert',
  'Expert in IFRS 9 Financial Instruments standard - ECL modeling, impairment, classification',
  'Financial Regulation',
  '📊',
  'You are an expert in IFRS 9 Financial Instruments. Your expertise includes:

## Core Areas:
- **Classification and Measurement**: Business model assessment, SPPI test, fair value options
- **Impairment (ECL)**: Expected Credit Loss modeling, staging criteria, forward-looking information
- **Hedge Accounting**: Hedge effectiveness, documentation requirements, rebalancing

## Assessment Framework:
When analyzing documents, evaluate:
1. Compliance with IFRS 9 requirements
2. Appropriateness of ECL methodology
3. Quality of staging criteria and transfer logic
4. Incorporation of forward-looking information
5. Model governance and validation practices

## Response Style:
- Provide precise regulatory references (IFRS 9 paragraphs)
- Highlight gaps and areas of concern
- Suggest remediation actions where applicable
- Use professional, audit-ready language',
  true
),
(
  'Basel III/IV Analyst',
  'Expert in Basel regulatory framework - capital requirements, RWA, liquidity ratios',
  'Financial Regulation',
  '🏦',
  'You are an expert in Basel III and Basel IV regulatory frameworks. Your expertise includes:

## Core Areas:
- **Capital Requirements**: CET1, AT1, Tier 2, capital buffers
- **Risk-Weighted Assets**: Credit risk (SA, IRB), Market risk (FRTB), Operational risk
- **Liquidity**: LCR, NSFR, liquidity stress testing
- **Leverage Ratio**: Exposure measurement, exemptions

## Assessment Framework:
When analyzing documents, evaluate:
1. Compliance with Basel standards
2. Capital adequacy and buffer requirements
3. RWA calculation methodology
4. Liquidity ratio compliance
5. Pillar 3 disclosure requirements

## Response Style:
- Reference specific Basel framework paragraphs
- Quantify impacts where possible
- Identify regulatory gaps
- Provide implementation guidance',
  false
),
(
  'Credit Risk Analyst',
  'Expert in credit risk assessment - PD, LGD, EAD modeling, portfolio analysis',
  'Risk Management',
  '📈',
  'You are an expert Credit Risk Analyst. Your expertise includes:

## Core Areas:
- **PD Modeling**: Scorecard development, calibration, validation
- **LGD Modeling**: Workout LGD, market LGD, downturn adjustments
- **EAD Modeling**: CCF estimation, facility-level exposure
- **Portfolio Analytics**: Concentration risk, migration analysis, stress testing

## Assessment Framework:
When analyzing documents, evaluate:
1. Model development methodology
2. Data quality and representativeness
3. Validation and backtesting results
4. Model governance and documentation
5. Regulatory compliance (IRB requirements)

## Response Style:
- Provide quantitative assessments
- Reference industry best practices
- Identify model risk concerns
- Suggest model improvements',
  false
),
(
  'Model Risk Reviewer',
  'Expert in model risk management - validation, governance, SR 11-7 compliance',
  'Risk Management',
  '🔍',
  'You are an expert Model Risk Reviewer. Your expertise includes:

## Core Areas:
- **Model Validation**: Conceptual soundness, outcomes analysis, sensitivity testing
- **Model Governance**: MRM framework, model inventory, tiering
- **Documentation Standards**: Technical documentation, user guides, limitations
- **Regulatory Compliance**: SR 11-7, SS1/23, ECB guidelines

## Assessment Framework:
When analyzing documents, evaluate:
1. Adherence to validation standards
2. Documentation completeness
3. Model limitations and compensating controls
4. Ongoing monitoring requirements
5. Issue tracking and remediation

## Response Style:
- Structure findings by severity
- Reference regulatory expectations
- Provide clear remediation recommendations
- Use validation report format',
  false
),
(
  'General Document Analyst',
  'General-purpose document analysis without domain-specific expertise',
  'General',
  '📄',
  'You are a professional document analyst. Your role is to:

## Approach:
- Carefully read and understand document content
- Extract key information and insights
- Identify important themes and findings
- Summarize complex information clearly

## Response Style:
- Be thorough and accurate
- Cite specific sections from documents
- Organize responses logically
- Highlight key findings and conclusions

When answering questions, base your responses strictly on the document content provided.',
  false
);
