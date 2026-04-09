# Claude Code Orchestration & Subagent Management Rules

**For Claude Code agents coordinating KIS-TOiR generation. This file is mandatory when delegating to subagents.**

This document complements `AGENTS.md` with Claude-specific patterns and MCP/subagent governance.

---

## Subagent Model

KIS-TOiR uses **Claude Agent SDK subagents** — specialized agents defined programmatically in `agents/definitions.ts` and coordinated via `tools/orchestrator.ts`.

### Subagent Registry

All subagents:
- Load instructions from `.claude/agents/*.toml` configuration files
- Share access to project-local MCP servers (github, context7, exa, memory, playwright, sequential-thinking)
- Operate under strict write-zone enforcement
- Report results back to the orchestrator for acceptance/rejection

| Agent | Purpose | Sandbox | Model |
|-------|---------|---------|-------|
| `explorer` | Codebase discovery & exploration | read-only | haiku |
| `docs_researcher` | Framework docs verification | read-only | haiku |
| `generator_prisma` | Prisma schema generation | workspace-write | opus |
| `generator_nest_resources` | NestJS backend generation | workspace-write | opus |
| `generator_react_admin_resources` | React Admin generation | workspace-write | opus |
| `generator_data_access` | Frontend data-access integration | workspace-write | opus |
| `reviewer` | Final artifact review | read-only | sonnet |

### How Agents Are Invoked

Subagents are **not manually called by name**. Instead:

1. **Claude reads agent descriptions** from `agents/definitions.ts`
2. **Claude matches task intent to agent description** — e.g., "generate the Prisma schema" → matches `generator_prisma`
3. **Claude invokes via the `Agent` tool** — which must be in `allowedTools`
4. **Subagent receives full prompt context** — including frozen contract, DSL, and sandbox restrictions

**Example trigger pattern:**
```
"The frozen contract specifies these entities: [DSL slice].
Use the generator_prisma agent to generate server/prisma/schema.prisma."
```

Claude will automatically recognize `generator_prisma` and invoke it with its bounded instructions.

---

## Orchestrator Responsibilities

The **orchestrator** (main Claude agent running in Claude Code) owns:

1. **Discovery** — Use `explorer` to understand current workspace state
2. **Docs Verification** — Use `docs_researcher` to verify framework behavior
3. **Contract Freeze** — Produce explicit normalized contract before generator delegation
4. **Specialized Delegation** — Delegate bounded work to each generator after contract freeze
5. **Acceptance/Rejection** — Explicit accept/reject of delegated outputs based on:
   - Write-zone compliance (did it only touch allowed files?)
   - Contract adherence (does output match frozen contract?)
   - Integration readiness (is it ready for parent integration?)
6. **Integration** — Wire accepted outputs into shared platform seams
7. **Validation** — Run both gates before claiming completion:
   - `node tools/validate-generation.mjs --artifacts-only`
   - `npm run eval:generation`
8. **Final Review** — Hand off to `reviewer` agent only after validation passes

---

## Mandatory Delegation Workflow

### Phase 1: Discovery & Docs Verification

**Who:** Orchestrator + `explorer` + `docs_researcher`

**When:** At session start, before any generation planning

**Triggers:**
```
"Use the explorer agent to scan the repository structure and identify:
- Current workspace state (do server/ and client/ exist?)
- Existing registrations in app.module.ts and App.tsx
- Current schema.prisma and data layer shape
- Existing auth/runtime/deploy artifacts"
```

**Expected output:**
- Clear picture of what exists and what is missing
- Identified registration seams
- Current scaffold health

### Phase 2: Contract Freeze

**Who:** Orchestrator only

**When:** After discovery, before any specialized generator starts

**Process:**
1. Extract entity-scoped DSL slices from `domain/toir.api.dsl`
2. Read relevant prompt docs (prisma-rules.md, backend-rules.md, etc.)
3. Produce normalized contract covering:
   - Entities and fields
   - Types and nullability
   - IDs and composite keys
   - Relations
   - Enums
   - Endpoint conventions
   - Write-zones per generator

**Critical:** Do not skip this step. Generators depend on an explicit frozen contract.

### Phase 3: Parallel Specialized Generation

**Who:** Orchestrator delegates to specialized generators

**Conditions:**
- Contract must be frozen and explicit
- Each generator must receive clear write-zone boundaries
- Parent must be ready to accept/reject each output

**Delegation examples:**

```
"The frozen contract specifies entities: [list].
Use the generator_prisma agent to generate server/prisma/schema.prisma.
Write-zone: server/prisma/schema.prisma ONLY.
Frozen contract: [explicit contract structure]"
```

```
"The frozen contract specifies the ChangeEquipmentStatus resource: [details].
Use the generator_nest_resources agent to generate the NestJS backend module.
Write-zone: server/src/modules/change-equipment-status/ ONLY.
Frozen contract: [details]"
```

### Phase 4: Acceptance & Integration

**Who:** Orchestrator

