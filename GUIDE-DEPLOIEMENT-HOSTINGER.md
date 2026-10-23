# 🚀 Guide de déploiement — Téranga Market sur Hostinger

Ce guide te permet de mettre ta boutique EN LIGNE sur Hostinger, étape par étape, sans connaissance technique. Suis-le dans l'ordre, clique par clic ou commande par commande (copier-coller).

---

## 📋 Ce qu'il te faut avant de commencer

| Élément | Où le trouver |
|---|---|
| **Le code de la boutique** | Ton dépôt GitHub : `github.com/Evrard700/amazon-glm` (branche `main`) |
| **3 variables d'environnement** | Ce sont les MÊMES que tu as utilisées pour Vercel (retrouve-les dans tes notes ou anciens messages) :<br>• `DATABASE_URL` — commence par `postgresql://postgres.`<br>• `SESSION_SECRET` — long code d'environ 96 caractères<br>• `NEXT_PUBLIC_SITE_URL` — l'adresse de ton site (voir plus bas) |
| **Un compte Hostinger actif** | hpanel.hostinger.com |

> ⚠️ **Important pour `NEXT_PUBLIC_SITE_URL`** : mets l'adresse FINALE de ton site, par exemple `https://ton-domaine.com` (ou l'adresse provisoire que Hostinger te donne si tu n'as pas encore de domaine). Sans `https://` ni slash final.

---

## 🧭 Étape 0 : Quelle offre Hostinger as-tu ?

Hostinger propose deux produits très différents. Choisis ton chemin :

| Ton abonnement Hostinger | Suis… |
|---|---|
| **VPS** (KVM 1, KVM 2, KVM 4…) — un serveur privé | **OPTION A** (recommandée, la plus fiable) |
| **Hébergement mutualisé** (Premium / Business) — l'offre classique | **OPTION B** (possible uniquement avec **Business** ou plus : le plan Premium ne gère pas les applications Node.js) |

> 💡 **Si tu n'as encore rien acheté** : pour une boutique complète comme Téranga Market, prends un **VPS KVM 2** (~7 €/mois) — c'est ce que ce guide couvre le mieux. Le code est prêt pour ça.

---

# 🅰️ OPTION A — VPS Hostinger (recommandée)

## A1. Créer le serveur (si pas déjà fait)

1. hPanel → **VPS** → **Créer un serveur** (ou gère ton VPS existant).
2. Choisis :
   - **Localisation** : Europe (France/Royaume-Uni/Pays-Bas) — plus proche de tes clients.
   - **Système d'exploitation** : **Ubuntu 24.04** avec le gabarit **« Node.js »** (Node préinstallé). Si tu prends Ubuntu 24.04 « propre » (sans gabarit), ce n'est pas grave : on installe Node à l'étape suivante.
   - **Plan** : KVM 2 minimum (la construction du site demande de la mémoire).
3. Note l'**adresse IP** du serveur affichée à la fin.
4. hPanel t'affiche le **mot de passe root** — note-le (tu peux le réinitialiser dans hPanel → VPS → Paramètres → Mot de passe root si besoin).

## A2. Se connecter au serveur (SSH)

Sur **Windows** : appuie sur les touches `Windows + R`, tape `cmd`, Entrée. Dans la fenêtre noire, tape :

```
ssh root@TON_ADRESSE_IP
```

(remplace `TON_ADRESSE_IP`). Réponds `yes` à la première question, puis entre le mot de passe root (rien ne s'affiche quand tu tapes : c'est normal — tape-le puis Entrée).

> 💡 Astuce : dans la fenêtre noire, **clic droit = coller**.

## A3. Préparer le serveur (copier-coller bloc par bloc)

Si ton gabarit n'a pas Node.js préinstallé, installe-le :

```
apt update && apt install -y curl && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs git
```

Vérifie : `node -v` doit afficher `v22…`.

Ajoute de la mémoire d'échange (2 Go) pour que la construction du site ne s'interrompe jamais :

