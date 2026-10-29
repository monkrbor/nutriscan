# NutriScan

Compteur de calories et de macros gratuit, avec scan de code-barres.
Appli en ligne : **https://monkrbor.github.io/nutriscan/**

## Fonctionnalités

- **Compte obligatoire** dès l'ouverture : e-mail + mot de passe ou Google, avec accord pour la sauvegarde et (au choix) pour les statistiques
- **Sport** : questionnaire (objectif, salle / maison / poids du corps, matériel, jours, durée, niveau, douleurs), programme sur mesure, séance guidée (séries, charges, minuteur de repos), progression automatique des charges, historique ; 97 exercices animés avec une silhouette neutre (aucune photo de personne)
- **Repas** : questionnaire de goûts, idées qui rentrent dans les calories restantes, 75 recettes pas à pas (portions ajustables, ajout au journal), menu de la semaine et liste de courses ; jamais de porc, d'alcool ni de sang
- **Installer l'appli** : bouton d'installation (Android) et guide en 3 étapes (iPhone), raccourcis Scanner / Repas / Sport sur l'icône
- **Calcul de tes besoins** au premier lancement : objectif (perdre, garder, prendre), âge, taille, poids, activité → calories, protéines, glucides, lipides et eau par jour
- **Journal du jour** : anneau des calories restantes (mangé / restant / brûlé), barres de macros, 4 repas avec objectif par repas, navigation par semaine, série de jours suivis
- **Scanner plein écran** : lecteur natif du téléphone (Android) ou moteur ZXing en WebAssembly (iPhone), lecture de la zone du cadre en haute définition, vérification de la clé de contrôle du code-barres, lampe, zoom ×2, saisie manuelle du code en secours
- **Fiche produit** : Nutri-Score, quantité en grammes ou en portions, répartition des macros, % de ton objectif, tableau nutritionnel complet, favoris
- **Recherche** : des millions de produits du commerce + 75 aliments courants (fruits, féculents, viandes…) qui marchent sans connexion
- **Récents, favoris, mes aliments**, ajout en un clic avec le bouton +
- **Ajout rapide** (juste les calories), **création d'aliments** (un code-barres inconnu est reconnu ensuite)
- **Reprendre le repas d'hier**, vider un repas, modifier ou supprimer chaque aliment
- **Avertissements au scan** (sans aucun verdict) : en rouge ce que le produit contient (porc, gélatine, alcool même en trace comme le vinaigre de vin ou l'extrait de vanille, sang, additif à éviter) ; en orange ce qui est à vérifier (viande dont l'abattage n'est pas précisé, origine animale possible comme E471 ou présure, additifs à limiter, huile de palme, édulcorants, allergènes, traces). Réglables dans Profil
- **Végan / végétarien** sur chaque produit
- **Détail de chaque additif E** (≈ 250 additifs) : nom, rôle, origine, info santé ; ingrédients surlignés
- **Comptes** par e-mail + mot de passe ou avec Google, **sauvegarde en ligne** (Supabase) avec consentement, sauvegarde automatique, récupération sur un autre téléphone, suppression du compte
- **Statistiques et rapports d'erreurs** seulement si l'utilisateur accepte au premier lancement (modifiable dans Profil → À propos)
- **Panneau admin** (`admin.html`) : vue d’ensemble (comptes, appareils actifs, réussite des scans, erreurs) ; liste des comptes avec leur progression (jours suivis, poids, objectif) ; fiche complète de chaque utilisateur (courbe de poids, calories sur 30 jours, moyennes, régularité, journal jour par jour, profil, aliments créés) ; export JSON ou tableur, export de tous les comptes, restauration depuis un fichier, une version précédente ou une sauvegarde complète ; bloquer, supprimer, lien de mot de passe, note privée, messages ; erreurs regroupées et activité
- **Eau** (verres de 250 ml), **activités** (calories brûlées estimées, ajoutées au budget), **poids**
- **Progrès** : calories sur 7 ou 30 jours, macros moyennes, courbe de poids, IMC, régularité
- **Profil** : objectifs modifiables, thème clair / sombre / automatique, sauvegarde et restauration des données
- **Hors ligne** : tout fonctionne sans Internet (journal, scan, aliments courants et déjà vus, objectifs, progrès). Un produit jamais vu scanné hors ligne est ajouté puis complété automatiquement au retour du réseau
- **Synchronisation** : au retour en ligne, les modifications partent vers le compte et celles des autres appareils sont fusionnées (suppressions comprises)
- Le bouton retour d'Android ferme les fenêtres

Sans compte, les données restent sur le téléphone. Avec un compte, elles sont aussi sauvegardées en ligne.

## Activer les comptes (Supabase)

1. Crée un projet sur https://supabase.com (gratuit).
2. SQL Editor → colle le contenu de `supabase.sql` → Run.
3. Authentication → Sign In / Providers → Email : désactive « Confirm email ».
4. Authentication → URL Configuration : Site URL et Redirect URLs = `https://monkrbor.github.io/nutriscan/` (ajoute aussi `https://monkrbor.github.io/nutriscan/admin.html`).
5. Mets le Project URL et la clé publique (anon / publishable) dans `config.js`. Jamais la clé `service_role` / secrète.
6. Crée ton compte dans l'appli, puis lance dans le SQL Editor la ligne `insert into public.admins …` (fin de `supabase.sql`) avec ton e-mail.
7. Ouvre `admin.html`.

### Connexion avec Google (facultatif)

1. Sur https://console.cloud.google.com : crée un projet → API et services → Écran de consentement OAuth (externe) → Identifiants → Créer un ID client OAuth « Application Web ».
2. URI de redirection autorisé : `https://<ton-projet>.supabase.co/auth/v1/callback`.
3. Dans Supabase → Authentication → Sign In / Providers → Google : active, colle l'ID client et le code secret client.
4. Dans `config.js`, ajoute `google: true`.

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
| `exercises.js`, `figure.js`, `sport.js` | Exercices, animations de la silhouette, section Sport |
| `recipes.js`, `meals.js` | Recettes (valeurs calculées par ingrédient), section Repas |
| `config.js` | Adresse et clé publique Supabase |
| `cloud.js` | Comptes et sauvegarde en ligne |
| `admin.html`, `admin.js` | Panneau d'administration (utilisateurs, statistiques, erreurs, messages) |
| `supabase.sql` | Tables et règles de sécurité à créer dans Supabase |
| `sw.js` | Mode hors ligne |
| `manifest.webmanifest`, icônes | Installation sur l'écran d'accueil |

