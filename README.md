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
- **Avertissements au scan** (sans aucun verdict) : en rouge ce que le produit contient (porc, gélatine, alcool même en trace comme le vinaigre de vin ou l'extrait de vanille, sang, additif à éviter) ; en orange ce qui est à vérifier (viande dont l'abattage n'est pas précisé, origine animale possible comme E471 ou présure, additifs à limiter, huile de palme, édulcorants, allergènes, traces). Réglables dans Profil
- **Végan / végétarien** sur chaque produit
- **Détail de chaque additif E** (≈ 250 additifs) : nom, rôle, origine, info santé ; ingrédients surlignés
- **Comptes et sauvegarde en ligne** (Supabase) avec consentement, sauvegarde automatique, récupération sur un autre téléphone, suppression du compte
- **Page admin** (`admin.html`) : liste des comptes, détail, téléchargement, versions précédentes, restauration
- **Eau** (verres de 250 ml), **activités** (calories brûlées estimées, ajoutées au budget), **poids**
- **Progrès** : calories sur 7 ou 30 jours, macros moyennes, courbe de poids, IMC, régularité
- **Profil** : objectifs modifiables, thème clair / sombre / automatique, sauvegarde et restauration des données
- Fonctionne hors ligne une fois installée ; le bouton retour d'Android ferme les fenêtres

Sans compte, les données restent sur le téléphone. Avec un compte, elles sont aussi sauvegardées en ligne.

## Activer les comptes (Supabase)

1. Crée un projet sur https://supabase.com (gratuit).
2. SQL Editor → colle le contenu de `supabase.sql` → Run.
3. Authentication → Sign In / Providers → Email : désactive « Confirm email » (ou règle l'URL du site sur l'adresse de l'appli).
4. Mets le Project URL et la clé publique (anon / publishable) dans `config.js`.
5. Crée ton compte dans l'appli, puis lance dans le SQL Editor la ligne `insert into public.admins …` (fin de `supabase.sql`) avec ton e-mail.
6. Ouvre `admin.html`.

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
| `additives.js` | Base des additifs E (rôle, origine, santé) |
| `ingredients.js` | Avertissements, végan / végétarien, allergènes, surlignage des ingrédients |
| `config.js` | Adresse et clé publique Supabase |
| `cloud.js` | Comptes et sauvegarde en ligne |
| `admin.html`, `admin.js` | Page d'administration des sauvegardes |
| `supabase.sql` | Tables et règles de sécurité à créer dans Supabase |
| `sw.js` | Mode hors ligne |
| `manifest.webmanifest`, icônes | Installation sur l'écran d'accueil |

Données produits : [Open Food Facts](https://world.openfoodfacts.org), licence ODbL.
