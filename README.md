# Agent IA vocal — prise de rendez-vous automatique

Cet agent répond aux appels téléphoniques, comprend la demande du client
et réserve automatiquement un rendez-vous dans ton Google Calendar. Il
inclut aussi un petit tableau de bord web pour voir les rendez-vous pris.

Le code est prêt. Il te reste à créer les comptes nécessaires (je ne peux
pas le faire à ta place) puis à déployer. Compte environ 20-30 minutes.

---

## 1. Vue d'ensemble de l'architecture

```
 Appel téléphonique
        │
        ▼
     VAPI.ai  ──(voix)──►  ElevenLabs (voix naturelle)
        │
        ├──(compréhension)──► OpenAI GPT-4o
        │
        └──(fonctions)──► TON SERVEUR (ce projet, déployé sur Railway)
                                │
                                ├── vérifie les créneaux libres
                                └── crée l'événement
                                        │
                                        ▼
                                Google Calendar
```

Ce dépôt contient uniquement **ton serveur** (la partie qui parle à
Google Calendar). VAPI héberge la partie "conversation vocale" —
tu la configures via leur dashboard avec le fichier
`vapi-assistant-config.json` fourni.

---

## 2. Créer les comptes nécessaires

### a) OpenAI (le cerveau de l'agent)
1. Va sur https://platform.openai.com/signup et crée un compte.
2. Ajoute un moyen de paiement dans **Billing** (l'usage est facturé à
   l'usage, quelques centimes par appel).
3. Tu n'as pas besoin de clé API OpenAI séparée : VAPI peut gérer la
   connexion à GPT-4o directement si tu connectes ton compte OpenAI
   dans VAPI (étape suivante), ou tu peux créer une clé sur
   https://platform.openai.com/api-keys si tu préfères la fournir toi-même.

### b) VAPI (l'orchestrateur de l'appel vocal)
1. Va sur https://vapi.ai et crée un compte.
2. Dans **Settings > Providers**, connecte ton compte OpenAI (et
   ElevenLabs une fois créé, voir ci-dessous).
3. Achète ou connecte un numéro de téléphone dans **Phone Numbers**
   (VAPI propose des numéros directement, ou tu peux importer un
   numéro Twilio existant).
4. Note qu'un essai gratuit est généralement proposé, avec facturation
   à la minute ensuite.

### c) ElevenLabs (la voix)
1. Va sur https://elevenlabs.io et crée un compte.
2. Dans **Voices**, choisis ou clone une voix, puis note son
   `Voice ID` (tu en auras besoin dans `vapi-assistant-config.json`).
3. Connecte ce compte à VAPI dans **Settings > Providers** (étape b.2).

### d) Google Cloud (accès à Google Calendar)
1. Va sur https://console.cloud.google.com et crée un projet.
2. Active l'API **Google Calendar API** (menu *API & Services >
   Library*, recherche "Google Calendar API", clique *Enable*).
3. Crée un **compte de service** : *API & Services > Credentials >
   Create Credentials > Service Account*. Donne-lui un nom, valide.
4. Dans le compte de service créé, onglet **Keys > Add Key > Create
   new key > JSON**. Un fichier JSON se télécharge : garde-le précieusement,
   il contient `client_email` et `private_key`.
5. Ouvre **Google Calendar** (calendar.google.com) avec le compte dont
   tu veux gérer l'agenda. Dans les paramètres du calendrier concerné
   (⚙️ > *Paramètres et partage*), section **Partager avec des personnes
   spécifiques**, ajoute l'adresse `client_email` du compte de service
   avec les droits **"Apporter des modifications aux événements"**.
6. Récupère l'**ID du calendrier** dans les mêmes paramètres, section
   *Intégrer l'agenda* (c'est en général ton adresse Gmail, ou une
   adresse en `...@group.calendar.google.com`).

### e) Railway (hébergement du serveur)
1. Va sur https://railway.app et crée un compte (tu peux te connecter
   avec GitHub).