**Process:**
1. Examine delegated output against write-zones (did it only touch allowed files?)
2. Check contract adherence (does it match frozen contract?)
3. Explicit accept or reject
4. If rejected: allow ONE bounded repair pass from the generator
5. If still rejected: use manual fallback (not silent continuation)
6. Integrate accepted outputs into shared platform seams

**Acceptance checklist:**
- ✅ Only allowed write-zones changed
- ✅ No cross-layer edits outside delegated zone
- ✅ Output matches frozen contract
- ✅ Output is integration-ready
- ✅ No unresolved issues

### Phase 5: Validation & Final Review

**Who:** Orchestrator + `reviewer`

**Gates (both must pass):**
```bash
node tools/validate-generation.mjs --artifacts-only
npm run eval:generation
```

**Process:**
1. Run both validation gates
2. If either fails: surface the failure explicitly
3. Allow ONE bounded repair from relevant generator
4. Use `reviewer` agent to check final artifact quality
5. Only claim completion when reviewer signoff + both gates pass

---

## MCP Tool Access

All agents share access to these MCP servers:

| Server | Use for | When |
|--------|---------|------|
| **github** | PR context, repo history, issue links | When parent needs remote context |
| **context7** | Official NestJS, Prisma, React Admin, Vite, Docker, Keycloak/OIDC/JWT docs | Before framework-sensitive planning |
| **exa** | Web search for current behavior, release notes, breaking changes | Only after Context7 is insufficient |
| **memory** | Persistent cross-session notes (use sparingly) | For durable repo context only |
| **playwright** | Browser automation for UI/runtime verification | When read-only code inspection is insufficient |
| **sequential-thinking** | Structured multi-step reasoning for complex issues | For ambiguous conflicts or multi-finding investigations |

