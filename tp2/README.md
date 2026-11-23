# TP2 - Optimisation Docker

## Exercice : Optimisation d’une application et de son dockerfile

## Étape 1 : Optimisation du Dockerfile

### Problèmes identifiés dans le Dockerfile d'origine

| Mauvaise pratique                                | Pourquoi c'est un problème                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Image de base `node:latest`                      | Image Debian complète (~1.88 GB sur disque) contenant de nombreux outils inutiles à l'exécution. Le tag `latest` n'est pas reproductible : la version de Node peut changer d'un build à l'autre. |
| Installations `apt-get` inutiles                 | Ajoutent des couches lourdes et élargissent la surface d'attaque, sans rien apporter à l'application.                                                                                            |
| Code copié avant l'installation des dépendances  | Chaque modification du code invalide le cache et force un `npm install` complet.                                                                                                                 |
| Exécution en `root`                              | Si l'application est compromise, l'attaquant a les droits root dans le conteneur.                                                                                                                |
| Dépendances de développement dans l'image finale | Alourdit l'image avec des paquets inutiles en production.                                                                                                                                        |
| Pas de `.dockerignore`                           | `COPY . .` envoie `node_modules`, `.git`, etc. dans le contexte de build et dans l'image.                                                                                                        |

### Modifications apportées

1. **Image `node:20-alpine`** au lieu de `node:latest`
   Alpine est une distribution minimaliste. Le tag de version fixe rend le build reproductible.

2. **Ordre des couches optimisé pour le cache**
   `COPY package*.json` puis `npm ci`, et seulement ensuite `COPY . .`.
   Tant que les dépendances ne changent pas, Docker réutilise la couche `npm ci` en cache.

3. **Suppression des `apt-get` inutiles**
   Moins de couches et moins de paquets système installés.

4. **Utilisateur non-root**
   Ajout de `USER node` (utilisateur fourni par l'image Alpine). Le processus ne tourne plus avec les droits root.

5. **Build multi-stage + `npm ci --omit=dev`**
   Un premier stage (`deps`) installe uniquement les dépendances de production (`--omit=dev`), puis nettoie le cache npm (`npm cache clean --force`). Le stage final (`runner`) n'en récupère que `node_modules` avec `COPY --from=deps`. L'image finale ne contient que le nécessaire pour exécuter l'application.

6. **Ajout d'un `.dockerignore`**
   Exclut `node_modules`, `.git`, `.env`, etc. Le contexte de build est plus léger et les `node_modules` locaux ne peuvent pas écraser ceux de l'image.

Résultat final :
C:\Users\alexi\Documents\GitHub\Tp-Docker-Alexi\tp2>docker build --no-cache -t tp:etape1 .  
[+] Building 15.3s (11/11) FINISHED

C:\Users\alexi\Documents\GitHub\Tp-Docker-Alexi\tp2>docker images tp:etape1  
 i Info → U In Use
IMAGE ID DISK USAGE CONTENT SIZE EXTRA
tp:etape1 7bd9db2cf9b7 209MB 50.7MB

## Étape 2 : Optimisation de l'application Node.js

### Problèmes identifiés dans le code

| Mauvaise pratique                                                 | Pourquoi c'est un problème                                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs.readFileSync` + `fs.existsSync` dans la route `/big`          | Opérations **synchrones** : elles bloquent l'event loop. Pendant la lecture du fichier, le serveur ne répond à aucune autre requête (même `/`).             |
| Fichier entier chargé en mémoire (`readFileSync` puis `.replace`) | La consommation mémoire est proportionnelle à la taille du fichier, et à chaque requête. Avec plusieurs requêtes simultanées, risque de saturation mémoire. |
| Middleware qui logge chaque requête avec `console.log`            | Écriture sur stdout à chaque requête (coûteuse sous forte charge), inutile en production.                                                                   |
| Dépendance `mongodb` jamais utilisée                              | Alourdit `node_modules`, donc l'image, le temps d'installation et la surface d'attaque.                                                                     |
| Pas de gestion de `SIGTERM`                                       | `docker stop` attend 10 s puis tue le processus de force (SIGKILL). Les connexions en cours sont coupées brutalement.                                       |
| Header `X-Powered-By: Express`                                    | Révèle la technologie utilisée, sans aucune utilité.                                                                                                        |
| Fichier introuvable renvoyé avec un code 200                      | Un code HTTP incorrect ; l'erreur doit être un 404.                                                                                                         |

### Modifications apportées

1. **Suppression de la dépendance `mongodb`** (`npm uninstall mongodb`)
   Elle n'est importée nulle part. `node_modules` passe de XXX Mo à XXX Mo.

2. **Lecture du fichier en streaming** (`fs.createReadStream` + `stream.pipeline`)
   Le fichier est lu par petits morceaux, transformés (`\n` → `<br/>`) puis envoyés au client au fur et à mesure. Il n'est plus jamais entièrement en mémoire, et l'event loop n'est plus bloquée.
   `pipeline` libère les ressources si le client se déconnecte en cours de route.

3. **Logs désactivés en production**
   Le middleware n'est actif que si `NODE_ENV !== 'production'`. Le Dockerfile définit `NODE_ENV=production`, donc il est désactivé dans le conteneur.

4. **Arrêt propre sur `SIGTERM` / `SIGINT`**
   Le serveur arrête d'accepter de nouvelles connexions, termine celles en cours, puis quitte. `docker stop` passe de XXX s à XXX s.

5. **Petites corrections**
   `x-powered-by` désactivé, code 404 pour un fichier absent, script `dev` utilisant `nodemon` (qui reste en `devDependencies`, donc absent de l'image grâce à `npm ci --omit=dev`).

### Méthode de mesure

- Charge : `npx autocannon -c 20 -d 10 http://localhost:3000/big` (fichier de test d'environ 23 Mo).
- Latence de la route `/` **pendant** la charge sur `/big` : `curl -o /dev/null -s -w '%{time_total}\n' http://localhost:3000/`.
- Mémoire : `docker stats --no-stream`.
- Taille : `docker images` et `du -sh node_modules`.

### Résultats

|                                             | Avant (étape 1) | Après (étape 2) |
| ------------------------------------------- | --------------- | --------------- |
| Taille de `node_modules`                    | XXX Mo          | XXX Mo          |
| Taille de l'image                           | XXX Mo          | XXX Mo          |
| Requêtes/s sur `/big`                       | XXX             | XXX             |
| Latence de `/` pendant la charge sur `/big` | XXX ms          | XXX ms          |
| Mémoire du conteneur sous charge            | XXX Mo          | XXX Mo          |
| Temps de `docker stop`                      | ~10 s           | XXX s           |

### Analyse

L'optimisation du Dockerfile (étape 1) réduit la taille de l'image et accélère les builds. L'optimisation du code (étape 2) agit sur le **comportement à l'exécution** : le serveur ne se bloque plus sur les lectures de fichier, consomme moins de mémoire et s'arrête proprement. La suppression de `mongodb` a un effet à la fois sur la taille de l'image et sur le temps d'installation.

### Pistes non retenues

Remplacer Express par le module natif `http` réduirait encore la taille de l'image, mais au prix d'un code moins lisible et maintenable. Pour une application aussi simple, Express reste un compromis raisonnable.
