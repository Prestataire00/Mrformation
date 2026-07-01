-- Migration : ajout de l'étape "Contrat de sous-traitance J-8" dans le pack
-- "Pack Sous-traitance" de l'entité C3V FORMATION.
--
-- Idempotente : la guard NOT EXISTS empêche toute double insertion si la
-- migration est rejouée. L'order_index est calculé dynamiquement (max + 1).
--
-- À exécuter manuellement dans le Supabase Dashboard (SQL Editor).

DO $$
DECLARE
  v_pack_id   UUID;
  v_max_order INTEGER;
BEGIN
  -- Résolution du pack : entité C3V FORMATION + nom "Pack Sous-traitance"
  SELECT ap.id
    INTO v_pack_id
    FROM automation_packs ap
    JOIN entities e ON e.id = ap.entity_id
   WHERE e.name = 'C3V FORMATION'
     AND ap.name = 'Pack Sous-traitance'
   LIMIT 1;

  IF v_pack_id IS NULL THEN
    RAISE NOTICE 'Pack "Pack Sous-traitance" introuvable pour C3V FORMATION — migration ignorée.';
    RETURN;
  END IF;

  -- Garde idempotente : on n'insère que si aucune étape contrat_sous_traitance
  -- n'existe déjà dans ce pack.
  IF NOT EXISTS (
    SELECT 1
      FROM automation_pack_steps
     WHERE pack_id      = v_pack_id
       AND document_type = 'contrat_sous_traitance'
  ) THEN
    SELECT COALESCE(MAX(order_index), -1) + 1
      INTO v_max_order
      FROM automation_pack_steps
     WHERE pack_id = v_pack_id;

    INSERT INTO automation_pack_steps
      (pack_id, order_index, trigger_type, days_offset, recipient_type,
       document_type, name, description)
    VALUES
      (v_pack_id,
       v_max_order,
       'session_start_minus_days',
       8,
       'trainers',
       'contrat_sous_traitance',
       'Contrat de sous-traitance J-8',
       'Envoi du contrat de sous-traitance 8 jours avant');

    RAISE NOTICE 'Étape "Contrat de sous-traitance J-8" insérée (order_index=%) dans le pack %.', v_max_order, v_pack_id;
  ELSE
    RAISE NOTICE 'Étape contrat_sous_traitance déjà présente dans le pack % — rien à faire.', v_pack_id;
  END IF;
END $$;
