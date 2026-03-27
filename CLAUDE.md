# LMS MR Formation

## Stack
Next.js 14 App Router, TypeScript, Supabase, TailwindCSS + Shadcn/ui, Resend, Netlify

## Entités
- MR FORMATION : rouge #DC2626
- C3V FORMATION : bleu #2563EB

## Rôles
super_admin, admin, trainer, learner, client

## Branche active
- develop : développement
- main : production (Netlify)

## Migrations SQL à exécuter dans Supabase Dashboard
dans l'ordre :
1. add_formation_automation_rules.sql
2. add_formation_finances.sql
3. add_veille_notes.sql
4. add_affacturage.sql
5. add_certificateurs.sql

## Variables d'environnement Netlify
Voir .env.example

## Contact support
acces.prestataires@i-a-infinity.com
