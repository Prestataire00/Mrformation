Exécute cette checklist complète avant livraison client :

1. Lance `npx tsc --noEmit` et rapporte les erreurs
2. Lance `npm run test` et rapporte les résultats
3. Vérifie les migrations non exécutées dans supabase/migrations/
4. Cherche des clés API hardcodées (patterns sk-, re_, eyJ) dans le code
5. Vérifie que toutes les routes API ont un requireRole() ou sont publiques
6. Cherche les TODO/FIXME restants
7. Affiche le git status
8. Génère un rapport PRÊT / PAS PRÊT
