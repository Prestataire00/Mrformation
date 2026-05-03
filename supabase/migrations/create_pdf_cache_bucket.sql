-- ============================================================
-- Migration : Bucket Storage pour cache des PDFs générés
-- ============================================================
-- Évite de re-générer le même PDF via CloudConvert à chaque preview/envoi.
-- Le serveur calcule un hash basé sur (template_id || doc_type, context,
-- updated_at des entités). Si le PDF existe déjà dans Storage → réutilisation
-- (0 appel CloudConvert). Sinon → génération + upload.
--
-- Path convention : {entity_id}/{hash}.pdf
-- Bucket privé (lecture/écriture par service_role uniquement, pas d'accès anon).
--
-- Invalidation automatique : si l'admin modifie son template Word ou si la
-- session change, le hash change → nouveau PDF généré.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-cache', 'pdf-cache', false)
ON CONFLICT (id) DO NOTHING;

-- Pas de policies RLS sur ce bucket : seul le service_role y accède
-- (côté serveur dans les routes API). Pas de lecture anon ni authenticated.

-- ============================================================
-- Vérification :
--   SELECT id, public FROM storage.buckets WHERE id = 'pdf-cache';
-- ============================================================
