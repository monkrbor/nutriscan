# NutriScan

Compteur de calories et de macros gratuit, avec scan de code-barres.
Appli en ligne : **https://monkrbor.github.io/nutriscan/**

## Fonctionnalités

- **Calcul de tes besoins** au premier lancement : objectif (perdre, garder, prendre), âge, taille, poids, activité → calories, protéines, glucides, lipides et eau par jour
- **Journal du jour** : anneau des calories restantes (mangé / restant / brûlé), barres de macros, 4 repas avec objectif par repas, navigation par semaine, série de jours suivis
- **Scanner plein écran** : détection automatique du code-barres, lampe, zoom ×2, saisie manuelle du code en secours
- **Fiche produit** : Nutri-Score, quantité en grammes ou en portions, répartition des macros, % de ton objectif, tableau nutritionnel complet, favoris
- **Recherche** : 3 millions de produits du commerce (Open Food Facts) + 75 aliments courants (fruits, féculents, viandes…) qui marchent sans connexion
- **Récents, favoris, mes aliments**, ajout en un clic avec le bouton +
- **Ajout rapide** (juste les calories), **création d'aliments** (un code-barres inconnu est reconnu ensuite)
- **Reprendre le repas d'hier**, vider un repas, modifier ou supprimer chaque aliment
- **Vérification halal au scan** : porc, gélatine, alcool (même en trace : vinaigre de vin, extrait de vanille…), sang en rouge ; viande sans label et origine animale possible (E471, présure…) en orange. L'appli dit ce que contient le produit, sans verdict religieux. Réglable dans Profil
- **Végan / végétarien** sur chaque produit
- **Détail de chaque additif E** (≈ 250 additifs) : nom, rôle, origine, point halal, info santé ; ingrédients surlignés ; allergènes
- **Eau** (verres de 250 ml), **activités** (calories brûlées estimées, ajoutées au budget), **poids**
- **Progrès** : calories sur 7 ou 30 jours, macros moyennes, courbe de poids, IMC, régularité
- **Profil** : objectifs modifiables, thème clair / sombre / automatique, sauvegarde et restauration des données
- Fonctionne hors ligne une fois installée ; le bouton retour d'Android ferme les fenêtres

Les données restent sur le téléphone (stockage du navigateur). Pense à faire une sauvegarde depuis Profil si tu changes de téléphone.

## Installer sur le téléphone

- **Android (Chrome)** : ouvre le lien, menu ⋮ → **Ajouter à l'écran d'accueil**
- **iPhone (Safari)** : ouvre le lien, bouton Partager → **Sur l'écran d'accueil**

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de l'appli |
| `styles.css` | Design (thème clair et sombre) |
| `app.js` | Toute la logique |
| `foods.js` | Aliments courants (valeurs moyennes pour 100 g) |
| `additives.js` | Base des additifs E (rôle, origine, halal, santé) |
| `halal.js` | Analyse halal, végan / végétarien, surlignage des ingrédients |
| `sw.js` | Mode hors ligne |
| `manifest.webmanifest`, icônes | Installation sur l'écran d'accueil |

Données produits : [Open Food Facts](https://world.openfoodfacts.org), licence ODbL.