2. Un plan gratuit limité existe ; pour un usage continu 24/7 il faudra
   passer sur un plan payant (quelques dollars/mois).

---

## 3. Configurer et déployer le serveur

### En local (pour tester)
```bash
cd agent-ia-vocal
npm install
cp .env.example .env
# Édite .env avec tes vraies valeurs (voir ci-dessous)
npm start
```
Le tableau de bord sera visible sur http://localhost:3000

### Variables à renseigner dans `.env`
- `VAPI_SERVER_SECRET` : invente une chaîne aléatoire longue (ex: génère-la
  avec `openssl rand -hex 32`). Tu la remettras dans VAPI.
- `GOOGLE_CLIENT_EMAIL` et `GOOGLE_PRIVATE_KEY` : copiés depuis le fichier
  JSON téléchargé à l'étape 2.d.4. Pour `GOOGLE_PRIVATE_KEY`, garde bien
  les `\n` littéraux si tu la colles sur une seule ligne dans Railway.
- `GOOGLE_CALENDAR_ID` : récupéré à l'étape 2.d.6.

### Déployer sur Railway
1. Crée un nouveau projet Railway, choisis **"Deploy from GitHub repo"**
   (pousse d'abord ce dossier sur un repo GitHub à toi — ou utilise
   **"Empty project"** puis l'onglet **"Deploy from local directory"**
   via la CLI Railway : `npm i -g @railway/cli && railway login && railway up`).
2. Dans l'onglet **Variables**, ajoute toutes les variables de `.env.example`
   avec tes vraies valeurs.
3. Railway te donne une URL publique du type
   `https://ton-projet.up.railway.app`. C'est ton `<TON-URL-RAILWAY>`.
4. Vérifie que ça tourne : ouvre `https://ton-projet.up.railway.app/api/health`
   → tu dois voir `{"status":"ok", ...}`.

---

## 4. Configurer l'assistant vocal dans VAPI

1. Ouvre `vapi-assistant-config.json` dans ce dossier.
2. Remplace :
   - `<TON-URL-RAILWAY>/vapi/webhook` par ton vraie URL Railway
   - `<LA-MEME-VALEUR-QUE-VAPI_SERVER_SECRET-DANS-.ENV>` par le secret choisi plus haut
   - `REMPLACE_PAR_UNE_VOIX_ELEVENLABS` par le Voice ID choisi à l'étape 2.c.2
3. Dans le dashboard VAPI : **Assistants > Create Assistant**, bascule
   en mode **JSON/Import**, colle le contenu du fichier modifié.
4. Associe l'assistant à ton numéro de téléphone (**Phone Numbers >
   ton numéro > Assistant**).
5. Appelle le numéro pour tester ! 🎉

---

## 5. Structure du projet

```
agent-ia-vocal/
├── src/
│   ├── server.js              # serveur Express principal
│   ├── routes/
│   │   └── vapiWebhook.js     # reçoit les appels de fonction de VAPI
│   └── services/
│       ├── calendar.js        # intégration Google Calendar
│       └── store.js           # historique local des rendez-vous
├── public/
│   └── index.html             # tableau de bord web
├── vapi-assistant-config.json # config à coller dans VAPI
├── railway.json / Procfile    # déploiement Railway
└── .env.example                # variables d'environnement à copier
```

---

## 6. Limites connues / à améliorer

- Le stockage des rendez-vous pour le tableau de bord est un simple
  fichier JSON local — sur Railway, il sera réinitialisé à chaque
  redéploiement. Pour un usage sérieux, remplace `src/services/store.js`
  par une vraie base de données (Postgres via Railway par exemple).
- Pas d'annulation/modification de rendez-vous par téléphone pour
  l'instant — seulement la prise de rendez-vous.
- Pas d'envoi de SMS/e-mail de confirmation — peut être ajouté avec
  Twilio ou Resend.
- Pense à tester différents scénarios d'appel (client qui hésite,
  qui change d'avis, qui parle vite) pour ajuster le `systemPrompt`.
