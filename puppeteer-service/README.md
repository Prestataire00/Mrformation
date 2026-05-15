# MR/C3V Formation — PDF Sidecar (Puppeteer)

Service de génération PDF auto-hébergé. Remplace la dépendance critique CloudConvert.

## Stack

- Node.js 20 + Express + TypeScript
- Puppeteer (Chromium headless full)
- Image Docker ~400MB
- Coût Railway : ~5$/mois (plan Hobby)

## Endpoints

### `GET /health`

Sans auth. Retourne `200 { status: "ok", chromium_version: "<version>" }`.

### `POST /render`

Header obligatoire : `Authorization: Bearer <PDF_SERVICE_SECRET>`

Body JSON :
```json
{
  "html": "<h1>Hello world</h1>",
  "options": {
    "format": "A4",
    "margins": { "top": "20mm", "right": "20mm", "bottom": "20mm", "left": "20mm" },
    "headerTemplate": "<div style=\"font-size:10px\">...</div>",
    "footerTemplate": "<div style=\"font-size:10px\">Page <span class=\"pageNumber\"></span>/<span class=\"totalPages\"></span></div>",
    "printBackground": true,
    "displayHeaderFooter": false
  }
}
```

Réponse : `200 application/pdf` (binary).

Erreurs :
- `401` : header `Authorization` manquant ou invalide
- `400` : body JSON invalide / `html` manquant
- `500` : erreur Puppeteer (timeout, crash Chromium)

## Variables d'environnement

| Var | Obligatoire | Description |
|---|---|---|
| `PDF_SERVICE_SECRET` | **Oui** | Bearer token pour l'auth `/render`. Générer via `openssl rand -base64 32` |
| `PORT` | Non | Port HTTP (défaut Railway : 8080) |
| `LOG_LEVEL` | Non | `info` (défaut) ou `debug` |

## Déploiement sur Railway (pas-à-pas)

1. Créer un compte sur https://railway.app et se connecter avec GitHub.
2. **New Project** → **Deploy from GitHub repo** → sélectionner ce repo (`mr-formation` ou ton nom de repo).
3. Dans **Settings** du service nouvellement créé :
   - **Root Directory** : `puppeteer-service`
   - **Build Command** : (laisser vide — Railway utilise le `Dockerfile`)
   - **Start Command** : (laisser vide — `CMD` du Dockerfile)
4. Dans **Variables** :
   - Ajouter `PDF_SERVICE_SECRET` = `<openssl rand -base64 32>` (générer un nouveau pour la prod)
   - Optionnel : `LOG_LEVEL=info`
5. Cliquer **Deploy**. Le build prend ~3-5 minutes la 1ère fois (pull Chromium + npm install).
6. Une fois déployé, **Settings → Networking → Generate Domain** → tu obtiens une URL publique du type `https://mr-formation-puppeteer-production.up.railway.app`.

### Validation post-deploy

```bash
# Health check (sans auth)
curl https://<your-railway-url>.up.railway.app/health

# Render test (avec auth)
curl -X POST https://<your-railway-url>.up.railway.app/render \
  -H "Authorization: Bearer <PDF_SERVICE_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"html":"<h1>Hello</h1>","options":{"format":"A4"}}' \
  --output test.pdf

# Ouvrir test.pdf — doit afficher "Hello" centré
```

## Configuration côté app Netlify

Une fois le sidecar déployé, configurer dans Netlify (Dashboard → Site config → Environment variables) :

- `PDF_SERVICE_URL` = l'URL Railway (sans slash final)
- `PDF_SERVICE_SECRET` = la même valeur que côté Railway

## Local dev

```bash
cd puppeteer-service
npm install
PDF_SERVICE_SECRET=local-dev-secret npm run dev
# Service écoute sur http://localhost:8080
```

## Observabilité

- Logs Railway : Dashboard → Deployments → ton service → **View Logs**
- Health check Railway configuré pour redémarrer auto si crash (cf `healthcheckPath: /health` dans Railway).
