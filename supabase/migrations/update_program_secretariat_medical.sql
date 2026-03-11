-- Migration: Update program "Accompagnement à la Prise de Poste en Secrétariat Médical"
-- Source: PDF bibliotheque VisioFormation

UPDATE programs
SET
  title = 'Accompagnement à la Prise de Poste en Secrétariat Médical',
  description = 'Jour 1 : Découverte du poste et gestion administrative (3,5h)
1. Introduction et prise en main du poste (45min)
• Présentation des missions du secrétaire médical.
• Règles de confidentialité et secret médical.
• Fonctionnement du cabinet, de la clinique ou de l''hôpital.
2. Gestion des tâches administratives (2,75h)
• Organisation et classement des dossiers patients (papier et numérique).
• Utilisation des logiciels médicaux (prise de RDV, dossier patient, télétransmission).
• Gestion des courriers, mails et comptes rendus médicaux.

Jour 2 : Accueil des patients, communication et bureautique (3,5h)
1. Techniques d''accueil et relation avec les patients (1,5h)
• Accueil physique et téléphonique : posture professionnelle et empathie.
• Prise de rendez-vous et gestion des urgences.
• Communication avec les patients et le personnel soignant.
2. Module bureautique (2h)
• Utilisation des outils de bureautique essentiels :
• Word : rédaction et mise en page de documents médicaux.
• Excel : tableaux de suivi, listes de patients, gestion des plannings.
• Outlook : gestion des mails, organisation du travail avec le calendrier.
• Raccourcis et astuces pour gagner en efficacité.

Jour 3 : Approfondissement et mise en situation (3,5h)
1. Gestion des imprévus et priorisation des tâches (2h)
• Gestion des conflits et patients difficiles.
• Organisation et gestion du stress en situation de forte affluence.
2. Mises en situation et validation des acquis (1,5h)
• Exercices pratiques sur la gestion des appels et la prise de rendez-vous.
• Cas pratiques de classement, facturation et gestion administrative.
• Bilan de la formation et conseils personnalisés.',
  objectives = '1 - Comprendre le rôle et les missions du secrétaire médical dans son environnement de travail.
2 - Acquérir les compétences organisationnelles et administratives essentielles.
3 - Maîtriser la gestion des rendez-vous, l''accueil des patients et la communication professionnelle.
4 - Appliquer les règles de confidentialité et de réglementation en milieu médical.',
  content = '{
    "duration_hours": 10.5,
    "duration_days": 3,
    "location": "Formation En présentiel",
    "specialty": "100 - Formations générales",
    "diploma": "Aucun",
    "cpf_eligible": false,
    "target_audience": "Secrétaire médicale",
    "prerequisites": "aucun",
    "team_description": "",
    "evaluation_methods": [
      "Test de positionnement.",
      "Évaluation des acquis (tests, exercices, études de cas et mises en situation)",
      "Évaluation de l''impact de la formation"
    ],
    "pedagogical_resources": [
      "Alternance d''apports théoriques et d''ateliers pratiques pour faire émerger les bonnes pratiques.",
      "Animée alternativement sous forme de formation, d''ateliers de mise en pratique, de groupe de parole, de séance de co-développement",
      "Pour faciliter l''ancrage et conformément à l''ADN MR FORMATION, nos ateliers utilisent la Ludo pédagogie."
    ],
    "certification_results": "",
    "certification_terms": "",
    "certification_details": "",
    "modules": [
      {
        "id": 1,
        "title": "Introduction et prise en main du poste",
        "duration_hours": 0.75,
        "objectives": [],
        "topics": [
          "Présentation des missions du secrétaire médical.",
          "Règles de confidentialité et secret médical.",
          "Fonctionnement du cabinet, de la clinique ou de l''hôpital."
        ]
      },
      {
        "id": 2,
        "title": "Gestion des tâches administratives",
        "duration_hours": 2.75,
        "objectives": [],
        "topics": [
          "Organisation et classement des dossiers patients (papier et numérique).",
          "Utilisation des logiciels médicaux (prise de RDV, dossier patient, télétransmission).",
          "Gestion des courriers, mails et comptes rendus médicaux."
        ]
      },
      {
        "id": 3,
        "title": "Techniques d''accueil et relation avec les patients",
        "duration_hours": 1.5,
        "objectives": [],
        "topics": [
          "Accueil physique et téléphonique : posture professionnelle et empathie.",
          "Prise de rendez-vous et gestion des urgences.",
          "Communication avec les patients et le personnel soignant."
        ]
      },
      {
        "id": 4,
        "title": "Module bureautique",
        "duration_hours": 2,
        "objectives": [],
        "topics": [
          "Utilisation des outils de bureautique essentiels :",
          "Word : rédaction et mise en page de documents médicaux.",
          "Excel : tableaux de suivi, listes de patients, gestion des plannings.",
          "Outlook : gestion des mails, organisation du travail avec le calendrier.",
          "Raccourcis et astuces pour gagner en efficacité."
        ]
      },
      {
        "id": 5,
        "title": "Gestion des imprévus et priorisation des tâches",
        "duration_hours": 2,
        "objectives": [],
        "topics": [
          "Gestion des conflits et patients difficiles.",
          "Organisation et gestion du stress en situation de forte affluence."
        ]
      },
      {
        "id": 6,
        "title": "Mises en situation et validation des acquis",
        "duration_hours": 1.5,
        "objectives": [],
        "topics": [
          "Exercices pratiques sur la gestion des appels et la prise de rendez-vous.",
          "Cas pratiques de classement, facturation et gestion administrative.",
          "Bilan de la formation et conseils personnalisés."
        ]
      }
    ]
  }'::jsonb,
  updated_at = NOW()
WHERE title ILIKE '%Accompagnement%Prise de Poste%Secrétariat Médical%'
   OR title ILIKE '%Accompagnement%Secretariat Medical%';
