# Annotation batches

- Treat `selected-assets.jsonl` as pending feedback only, not a history of completed work. Never describe selected records as unfinished without checking their disposition.
- At the start of each review batch, snapshot its exact record fingerprints with `node tools/annotation-batch.js begin CAPTURE_DIR`. If a batch already exists, resume it; do not replace it.
- At the end of **every** batch, after fixes and verification, stop the annotator and run `node tools/annotation-batch.js finish CAPTURE_DIR`. Pass `--keep FINGERPRINT` for each unresolved or deferred note; never delete it merely to empty the queue. Notes added after the snapshot remain pending automatically.
- Verify and report the remaining pending count. Delete completed note text rather than retaining completed records, tombstones, raw-note archives, or backups. Keep only concise completion/test conclusions in focused working-note slices linked from a short index.
- Do not equate stopping the recorder with completing a batch. Do not start capture, poll Steam, or restart Steam for note cleanup.

# Theme palette discipline

- Theme text in shared rules using the dark palette first, including feedback found in light mode. Light mode swaps color roles; do not build separate component selector trees per mode.
- Keep foreground/background roles documented together in configDefaults.css under ATOMS COLORS. Active defaults stay dark. Distinguish page text from foregrounds paired with accent, artwork, and discount surfaces.

# Live Steam verification

- Use the existing running Steam remote-debugging connection for UI inspection and visual verification. Control the live Steam views; do not substitute a separate browser or temporary inspection targets.
- After each navigation, confirm the actual page palette before checking feedback reported in that mode. The debug palette can reset between pages. Leave that reset behavior alone unless explicitly asked to change it.

# My Clanker workflow for Codex

These are the user's standing working agreements across projects. Use repository-relative paths; this is not a requirement to install Open Clank.

## Audit, plan, then implement

1. The parent researches existing code and relevant references, makes judgment calls, and records findings as it goes.
2. Write a short metaplan linking implementation slices by concern and dependency. Each slice gives its outcome, scope/files, dependencies, owner/status, and meaningful acceptance criteria.
3. When planning first is requested, finish the audit, notes and concrete plan, summarize it, and ask permission to release implementation workers. Do not implement during that pass. Reuse approval already given.
4. Workers implement assigned slices; the parent coordinates dependencies, reviews and integrates results, and reports what changed, what was actually checked, and what remains. Implementation permission is not deployment permission.

## Solbots and model choice

- Solbots are implementation subagents. If 6.1 Solbots are requested, explicitly select `gpt-6.1-sol`.
- The user chooses whether a more expensive parent supervises cheaper workers. Do not autonomously switch models or introduce cheaper workers.
- Workers inherit the parent's model without an explicit model choice. Report an unavailable requested model instead of silently substituting. Read-only Luna workers require explicit authorization.
- Give workers bounded assignments, disjoint file ownership, relevant slice paths, and required return evidence. All follow these note rules. Prefer internal subagents to separate user-facing chats.

## Folder layout and notes

- Keep `.clanker/` private and Git-ignored. Use `.clanker/futures/<topic>.md` for a short metaplan and `.clanker/futures/<topic>/<concern>.md` for slices; use `.clanker/robonotes/<topic-or-mirrored-path>/00-index.md` and focused concern notes for findings and evidence.
- Put temporary external study in `.clanker/references/`, builds/screenshots/receipts/raw logs in `.clanker/artifacts/`, deliberately retired material in `.clanker/archive/`, and optional Open Clank policy configuration in `.clanker/hexes/`.
- Never force-add references or make application/build code depend on reference copies. Preserve durable conclusions with provenance and archive deliberately, preserving links; do not automatically delete old material.
- Use small coherent files with one concern per slice. Mirror source paths for local concerns and topic folders for cross-cutting work. Indexes contain current status, decisions, next steps and links, not entire investigations. Read the index and relevant slices when resuming. Update existing slices rather than duplicating detail.

## Continuity and discipline

- Resume existing tasks and the same workers after interruptions; resend unfinished assignments when needed. Do not replace them, redo finished work, silently switch models, or create automatic worker-restart loops. Report specific recovery failures. Explicit pauses persist until authorized to resume.
- Use one agreed integration branch. Give workers disjoint ownership; create extra branches/worktrees only when necessary and track integration and retirement. Preserve recoverable preimages. Do not claim consolidation without evidence.
- Run focused checks appropriate to changes; avoid sprawling or repeated passing checks. Distinguish implemented, checked, built, deployed and published.
- If this repository already uses Open Clank Hexes, run `openclank hex explain <path>` before project writes. Edit the canonical `.clanker/hexes/contract.yaml` and regenerate its digest with `openclank hex sync`; rule changes require owner authorization and executable hooks/checks need separate trust. Otherwise use AGENTS.md directly; do not invent a new policy stack.