**Tool-order policy:**
1. Local authoritative files (domain/*.api.dsl, prompts/*.md, AGENTS.md)
2. Context7 official docs
3. Web fallback (exa)
4. Validation gates

---

## Write-Zone Enforcement

**Authoritative source: `AGENTS.md` §Write-zone ownership.** The table below is an operational quick-reference; if it ever conflicts with `AGENTS.md`, `AGENTS.md` wins.

**Critical rule:** Generators are sandboxed to specific write-zones. Violating these boundaries is grounds for rejection.

| Agent | Allowed Write Zones | Forbidden |
|-------|-------|----------|
| `generator_prisma` | `server/prisma/schema.prisma` | Everything else |
| `generator_nest_resources` | `server/src/modules/<entity>/`, optionally `server/src/app.module.ts` | `server/src/auth/`, client/**, prisma, deploy, prompts |
| `generator_react_admin_resources` | `client/src/resources/<entity>/` | `client/src/auth/`, `client/src/dataProvider.ts`, server/**, deploy, prompts |
| `generator_data_access` | Narrowly delegated parts of `client/src/dataProvider.ts` | Broad dataProvider rewrites, client resources, server/**, auth, deploy |
| `reviewer` | READ-ONLY; may propose patches but not write | All files (read-only mode only) |

**Parent-owned zones (never delegated):**
- `server/src/auth/`, `client/src/auth/`
- `docker-compose.yml`, `server/Dockerfile`, `client/Dockerfile`, `client/nginx/default.conf`
- `server/.env.example`, `client/.env.example`, `toir-realm.json`
- `prompts/*.md`, `AGENTS.md`, `domain/*.api.dsl`, `tools/`

---

## Failure Handling

### If a Subagent Output Is Rejected

1. **Be explicit:** Quote the specific contract violation or write-zone breach
2. **Allow one bounded repair:** "Generator X, repair this specific issue: [issue]. Retry with this constraint: [constraint]."
3. **If repair fails:** Explicitly reject and fall back to manual implementation
4. **Never silently continue:** Do not pretend partial delegated work is complete

### If Validation Gates Fail

1. **Surface the failure:** Show the exact validation error
2. **Diagnosis:** Is it a generation defect or a missing artifact?
3. **One bounded repair:** Delegate ONE targeted fix to the relevant generator
4. **If still failing:** Do not claim completion; flag for manual review

### If Conflict Between Delegated Output and DSL

1. **Trust the DSL first** — it is Tier 1 source of truth
2. **Surface the conflict explicitly** to the generator
3. **Reject if unfixable** — do not rationalize away DSL violations

---

## Shallow Delegation Pattern

**One responsibility per agent.** Do not:
- Ask a generator to redesign shared platform seams
- Ask explorer to also generate code
- Mix responsibilities (e.g., "generate Prisma AND wire it into app.module")

**Instead:**
- `generator_prisma` owns schema.prisma only
- Orchestrator owns app.module.ts wiring and imports
- `generator_nest_resources` owns module internals
- Orchestrator owns module registration in app.module.ts

This keeps agent context small and failure modes isolated.

---

## Orchestrator Anti-Patterns

❌ **Don't:**
1. Write code yourself when a generator exists for that task
2. Skip contract freeze before delegating to generators
3. Silently accept partial/broken delegated work
4. Let generators redesign shared auth, runtime, or deploy seams
5. Skip validation gates as proof of completion
6. Use broad generators when specialized agents exist
7. Delegate without explicit write-zone boundaries

✅ **Do:**
1. Use agents intentionally for their specific responsibilities
2. Freeze contract explicitly before any generator starts
3. Examine and explicitly accept/reject each delegated output
4. Run validation gates before final handoff
5. Report completion only when gates pass + reviewer signoff
6. Keep delegation shallow (one primary responsibility)
7. Document acceptance/rejection reasons

---

## Example: Full Delegation Cycle

```
ORCHESTRATOR: Read domain/toir.api.dsl. I'll generate ChangeEquipmentStatus.

↓ [Discovery]
ORCHESTRATOR → explorer agent
"Explore server/src/modules/ and client/src/resources/ to see what exists."
← explorer returns: No change-equipment-status module exists yet

↓ [Docs Verification]
ORCHESTRATOR → docs_researcher agent
"Verify NestJS composite key patterns and React Admin resource conventions."
← docs_researcher confirms current best practices

↓ [Contract Freeze - orchestrator only]
ORCHESTRATOR (to itself):
"Frozen contract:
- Entity: ChangeEquipmentStatus
- Fields: equipmentId (ref), newStatus (enum), date (datetime)
- Composite key: (equipmentId, newStatus)
- Endpoints: [list]
- Write-zones: server/src/modules/change-equipment-status/ only"

↓ [Delegation: Prisma]
ORCHESTRATOR → generator_prisma agent
"Generate schema.prisma with ChangeEquipmentStatus model.
Frozen contract: [details]. Write-zone: server/prisma/schema.prisma ONLY."
← generator_prisma returns schema changes

ORCHESTRATOR reviews output:
"✅ Only schema.prisma changed. No app.module.ts touched. Matches contract. ACCEPT."

↓ [Delegation: NestJS Backend]
ORCHESTRATOR → generator_nest_resources agent
"Generate NestJS module for ChangeEquipmentStatus.
Frozen contract: [details]. Write-zone: server/src/modules/change-equipment-status/ ONLY.
Do NOT touch app.module.ts registration."
← generator_nest_resources returns controller, service, DTOs

ORCHESTRATOR reviews output:
"✅ Only module/ directory touched. No app.module edits. Matches contract. ACCEPT."

↓ [Parent Integration]
ORCHESTRATOR (to itself):
"Now I wire the accepted module into app.module.ts imports and controller registration."

↓ [Delegation: React Admin Frontend]
ORCHESTRATOR → generator_react_admin_resources agent
"Generate React Admin resources for ChangeEquipmentStatus.
Frozen contract: [details]. Write-zone: client/src/resources/change-equipment-status/ ONLY."
← generator_react_admin_resources returns List, Create, Edit, Show components

ORCHESTRATOR reviews output:
"✅ Only resources/ directory touched. Matches contract. ACCEPT."

↓ [Parent Integration]
ORCHESTRATOR (to itself):
"Now I wire the accepted resources into client/src/App.tsx."

↓ [Validation]
ORCHESTRATOR (to itself):
```bash
node tools/validate-generation.mjs --artifacts-only
npm run eval:generation
```
Result: ✅ Both pass

↓ [Final Review]
ORCHESTRATOR → reviewer agent
"Review the ChangeEquipmentStatus implementation for quality, security, DSL fidelity."
← reviewer returns findings and signoff

ORCHESTRATOR (to itself):
"Reviewer signoff ✅, validation gates ✅, all success criteria met.
Claiming ChangeEquipmentStatus generation COMPLETE."
```

---

## Session Handoff Protocol

When handing off work between Claude Code sessions:

1. **Memory capsule:** Use the `memory` MCP server sparingly to capture:
   - Current frozen contract status
   - Which generators have been accepted/rejected and why
   - Current validation gate status
   - Identified next steps

2. **Explicit state:** Do not assume previous session context. Restart discovery if uncertain.

3. **Validation continuity:** Do not skip gates just because "the previous session said it was done."

---

## Companion Documents

These documents are referenced by specialized agents:

- **Agents**: `.claude/CLAUDE.md` (Claude-specific agent governance)
- **General orchestration**: `prompts/general-prompt.md`
- **Prisma rules**: `prompts/prisma-rules.md` (for `generator_prisma`)
- **Backend rules**: `prompts/backend-rules.md` (for `generator_nest_resources`)
- **Frontend rules**: `prompts/frontend-rules.md` (for `generator_react_admin_resources`)
- **Auth rules**: `prompts/auth-rules.md` (for orchestrator + auth seams)
- **Runtime rules**: `prompts/runtime-rules.md` (for orchestrator + deploy seams)
- **Validation rules**: `prompts/validation-rules.md` (for validation gates)

When delegating to any agent, ensure they can read relevant companion docs.
