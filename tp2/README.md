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
