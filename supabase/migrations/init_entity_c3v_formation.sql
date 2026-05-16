-- ============================================================
-- Migration : initialise les paramètres de l'entité C3V FORMATION
-- ============================================================
-- À jouer dans Supabase Dashboard > SQL Editor APRÈS le deploy du code.
-- Idempotent : utilise UPDATE WHERE slug='c3v-formation' (l'entity existe
-- déjà depuis le seed initial du schema).
--
-- NB : logo + cachet (binaires) à uploader séparément via l'admin UI
-- /admin/settings/organization (Storage bucket organization-assets).
-- ============================================================

UPDATE entities SET
  name = 'C3V FORMATION',
  siret = '98525216200021',
  nda = '93132222513',
  address = '24/26 Boulevard Gay Lussac',
  postal_code = '13014',
  city = 'Marseille',
  email = 'contact@c3vformation.fr',
  phone = '0750461245',
  website = 'http://www.c3vformation.fr',
  president_name = 'VICHOT Loris',
  president_title = 'Directeur Général'
WHERE slug = 'c3v-formation';

-- Vérification : doit retourner 1 ligne
-- SELECT name, siret, nda, president_name, president_title FROM entities WHERE slug='c3v-formation';
