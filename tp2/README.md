# TP2 - Optimisation Docker

## Exercice : Optimisation d’une application et de son dockerfile

### Changement effectué

En premier, j'ai mis une image plus légere pour node en utilisant une alpine.
node:latest                   d51f6f8bf3cc       1.88GB          474MB

Avec alpine :
node:latest                   8b51e9641255        234MB         55.7MB 

Optimiser l'ordre des couches pour exploiter le cache Docker (package*.json d'abord, puis npm ci, puis le code).

Supprimer les installations apt-get inutiles et exécuter l'application avec un utilisateur non-root.

Séparer l'étape de construction de l'image finale pour ne garder que le strict nécessaire (fichiers de production et dépendances de production uniquement avec npm ci --omit=dev).