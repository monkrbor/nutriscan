# NutriScan

Appli de suivi des calories et des macros (protéines, glucides, lipides) avec scan de code-barres.
Les infos des produits viennent d'Open Food Facts (base gratuite, plus de 3 millions de produits).

## Ce qu'elle fait

- Scan du code-barres avec la caméra → nom, marque, Nutri-Score, calories et macros du produit
- Choix de la quantité en grammes (ou 1 portion) et du repas
- Recherche par nom quand il n'y a pas de code-barres
- Création d'un aliment à la main (s'il n'est pas dans la base, il sera reconnu au prochain scan)
- Résumé du jour : calories restantes + barres de protéines, glucides, lipides
- Objectifs personnalisables, historique des 7 derniers jours
- Fonctionne comme une vraie appli une fois ajoutée à l'écran d'accueil

Les données restent sur le téléphone (stockage du navigateur).

## Mettre l'appli en ligne (gratuit, 5 minutes)

La caméra ne marche que sur une adresse en `https://`. Le plus simple : GitHub Pages.

1. Crée un compte sur https://github.com (si tu n'en as pas).
2. Clique sur **New repository**, nomme-le `nutriscan`, coche **Public**, puis **Create repository**.
3. Clique sur **uploading an existing file** et glisse tous les fichiers de ce dossier
   (`index.html`, `manifest.webmanifest`, `sw.js`, les icônes). Clique sur **Commit changes**.
4. Va dans **Settings → Pages**. Dans *Branch*, choisis `main` et `/ (root)`, puis **Save**.
5. Attends 1 à 2 minutes. Ton appli est en ligne à l'adresse :
   `https://TON-PSEUDO.github.io/nutriscan/`

## L'installer sur ton téléphone

- **Android (Chrome)** : ouvre l'adresse, menu ⋮ → **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
- **iPhone (Safari)** : ouvre l'adresse, bouton Partager → **Sur l'écran d'accueil**.

Au premier scan, autorise l'accès à la caméra.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Toute l'appli (interface + code) |
| `manifest.webmanifest` | Nom et icône quand on l'installe sur le téléphone |
| `sw.js` | Garde l'appli en cache pour qu'elle s'ouvre même sans réseau |
| `icon.svg`, `icon-*.png` | Icônes |