```
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## A4. Télécharger la boutique depuis GitHub

```
git clone https://github.com/Evrard700/amazon-glm.git /opt/teranga && cd /opt/teranga
```

## A5. Créer le fichier de configuration (.env)

```
cat > .env << 'EOF'
DATABASE_URL=colle-ici-ta-database-url
DIRECT_URL=colle-ici-la-meme-valeur-que-database-url
SESSION_SECRET=colle-ici-ton-session-secret
NEXT_PUBLIC_SITE_URL=https://ton-domaine.com
EOF
```

Puis corrige les 4 valeurs : `nano .env`, remplace chaque `colle-ici-…`, puis `Ctrl+O`, Entrée (sauvegarder), `Ctrl+X` (quitter).

## A6. Installer et construire la boutique

```
npm install
```

(2 à 5 minutes — patience.) Puis :

```
npm run build
```

(3 à 8 minutes. Si tout se passe bien, tu vois « ✅ Compiled successfully » et la liste des routes. À la fin, le message indique que le serveur autonome est prêt.)

## A7. Démarrer la boutique en continu (PM2)

```
npm install -g pm2
pm2 start npm --name teranga-market -- start
pm2 save
pm2 startup
```

La dernière commande affiche une commande à copier-coller pour que la boutique redémarre TOUTE SEULE après un redémarrage du serveur — exécute-la.

Vérifie que la boutique tourne : `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` doit afficher **200**.

## A8. Brancher ton nom de domaine + HTTPS

1. Chez le registrar de ton domaine (Hostinger ou autre) : crée un **enregistrement A** pointant vers l'adresse IP du VPS (valeur `@`, type `A`, contenu = l'IP). Patiente 15 min à 2 h.
2. De retour dans la fenêtre SSH, installe le serveur web nginx :

```
apt install -y nginx certbot python3-certbot-nginx
ufw allow 'Nginx Full'
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/teranga << 'EOF'
server {
    listen 80;
    server_name ton-domaine.com www.ton-domaine.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
ln -s /etc/nginx/sites-available/teranga /etc/nginx/sites-enabled/
```

⚠️ Dans le fichier, remplace les 2 occurrences de `ton-domaine.com` par TON vrai domaine : `nano /etc/nginx/sites-available/teranga` → `Ctrl+O`, Entrée, `Ctrl+X`. Puis :

```
nginx -t && systemctl reload nginx
certbot --nginx -d ton-domaine.com -d www.ton-domaine.com
```

(remplace `ton-domaine.com` par ton domaine, réponds à la demande d'e-mail et accepte les conditions ; choisis la redirection HTTPS quand on te le propose). Le certificat HTTPS se renouvelle tout seul. **Ta boutique est en ligne !** 🎉

---

# 🅱️ OPTION B — Hébergement mutualisé Business (hPanel)

> ⚠️ Cette option fonctionne uniquement avec l'offre **Business** (ou supérieure). Elle est plus fragile que le VPS : la **construction** du site (étape B4) peut échouer par manque de mémoire sur un hébergement partagé — dans ce cas, passe au **Plan B** décrit en B5.

## B1. Activer l'application Node.js

1. hPanel → **Sites web** → clique sur **Gérer** à côté de ton domaine.
2. Menu de gauche → **Avancé** → **Node.js** (ou « Application Node.js »).
3. Clique sur **Créer une application Node.js** et remplis :
   - **Version de Node.js** : `22.x` (ou la plus haute proposée)
   - **Racine de l'application** : `app` (un sous-dossier — PAS `public_html`)
   - **URL de l'application** : ton domaine
   - **Fichier de démarrage de l'application** : `server.js` (on le corrigera après la construction — c'est normal qu'il soit faux pour l'instant)

## B2. Téléverser le code

Le plus simple : **Git dans hPanel** (Avancé → **Git**) — colle l'URL `https://github.com/Evrard700/amazon-glm` (dépôt public, pas de mot de passe demandé), choisis la branche `main`, et clone-le dans le dossier de l'application.

Sinon, en SSH (Business inclut SSH — identifiants dans hPanel → Avancé → SSH) :

```
cd ~/domains/ton-domaine.com/app && git clone https://github.com/Evrard700/amazon-glm.git .
```

## B3. Configurer les variables d'environnement

Dans hPanel → Node.js → ta application → section **Variables d'environnement**, ajoute UNE PAR UNE :

| Clé | Valeur |
|---|---|
| `DATABASE_URL` | ta valeur (commence par `postgresql://`) |
| `DIRECT_URL` | la même valeur que DATABASE_URL |
| `SESSION_SECRET` | ton code secret (~96 caractères) |
| `NEXT_PUBLIC_SITE_URL` | `https://ton-domaine.com` |

## B4. Installer et construire

- Bouton **Install dependencies** (ou en SSH : `cd ~/domains/ton-domaine.com/app && npm install`).
- Puis en SSH : `npm run build`. Si tu vois « ✅ Compiled successfully » → parfait.
- Enfin, retourne dans hPanel → Node.js et change le **Fichier de démarrage** pour : `.next/standalone/server.js`, puis **Redémarrer**.

## B5. Plan B — si la construction échoue (erreur mémoire / process killed)

Construis sur ton PC puis téléverse le résultat :

1. Sur ton PC Windows : installe **Node.js 22** depuis nodejs.org, puis dans une fenêtre `cmd` :
   ```
   git clone https://github.com/Evrard700/amazon-glm.git && cd amazon-glm
   (crée un fichier .env avec tes 3 variables comme à l'étape A5)
   npm install
   npm run build
   ```
2. Compresse le dossier entier (clic droit → Envoyer vers → Dossier compressé).
3. hPanel → **Fichiers** → ouvre le dossier de l'application → téléverse le ZIP → clic droit → **Extraire**.
4. hPanel → Node.js → Fichier de démarrage : `.next/standalone/server.js` → **Redémarrer**.

---

# ✅ Vérification finale (les deux options)

1. Ouvre `https://ton-domaine.com` → la boutique s'affiche avec ses produits.
2. Ouvre `https://ton-domaine.com/api/health` → page de diagnostic : chaque ligne doit afficher ✅. S'il y a un ❌, lis-le : il dit EXACTEMENT ce qui manque et comment le corriger.
3. Ouvre `https://ton-domaine.com/admin` → connecte-toi avec ton compte propriétaire.
4. Dans **Admin → Paramètres → Paiements**, saisis tes clés Wave / Orange Money quand tu les reçois.

# 🔄 Mettre la boutique à jour plus tard

Après chaque nouvelle amélioration poussée sur GitHub (l'assistant te le dira) :

- **Option A (VPS)** : `ssh root@TON_IP` puis :
  ```
  cd /opt/teranga && git pull && npm install && npm run build && pm2 restart teranga-market
  ```
- **Option B** : hPanel → Git → **Tirer** (pull), refaire la construction (B4), puis Redémarrer.

# 🔧 Dépannage rapide

| Symptôme | Cause probable | Solution |
|---|---|---|
| Page « 500 Erreur interne du serveur » | Variables d'environnement absentes ou connexion base impossible | Ouvre `/api/health` : la ligne fautive est affichée en ❌ avec l'explication |
| Le site ne répond pas après le domaine | DNS pas encore propagé ou nginx mal configuré | Attends 2 h ; vérifie l'enregistrement A ; `nginx -t` |
| La construction plante (Killed / heap out of memory) | Mémoire insuffisante | VPS : vérifie l'étape A3 (swap) ; Mutualisé : Plan B5 |
| Les images produits ne s'affichent pas | Domaine CDNs bloqué | Elles viennent de `z-cdn.chatglm.cn` — vérifie que le serveur sort bien sur Internet (aucune configuration nécessaire en temps normal) |

# 🔒 Après le lancement : une dernière sécurité

Va sur **github.com → Settings → Developer settings → Fine-grained tokens** et **supprime le jeton d'accès personnel** utilisé pour pousser le code pendant le développement (il n'est plus nécessaire — le dépôt est public en lecture).

---

*Guide généré pour Téranga Market — Next.js 16, build autonome (`npm run build` → serveur `.next/standalone/server.js`, démarrage via `npm start` qui charge automatiquement le fichier `.env`).*
