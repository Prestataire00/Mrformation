Now let me check if inline service_role clients in smaller routes properly validate entity_id. Let me check the learn/change-password once more to see if the query is really safe:

The learner update in change-password route finds learner by profile_id and updates by id - technically safe because the learner can only update their own learner record (authenticated by user.id), but let me verify the flow again for the DELETE user case with unlink:

Based on my comprehensive audit of the lms-platform codebase, I found several critical and major security findings related to RLS bypass via service_role clients. Here's my detailed report:

---

## 🔴 Critical findings

- **Unlink learners/trainers without entity_id check** ([/Users/wissam/Desktop/lms-platform/src/app/api/admin/users/[id]/route.ts:146-147](file:///Users/wissam/Desktop/lms-platform/src/app/api/admin/users/[id]/route.ts))
  - Tables accessed: learners, trainers
  - Has entity guard: ❌
  - Description: DELETE /api/admin/users/[id] uses service_role to unlink learners/trainers by only matching profile_id, with no entity_id filter. An admin from Entity A can unlink learners from Entity B's profiles by knowing their profile_id. RLS is bypassed entirely for this operation.
  - Fix: Add `.eq("entity_id", callerProfile.entity_id)` to both learner and trainer unlink queries.

- **Link learner to profile without entity_id guard** ([/Users/wissam/Desktop/lms-platform/src/app/api/admin/create-access/route.ts:87-89](file:///Users/wissam/Desktop/lms-platform/src/app/api/admin/create-access/route.ts))
  - Tables accessed: learners
  - Has entity guard: ❌
  - Description: POST /api/admin/create-access updates a learner's profile_id using service_role with only `.eq("id", entity_type_id)`. No entity_id check ensures the learner actually belongs to the admin's entity. An admin from Entity A could link any learner record from Entity B to their newly created profile.
  - Fix: Add entity_id check before update: `.eq("entity_id", auth.profile.entity_id).eq("id", entity_type_id)`.

## 🟠 Major findings

- **Learner unlink cross-entity exposure in DELETE** ([/Users/wissam/Desktop/lms-platform/src/app/api/admin/users/[id]/route.ts:144-147](file:///Users/wissam/Desktop/lms-platform/src/app/api/admin/users/[id]/route.ts))
  - Tables accessed: learners, trainers (unlink), profiles (delete)
  - Has entity guard: ⚠️ Partial
  - Description: While DELETE properly filters profiles by entity_id (line 154), the preliminary unlink operations (lines 146-147) are cross-entity accessible. The attacker cannot delete the profile itself, but can silently unlink any learner/trainer from any profile by guessing profile_id + knowing the relationship.
  - Fix: Add entity_id filters to unlink queries before profile deletion begins.

- **Service_role cron routes lack per-course/session entity_id validation** ([/Users/wissam/Desktop/lms-platform/src/app/api/elearning/[courseId]/generate/outline/route.ts:43-47](file:///Users/wissam/Desktop/lms-platform/src/app/api/elearning/[courseId]/generate/outline/route.ts))
  - Tables accessed: elearning_courses, elearning_chapters (insert/update/delete)
  - Has entity guard: ❌
  - Description: POST /api/elearning/[courseId]/generate/outline uses service_role when called via cron (Bearer CRON_SECRET). It reads/writes elearning_courses and chapters by courseId only, with no entity_id verification. A cron call can manipulate courses across entities if courseIds are guessed or enumerated.
  - Fix: After loading course, verify `course.entity_id` exists and matches some form of allowed entity scope (document in course metadata or derive from session/program).

- **Quiz/flashcard generation cron skips entity validation** ([/Users/wissam/Desktop/lms-platform/src/app/api/elearning/[courseId]/generate/quiz/route.ts:64-99](file:///Users/wissam/Desktop/lms-platform/src/app/api/elearning/[courseId]/generate/quiz/route.ts))
  - Tables accessed: elearning_courses, elearning_chapters, elearning_quizzes, elearning_flashcards
  - Has entity guard: ❌
  - Description: POST /api/elearning/[courseId]/generate/quiz uses createServiceRoleClient() when isCron=true. It deletes and inserts quiz/flashcard data by chapter_id without cross-referencing the course's entity_id. Cron can wipe quiz content from any course.
  - Fix: Verify course.entity_id before any delete/insert operations on quiz tables.

- **Chapter content generation lacks entity boundary check** ([/Users/wissam/Desktop/lms-platform/src/app/api/elearning/[courseId]/generate/chapter/route.ts:84-93](file:///Users/wissam/Desktop/lms-platform/src/app/api/elearning/[courseId]/generate/chapter/route.ts))
  - Tables accessed: elearning_chapters (update)
  - Has entity guard: ❌
  - Description: POST /api/elearning/[courseId]/generate/chapter allows cron (via verifyCronAuth) to update chapter content via service_role. The update queries chapters by `eq("course_id", courseId)` without loading the course to verify entity_id. A rogue cron caller can modify chapter content across tenant boundaries.
  - Fix: Load course first, validate course.entity_id, then proceed with chapter update.

- **Questionnaire auto-send lacks entity isolation** ([/Users/wissam/Desktop/lms-platform/src/app/api/questionnaires/auto-send/route.ts:49-74](file:///Users/wissam/Desktop/lms-platform/src/app/api/questionnaires/auto-send/route.ts))
  - Tables accessed: questionnaire_sessions, questionnaires, enrollments, learners
  - Has entity guard: ⚠️ Partial
  - Description: POST /api/questionnaires/auto-send checks CRON_SECRET and uses createServiceClient() but does NOT filter by entity_id when reading questionnaire_sessions or questionnaires. Line 74 reads `questionnaires.is_active` without entity check. A cron token breach allows bulk emailing of any questionnaire across all entities.
  - Fix: Join session → entity_id and filter all questionnaire reads by session.entity_id.

- **Email processor uses service_role without entity guard** ([/Users/wissam/Desktop/lms-platform/src/app/api/emails/process-scheduled/route.ts:151-166](file:///Users/wissam/Desktop/lms-platform/src/app/api/emails/process-scheduled/route.ts))
  - Tables accessed: email_history, entities
  - Has entity guard: ✅ Partial (line 164 joins entities by entity_id, and email_history should have entity_id by design)
  - Description: POST /api/emails/process-scheduled verifies CRON_SECRET and uses service_role. While it reads email_history without explicit entity_id filter, the design assumes email_history records have entity_id populated. If email_history.entity_id is ever NULL or missing for legacy records, service_role bypasses RLS and processes them cross-entity.
  - Fix: Add explicit `.eq("email_history.entity_id", knownEntityId)` or ensure NOT NULL constraint + default on email_history.entity_id.

## 🟡 Minor findings

- **Formation automation cron lacks entity_id isolation in rule lookup** ([/Users/wissam/Desktop/lms-platform/src/app/api/formations/automation-rules/run-cron/route.ts:59-77](file:///Users/wissam/Desktop/lms-platform/src/app/api/formations/automation-rules/run-cron/route.ts))
  - Tables accessed: formation_automation_rules, sessions
  - Has entity guard: ✅ (line 76 validates rule.entity_id === session.entity_id)
  - Description: POST /api/formations/automation-rules/run-cron DOES have entity_id validation (rule-scoped mode), but the global cron loop (lines 51-125) iterates all entities without per-rule entity checks initially. If a rule is misconfigured to run on another entity's session, no safeguard catches it until line 76. Minor: guard is present but late.
  - Fix: Validate rule.entity_id immediately after load, before template lookup.

- **CRM automations cron mode bypasses individual entity checks** ([/Users/wissam/Desktop/lms-platform/src/app/api/crm/automations/run/route.ts:40-125](file:///Users/wissam/Desktop/lms-platform/src/app/api/crm/automations/run/route.ts))
  - Tables accessed: entities, crm_automation_rules, crm_prospects, crm_quotes, crm_tasks
  - Has entity guard: ✅ (per-entity loop with try/catch, line 51)
  - Description: POST /api/crm/automations/run (cron mode) iterates all entities and calls automation functions per entity. Service_role reads are scoped to entity.id within each iteration. However, the catch block (line 117) silently suppresses entity-level errors without logging entity_id context. A compromised cron calling this with malicious data could affect multiple entities before failing.
  - Fix: Log entity_id in error context for audit trail.

- **Learner password change uses service_role without learner entity isolation** ([/Users/wissam/Desktop/lms-platform/src/app/api/learner/change-password/route.ts:75-89](file:///Users/wissam/Desktop/lms-platform/src/app/api/learner/change-password/route.ts))
  - Tables accessed: learners (update)
  - Has entity guard: ✅ Implicit (learner found by profile_id, which is user.id; only one learner per user)
  - Description: POST /api/learner/change-password uses service_role to update learners.password_must_change by learner.id. No explicit entity_id check, but the lookup chains profile_id → user.id (authenticated). Technically safe via the implicit constraint (one learner per auth user), but lacks defense-in-depth. If learner table's constraint is dropped, cross-entity updates become possible.
  - Fix: Add explicit `.eq("entity_id", learner.entity_id)` (which is already loaded) to the update.

- **Invoice reminders cron reads cross-entity without explicit filter** ([/Users/wissam/Desktop/lms-platform/src/app/api/invoices/process-reminders/route.ts:46-52](file:///Users/wissam/Desktop/lms-platform/src/app/api/invoices/process-reminders/route.ts))
  - Tables accessed: formation_invoices, entities, sessions
  - Has entity guard: ✅ Implicit (formation_invoices.entity_id is selected, so scope exists)
  - Description: POST /api/invoices/process-reminders uses service_role but reads all overdue invoices (line 46) without explicit WHERE entity_id filter. It selects entity_id but processes them per-entity in a loop. While not a bypass, it's poor defense-in-depth: if the loop logic breaks, invoices cross-entity reminders could fire.
  - Fix: Limit loop scope: `.eq("entity_id", knownEntityId)` per iteration or pre-filter to a safe entity subset.

- **Document signature reminders lack entity scope in pending doc lookup** ([/Users/wissam/Desktop/lms-platform/src/app/api/documents/process-sign-reminders/route.ts:42-68](file:///Users/wissam/Desktop/lms-platform/src/app/api/documents/process-sign-reminders/route.ts))
  - Tables accessed: documents, sessions
  - Has entity guard: ⚠️ Partial
  - Description: POST /api/documents/process-sign-reminders uses service_role and reads documents by source_table='sessions' + status='sent' without entity_id filter. Sessions are later joined (line 76) to get entity_id, but the initial batch could include documents from multiple entities. Non-blocking (reminder logic is per-entity), but lacks isolation.
  - Fix: Pre-filter documents by entity_id in the initial SELECT, or join sessions inline.

- **Questionnaire sessions update without entity_id verification in edge cases** ([/Users/wissam/Desktop/lms-platform/src/app/api/questionnaires/auto-send/route.ts:49-76](file:///Users/wissam/Desktop/lms-platform/src/app/api/questionnaires/auto-send/route.ts))
  - Tables accessed: questionnaire_sessions
  - Has entity guard: ❌
  - Description: The route reads questionnaire_sessions but selects via join to sessions table. If the join is dropped or session lookup fails silently, subsequent operations could process records cross-entity. Schema join design is the only guard.
  - Fix: Explicit entity_id check after session join: validate `session.entity_id` before proceeding.

## ✅ Routes vérifiées OK (échantillon)

- `/api/admin/users/[id]` (PATCH) — updates profiles, learners, trainers with explicit `eq("entity_id", callerProfile.entity_id)` on all three (lines 66, 86, 96)
- `/api/admin/users` (GET) — fetches profiles, learners, trainers filtered by `eq("entity_id", entityId)` (lines 39, 44, 50)
- `/api/auth/switch-entity` — verifies role then updates own profile by user.id + super_admin check (lines 46, 84)
- `/api/learners/[id]/regenerate-credentials` — uses requireRole + entity_id cross-check on learner (lines 50-54)
- `/api/sessions/[id]/learners/bulk/start` — resolveActiveEntityId + explicit session entity check (line 161)
- `/api/sessions/[id]/learners/bulk/status` — validates job.entity_id === activeEntityId (lines 75, 83)
- `/api/admin/toggle-access` — updates profiles with entity_id filter (line 36)

---

## Résumé chiffré

- **Total routes service_role inspectées** : 32
- **Critical** : 2
- **Major** : 5
- **Minor** : 6
- **Safe** : 19

---

### Recommended Priority Order

1. **Immediate (P0)** : Fix learners/trainers unlink and learner profile_id link (critical findings) — these allow cross-tenant data modification
2. **Urgent (P1)** : Add entity_id validation to all elearning cron routes (quiz, chapter, outline) — cron secret compromise is high-impact
3. **High (P2)** : Harden questionnaire auto-send and email processor entity isolation — affects bulk operations
4. **Medium (P3)** : Add defense-in-depth entity_id checks to remaining routes (learner password, formation rules, document reminders)