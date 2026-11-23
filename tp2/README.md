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

| Mauvaise pratique                               | Pourquoi c'est un problème                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `fs.readFileSync` + `fs.existsSync` dans `/big` | Opérations synchrones : elles bloquent l'event loop. Pendant la lecture du fichier, le serveur ne répond à aucune autre requête, même `/`. |
| Fichier entier chargé en mémoire                | La mémoire consommée est proportionnelle à la taille du fichier, et ce à chaque requête.                                                   |
| Middleware `console.log` sur chaque requête     | Écriture sur stdout à chaque requête, coûteuse sous charge et inutile en production.                                                       |
| Dépendance `mongodb` jamais utilisée            | Alourdit `node_modules`, l'image et le temps d'installation.                                                                               |
| Pas de gestion de `SIGTERM`                     | `docker stop` attend la fin du délai (10 s par défaut) puis tue le processus de force.                                                     |
| Fichier absent renvoyé avec un code 200         | Code HTTP incorrect, il faut un 404.                                                                                                       |
| Header `X-Powered-By: Express`                  | Révèle la technologie utilisée sans utilité.                                                                                               |

### Modifications apportées

1. **Suppression de `mongodb`** (`npm uninstall mongodb`) : `node_modules` dans l'image passe de 13,2 Mo à 4,4 Mo (-67 %).
2. **Lecture en streaming** (`createReadStream` + `pipeline`) : le fichier est lu et transformé par morceaux, jamais entièrement en mémoire, et l'event loop n'est plus bloquée.
3. **Logs désactivés en production** : le middleware n'est actif que si `NODE_ENV !== 'production'` (valeur définie dans le Dockerfile).
4. **Arrêt propre sur `SIGTERM`/`SIGINT`** : `docker stop` passe de 3,5 s à 0,43 s.
5. **Petites corrections** : code 404 pour un fichier absent, `x-powered-by` désactivé, script `dev` avec `nodemon`.

### Méthode de mesure

- Même Dockerfile (celui de l'étape 1) pour l'avant et l'après : seuls `server.js` et `package.json` changent.
- Fichier de test de 23 Mo servi par `/big`.
- Charge : `npx autocannon -c 20 -d 10 http://localhost:3000/big` (20 connexions, 10 s, timeout autocannon de 10 s).
- Latence de `/` : `curl.exe -w "%{time_total}"`, pendant la charge sur `/big`.
- Mémoire : `docker stats --no-stream` pendant la charge. Arrêt : `Measure-Command { docker stop app }`.
- Environnement : Docker Desktop sous Windows. Le réseau virtuel limite le débit, donc les valeurs absolues de latence sur `/big` dépendent de la machine ; c'est la comparaison avant/après qui compte.

### Résultats

| Mesure                            | Avant                        | Après                          | Gain                |
| --------------------------------- | ---------------------------- | ------------------------------ | ------------------- |
| `node_modules` dans l'image       | 13,2 Mo                      | 4,4 Mo                         | -67 %               |
| Taille de l'image (disk usage)    | 231 MB                       | 220 MB                         | -4,8 %              |
| Taille de l'image (content size)  | 50,7 MB                      | 49,1 MB                        | -3,2 %              |
| Données reçues sur `/big` en 10 s | 46 MB (2 réponses complètes) | 460 MB (20 réponses complètes) | ×10                 |
| Requêtes en erreur (timeout)      | 19 sur 41                    | 0 sur 40                       |                     |
| Latence de `/` pendant la charge  | 5,8 à 14,9 s                 | 40 à 70 ms                     | environ ×100 à ×300 |
| Mémoire sous charge               | jusqu'à 274 MiB              | ~51 MiB                        | -81 %               |
| Temps de `docker stop`            | 3,5 s                        | 0,43 s                         | -88 %               |

Les résultats d'autocannon « avant » sont identiques sur deux essais consécutifs (41 requêtes, 46 MB, 19 timeouts). L'avertissement `TimeoutNegativeWarning` affiché par autocannon vient de l'outil lui-même, pas de l'application.

### Analyse

**Latence de `/` : c'est le résultat principal.** Avec l'ancien code, une requête sur `/` met entre 6 et 15 secondes pendant que `/big` est sollicité, contre 40 à 70 ms avec le streaming. `readFileSync` bloque l'event loop de Node, donc le serveur ne peut rien faire d'autre pendant la lecture et la transformation du fichier. Avec le streaming, la lecture est asynchrone et `/` reste réactif. Une fois la charge terminée, `/` répond en 10 à 17 ms avec l'ancien code, ce qui confirme que le blocage vient bien de `/big`.

**Débit.** Avec l'ancien code, 19 requêtes sur 41 dépassent le timeout de 10 s et seules 2 réponses se terminent (46 MB lus). Avec le streaming, les 20 réponses se terminent (460 MB lus). Les latences affichées par autocannon sur `/big` ne sont pas comparables entre les deux versions : avant, seules les rares requêtes réussies sont comptées.

**Mémoire.** Avant, le fichier est chargé en entier (23 Mo en UTF-8, puis une copie après `replace`), pour chaque requête simultanée : jusqu'à 274 MiB. Avec le streaming, la mémoire reste de l'ordre de 50 MiB quel que soit le nombre de requêtes. Avec l'ancien code, elle reste aussi élevée (~225 MiB) après la fin de la charge, car le moteur V8 ne rend pas immédiatement la mémoire.

**Arrêt.** Le handler `SIGTERM` ferme le serveur proprement et quitte en 0,43 s, contre 3,5 s avant.

**Taille de l'image.** Le gain est faible (environ 11 MB sur le disk usage, soit -4,8 %) : la dépendance `mongodb` supprimée ne pesait que 9 Mo. Les vrais gains de taille viennent de l'étape 1 (alpine, `--omit=dev`). L'étape 2 agit surtout sur le comportement à l'exécution.

### Pistes non retenues

Remplacer Express par le module natif `http` réduirait encore `node_modules`, mais rendrait le code moins lisible. Express reste un compromis raisonnable pour cette application.
