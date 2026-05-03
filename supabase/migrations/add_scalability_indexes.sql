-- ============================================================
-- Migration : Indexes critiques pour scalabilité 200+ users
-- ============================================================
-- Audit perf : 11 tables principales (enrollments, learners,
-- generated_documents, activity_log, profiles, etc.) n'ont
-- AUCUN index sur leurs colonnes les plus filtrées :
-- entity_id, session_id, learner_id, status, created_at.
--
-- À l'échelle prévue (200+ apprenants, 1000+ documents,
-- email_history qui croît en continu), les requêtes filtrées
-- entity_id + ORDER BY created_at vont faire des seq scans
-- → latence cumulative 300-500ms par page dashboard.
--
-- Tous les indexes sont en IF NOT EXISTS → migration idempotente.
-- ============================================================

-- ===== ENROLLMENTS (1 ligne par apprenant × session) =====
-- Croissance : ~ N_learners × N_sessions/year (ex: 200 × 50 = 10k/an)
CREATE INDEX IF NOT EXISTS idx_enrollments_session ON enrollments(session_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_learner ON enrollments(learner_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_session_learner ON enrollments(session_id, learner_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_session_status ON enrollments(session_id, status);

-- ===== LEARNERS (table centrale du LMS) =====
CREATE INDEX IF NOT EXISTS idx_learners_entity ON learners(entity_id);
CREATE INDEX IF NOT EXISTS idx_learners_entity_client ON learners(entity_id, client_id);
CREATE INDEX IF NOT EXISTS idx_learners_profile ON learners(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learners_entity_created ON learners(entity_id, created_at DESC);

-- ===== SESSIONS (filtres planning + dashboard) =====
CREATE INDEX IF NOT EXISTS idx_sessions_entity_start ON sessions(entity_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_entity_status ON sessions(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_training ON sessions(training_id);
CREATE INDEX IF NOT EXISTS idx_sessions_trainer ON sessions(trainer_id) WHERE trainer_id IS NOT NULL;

-- ===== TRAININGS (hub formations) =====
CREATE INDEX IF NOT EXISTS idx_trainings_entity_status ON trainings(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_trainings_entity_created ON trainings(entity_id, created_at DESC);

-- ===== TRAINERS =====
CREATE INDEX IF NOT EXISTS idx_trainers_entity ON trainers(entity_id);
CREATE INDEX IF NOT EXISTS idx_trainers_profile ON trainers(profile_id) WHERE profile_id IS NOT NULL;

-- ===== PROFILES (lookup auth + RBAC à chaque request middleware) =====
CREATE INDEX IF NOT EXISTS idx_profiles_entity ON profiles(entity_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ===== CLIENTS =====
CREATE INDEX IF NOT EXISTS idx_clients_entity ON clients(entity_id);
CREATE INDEX IF NOT EXISTS idx_clients_entity_status ON clients(entity_id, status);

-- ===== SIGNATURES (croissance rapide : 200 × N_jours_session) =====
-- UNIQUE (session_id, signer_id, signer_type, time_slot_id) existe déjà
-- Indexes pour les requêtes "qui a signé quoi"
CREATE INDEX IF NOT EXISTS idx_signatures_session_signed ON signatures(session_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_signatures_signer ON signatures(signer_id, signer_type);

-- ===== GENERATED_DOCUMENTS (1000+ docs cible) =====
CREATE INDEX IF NOT EXISTS idx_gen_docs_session_created ON generated_documents(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_docs_client_created ON generated_documents(client_id, created_at DESC) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_docs_template ON generated_documents(template_id) WHERE template_id IS NOT NULL;

-- ===== QUESTIONNAIRE_RESPONSES (200 apprenants × 5 questionnaires/formation) =====
CREATE INDEX IF NOT EXISTS idx_qr_questionnaire_learner ON questionnaire_responses(questionnaire_id, learner_id);
CREATE INDEX IF NOT EXISTS idx_qr_session_learner ON questionnaire_responses(session_id, learner_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qr_session_created ON questionnaire_responses(session_id, created_at DESC) WHERE session_id IS NOT NULL;

-- ===== EMAIL_HISTORY (croissance exponentielle, table critique cron) =====
-- Index existants : (session_id), (session_id, recipient_type)
-- Manque : filtrage par entity_id (dashboard), par status (process-scheduled cron)
CREATE INDEX IF NOT EXISTS idx_email_history_entity_sent ON email_history(entity_id, sent_at DESC) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_history_status_scheduled ON email_history(status, scheduled_at) WHERE status = 'pending';

-- ===== ACTIVITY_LOG (croissance la plus rapide, log de tout) =====
CREATE INDEX IF NOT EXISTS idx_activity_log_entity_created ON activity_log(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_created ON activity_log(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- ===== CRM_PROSPECTS (CRM dashboard filters) =====
CREATE INDEX IF NOT EXISTS idx_crm_prospects_entity_status ON crm_prospects(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_entity_assigned ON crm_prospects(entity_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_prospects_entity_created ON crm_prospects(entity_id, created_at DESC);

-- ===== CONTACTS (filtré via clients) =====
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);

-- ===== QUALITY_SCORES (dashboard Qualiopi) =====
CREATE INDEX IF NOT EXISTS idx_quality_scores_entity_year ON quality_scores(entity_id, year);
CREATE INDEX IF NOT EXISTS idx_quality_scores_entity_formation ON quality_scores(entity_id, formation, year);

-- ============================================================
-- Vérification (à exécuter après migration) :
--   SELECT schemaname, tablename, indexname
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND tablename IN (
--       'enrollments','learners','sessions','trainings','trainers',
--       'profiles','signatures','generated_documents',
--       'questionnaire_responses','email_history','activity_log',
--       'crm_prospects','clients','contacts','quality_scores'
--     )
--   ORDER BY tablename, indexname;
--
-- Pour mesurer l'impact :
--   EXPLAIN ANALYZE SELECT * FROM enrollments WHERE session_id = '...' LIMIT 50;
-- (devrait passer de seq_scan à index_scan)
-- ============================================================
