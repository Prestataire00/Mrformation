-- ============================================================
-- Modèles de documents par défaut pour MR FORMATION
-- ============================================================

DO $$
DECLARE
  v_entity_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM entities WHERE name ILIKE '%MR%' LIMIT 1;
  IF v_entity_id IS NULL THEN
    RAISE NOTICE 'Entity MR FORMATION not found — skipping seed';
    RETURN;
  END IF;

  -- 1. Convention de formation
  INSERT INTO document_templates (entity_id, name, type, content, variables) VALUES (
    v_entity_id,
    'Convention de formation',
    'agreement',
    '<div style="font-family: Helvetica, Arial, sans-serif; color: #1e293b; max-width: 794px; margin: 0 auto; padding: 40px 50px; line-height: 1.6;">
  <div style="border-bottom: 3px solid #374151; padding-bottom: 16px; margin-bottom: 32px;">
    <p style="font-size: 20px; font-weight: 700; margin: 0;">MR FORMATION</p>
    <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0;">Organisme de formation professionnelle — SIRET 91311329600036</p>
  </div>

  <h1 style="font-size: 22px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 0 0 32px; letter-spacing: 1px;">Convention de formation professionnelle</h1>

  <p style="font-weight: 600; margin-bottom: 16px;">Entre les soussignés :</p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; background: #f9fafb; border-radius: 8px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Organisme de formation</td><td style="padding: 8px 12px;">MR FORMATION</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Ci-après dénommé</td><td style="padding: 8px 12px;">« Le prestataire »</td></tr>
  </table>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9fafb; border-radius: 8px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Entreprise</td><td style="padding: 8px 12px;">{{nom_client}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Ci-après dénommée</td><td style="padding: 8px 12px;">« Le client »</td></tr>
  </table>

  <p style="font-weight: 600; margin-bottom: 16px;">Il a été convenu ce qui suit :</p>

  <p style="font-weight: 600; margin: 24px 0 8px;">Article 1 — Objet</p>
  <p>Le prestataire s''engage à organiser l''action de formation suivante :</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0 24px; background: #f9fafb; border-radius: 8px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Intitulé</td><td style="padding: 8px 12px;">{{titre_formation}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Du</td><td style="padding: 8px 12px;">{{date_debut}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Au</td><td style="padding: 8px 12px;">{{date_fin}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Lieu</td><td style="padding: 8px 12px;">{{lieu}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Durée</td><td style="padding: 8px 12px;">{{duree_heures}} heure(s)</td></tr>
  </table>

  <p style="font-weight: 600; margin: 24px 0 8px;">Article 2 — Modalités de paiement</p>
  <p>Le règlement du prix de la formation est dû à réception de la facture. Tout retard de paiement entraînera l''application de pénalités conformément à la réglementation en vigueur.</p>

  <p style="font-weight: 600; margin: 24px 0 8px;">Article 3 — Annulation</p>
  <p style="margin-bottom: 24px;">Toute annulation doit être signalée par écrit au moins 10 jours ouvrés avant le début de la formation.</p>

  <div style="display: flex; justify-content: space-between; margin-top: 48px;">
    <div>
      <p style="font-size: 12px; color: #6b7280; margin: 0;">Pour le prestataire</p>
      <p style="font-weight: 600; margin: 4px 0 48px;">MR FORMATION</p>
      <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
      <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Date et signature</p>
    </div>
    <div>
      <p style="font-size: 12px; color: #6b7280; margin: 0;">Pour le client</p>
      <p style="font-weight: 600; margin: 4px 0 48px;">{{nom_client}}</p>
      <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
      <p style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Date et signature</p>
    </div>
  </div>

  <div style="border-top: 1px solid #e5e7eb; margin-top: 48px; padding-top: 16px;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0; text-align: center;">Document généré le {{date_today}} — MR FORMATION</p>
  </div>
</div>',
    '["{{nom_client}}","{{titre_formation}}","{{date_debut}}","{{date_fin}}","{{lieu}}","{{duree_heures}}","{{date_today}}"]'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- 2. Convocation
  INSERT INTO document_templates (entity_id, name, type, content, variables) VALUES (
    v_entity_id,
    'Convocation à la formation',
    'certificate',
    '<div style="font-family: Helvetica, Arial, sans-serif; color: #1e293b; max-width: 794px; margin: 0 auto; padding: 40px 50px; line-height: 1.6;">
  <div style="border-bottom: 3px solid #374151; padding-bottom: 16px; margin-bottom: 32px;">
    <p style="font-size: 20px; font-weight: 700; margin: 0;">MR FORMATION</p>
    <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0;">Organisme de formation professionnelle</p>
  </div>

  <h1 style="font-size: 22px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 0 0 32px; letter-spacing: 1px;">Convocation à la formation</h1>

  <p style="margin-bottom: 24px;">Madame, Monsieur <strong>{{prenom_apprenant}} {{nom_apprenant}}</strong>,</p>

  <p style="margin-bottom: 24px;">Nous avons le plaisir de vous confirmer votre inscription à la formation suivante :</p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9fafb; border-radius: 8px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Formation</td><td style="padding: 8px 12px;">{{titre_formation}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Date de début</td><td style="padding: 8px 12px;">{{date_debut}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Date de fin</td><td style="padding: 8px 12px;">{{date_fin}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Lieu</td><td style="padding: 8px 12px;">{{lieu}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Durée</td><td style="padding: 8px 12px;">{{duree_heures}} heure(s)</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Formateur</td><td style="padding: 8px 12px;">{{nom_formateur}}</td></tr>
  </table>

  <p style="margin-bottom: 16px;">Nous vous invitons à vous présenter <strong>15 minutes avant le début de la formation</strong> muni(e) d''une pièce d''identité.</p>
  <p style="margin-bottom: 16px;">Pour toute question, n''hésitez pas à nous contacter.</p>
  <p style="margin-top: 32px;">Cordialement,<br/><strong>MR FORMATION</strong></p>

  <div style="border-top: 1px solid #e5e7eb; margin-top: 48px; padding-top: 16px;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0; text-align: center;">Document généré le {{date_today}} — MR FORMATION</p>
  </div>
</div>',
    '["{{nom_apprenant}}","{{prenom_apprenant}}","{{titre_formation}}","{{date_debut}}","{{date_fin}}","{{lieu}}","{{duree_heures}}","{{nom_formateur}}","{{date_today}}"]'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- 3. Certificat de réalisation
  INSERT INTO document_templates (entity_id, name, type, content, variables) VALUES (
    v_entity_id,
    'Certificat de réalisation',
    'certificate',
    '<div style="font-family: Helvetica, Arial, sans-serif; color: #1e293b; max-width: 794px; margin: 0 auto; padding: 40px 50px; line-height: 1.6;">
  <div style="border-bottom: 3px solid #374151; padding-bottom: 16px; margin-bottom: 32px;">
    <p style="font-size: 20px; font-weight: 700; margin: 0;">MR FORMATION</p>
    <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0;">Organisme de formation professionnelle</p>
  </div>

  <h1 style="font-size: 22px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 0 0 32px; letter-spacing: 1px;">Certificat de réalisation</h1>

  <p style="margin-bottom: 24px;">Je soussigné(e), responsable de l''organisme de formation <strong>MR FORMATION</strong>, atteste que :</p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9fafb; border-radius: 8px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Participant(e)</td><td style="padding: 8px 12px;">{{nom_apprenant}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Formation</td><td style="padding: 8px 12px;">{{titre_formation}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Du</td><td style="padding: 8px 12px;">{{date_debut}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Au</td><td style="padding: 8px 12px;">{{date_fin}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Durée</td><td style="padding: 8px 12px;">{{duree_heures}} heure(s)</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Formateur</td><td style="padding: 8px 12px;">{{nom_formateur}}</td></tr>
  </table>

  <p style="margin-bottom: 24px;">a bien suivi l''intégralité de l''action de formation citée ci-dessus.</p>
  <p style="margin-bottom: 8px;">Fait pour servir et valoir ce que de droit.</p>
  <p style="margin-bottom: 32px;">Fait le {{date_today}}</p>

  <div style="display: flex; justify-content: space-between; margin-top: 40px;">
    <div>
      <p style="font-size: 12px; color: #6b7280; margin: 0 0 48px;">Le responsable de l''organisme</p>
      <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
    </div>
    <div>
      <p style="font-size: 12px; color: #6b7280; margin: 0 0 48px;">Le/La participant(e)</p>
      <div style="border-bottom: 1px solid #d1d5db; width: 200px;"></div>
    </div>
  </div>

  <div style="border-top: 1px solid #e5e7eb; margin-top: 48px; padding-top: 16px;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0; text-align: center;">Document généré le {{date_today}} — MR FORMATION</p>
  </div>
</div>',
    '["{{nom_apprenant}}","{{titre_formation}}","{{date_debut}}","{{date_fin}}","{{duree_heures}}","{{nom_formateur}}","{{date_today}}"]'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- 4. Attestation d'assiduité
  INSERT INTO document_templates (entity_id, name, type, content, variables) VALUES (
    v_entity_id,
    'Attestation d''assiduité',
    'attendance',
    '<div style="font-family: Helvetica, Arial, sans-serif; color: #1e293b; max-width: 794px; margin: 0 auto; padding: 40px 50px; line-height: 1.6;">
  <div style="border-bottom: 3px solid #374151; padding-bottom: 16px; margin-bottom: 32px;">
    <p style="font-size: 20px; font-weight: 700; margin: 0;">MR FORMATION</p>
    <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0;">Organisme de formation professionnelle</p>
  </div>

  <h1 style="font-size: 22px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 0 0 32px; letter-spacing: 1px;">Attestation d''assiduité</h1>

  <p style="margin-bottom: 24px;">Je soussigné(e), responsable de l''organisme de formation <strong>MR FORMATION</strong>, atteste que :</p>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9fafb; border-radius: 8px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Participant(e)</td><td style="padding: 8px 12px;">{{nom_apprenant}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Formation</td><td style="padding: 8px 12px;">{{titre_formation}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Période</td><td style="padding: 8px 12px;">Du {{date_debut}} au {{date_fin}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Durée totale</td><td style="padding: 8px 12px;">{{duree_heures}} heure(s)</td></tr>
  </table>

  <p style="margin-bottom: 24px;">a suivi la formation avec <strong>assiduité</strong> pour la durée totale indiquée ci-dessus.</p>
  <p style="margin-bottom: 8px;">Fait pour servir et valoir ce que de droit.</p>
  <p style="margin-bottom: 32px;">Fait le {{date_today}}</p>

  <div style="display: flex; justify-content: space-between; margin-top: 40px;">
    <div>
      <p style="font-size: 12px; color: #6b7280; margin: 0 0 48px;">Signature et cachet de l''organisme</p>
      <p style="color: #9ca3af; font-size: 11px;">{{signature_formateur}}</p>
    </div>
    <div>
      <p style="font-size: 12px; color: #6b7280; margin: 0 0 48px;">Signature de l''apprenant</p>
      <p style="color: #9ca3af; font-size: 11px;">{{signature_apprenant}}</p>
    </div>
  </div>

  <div style="border-top: 1px solid #e5e7eb; margin-top: 48px; padding-top: 16px;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0; text-align: center;">Document généré le {{date_today}} — MR FORMATION</p>
  </div>
</div>',
    '["{{nom_apprenant}}","{{titre_formation}}","{{date_debut}}","{{date_fin}}","{{duree_heures}}","{{date_today}}","{{signature_apprenant}}","{{signature_formateur}}"]'::jsonb
  ) ON CONFLICT DO NOTHING;

  -- 5. Feuille d'émargement
  INSERT INTO document_templates (entity_id, name, type, content, variables) VALUES (
    v_entity_id,
    'Feuille d''émargement',
    'other',
    '<div style="font-family: Helvetica, Arial, sans-serif; color: #1e293b; max-width: 794px; margin: 0 auto; padding: 40px 50px; line-height: 1.6;">
  <div style="border-bottom: 3px solid #374151; padding-bottom: 16px; margin-bottom: 32px;">
    <p style="font-size: 20px; font-weight: 700; margin: 0;">MR FORMATION</p>
    <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0;">Organisme de formation professionnelle</p>
  </div>

  <h1 style="font-size: 22px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 0 0 32px; letter-spacing: 1px;">Feuille d''émargement</h1>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9fafb; border-radius: 8px;">
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Formation</td><td style="padding: 8px 12px;">{{titre_formation}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Période</td><td style="padding: 8px 12px;">Du {{date_debut}} au {{date_fin}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Lieu</td><td style="padding: 8px 12px;">{{lieu}}</td></tr>
    <tr><td style="padding: 8px 12px; font-weight: 600; color: #374151;">Formateur</td><td style="padding: 8px 12px;">{{nom_formateur}}</td></tr>
  </table>

  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left; font-size: 13px;">Participant(e)</th>
        <th style="border: 1px solid #d1d5db; padding: 10px; text-align: center; font-size: 13px;">Matin</th>
        <th style="border: 1px solid #d1d5db; padding: 10px; text-align: center; font-size: 13px;">Après-midi</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #d1d5db; padding: 10px; font-size: 13px;">{{nom_apprenant}}</td>
        <td style="border: 1px solid #d1d5db; padding: 10px; height: 50px;">{{signature_apprenant}}</td>
        <td style="border: 1px solid #d1d5db; padding: 10px; height: 50px;"></td>
      </tr>
    </tbody>
  </table>

  <p style="font-size: 11px; color: #9ca3af; margin-top: 16px;">Chaque participant doit émarger par demi-journée.</p>

  <div style="border-top: 1px solid #e5e7eb; margin-top: 48px; padding-top: 16px;">
    <p style="font-size: 11px; color: #9ca3af; margin: 0; text-align: center;">Document généré le {{date_today}} — MR FORMATION</p>
  </div>
</div>',
    '["{{nom_apprenant}}","{{titre_formation}}","{{date_debut}}","{{date_fin}}","{{lieu}}","{{nom_formateur}}","{{date_today}}","{{signature_apprenant}}"]'::jsonb
  ) ON CONFLICT DO NOTHING;

END $$;
