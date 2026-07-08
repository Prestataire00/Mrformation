-- ============================================================
-- Ajoute la bonne réponse aux questions de questionnaire, pour
-- activer la correction automatique (QCM / oui-non).
--
-- Convention de stockage (JSONB) :
--   - multiple_choice : le TEXTE de la bonne option (string), ex. "Paris".
--   - yes_no          : "oui" ou "non".
--   - NULL            : question non notée (exclue du score).
--
-- `options` reste un tableau de choix (inchangé). Aucune nouvelle policy RLS
-- (ajout de colonne sur table existante déjà en RLS).
-- ⚠️ À jouer dans Supabase AVANT le push (convention repo).
-- ============================================================

ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_answer JSONB;
