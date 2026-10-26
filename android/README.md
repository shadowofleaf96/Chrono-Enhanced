# 📦 Chrono Mohammedia - Android Operations & Settlement App

Application Android moderne (Material 3 + Kotlin + Gradle) conçue pour la gestion des opérations du Hub Mohammedia (Chronodiali / Chronopost).

---

## 🚀 Fonctionnalités Clés

### 1. Menu de Navigation Dédié (Navigation Drawer)
Accessible via le bouton menu (hamburger) ou par balayage depuis la gauche :
- 🚴 **Livreurs (Tous)** : Vue d'ensemble de l'ensemble de la flotte du Hub.
- ✅ **Courses Terminées (✔)** : Filtre direct pour afficher uniquement les livreurs ayant achevé leur tournée.
- 💰 **Montants à Régler (MAD)** : Filtre sur les livreurs avec solde financier à encaisser / régler.
- 📦 **Colis Non Livrés** : Vue ciblée sur les livreurs ayant des échecs de livraison (absents, reportés, injoignables).
- ⚙ **Configuration & API** : Bascule entre les données démo du Hub Mohammedia et l'API live Shipsy.

### 2. Indicateur de Statut de Course (Course Terminée)
Chaque livreur dispose d'un badge dynamique :
- **✔ Course Terminée** (Vert émeraude) : Tournée terminée (`trip.status == "completed"`).
- **🚚 En Course** (Orange ambré) : Tournée toujours en cours de distribution.

### 3. Montant à Régler (Règlement en MAD)
- Affichage clair et bien mis en valeur du **montant dû en Dirhams marocains (MAD)** pour chaque livreur.
- Bannière KPI supérieure affichant le montant total cumulé du Hub pour la journée.

### 4. Suivi des Colis Livrés & Non Livrés
- **Colis Livrés** : Nombre de colis validés avec succès (badge vert).
- **Colis Non Livrés** : Nombre de colis en échec ou reportés (badge rouge d'alerte).
- **Barre de progression** visuelle illustrant le taux de réussite (ex. 85%, 92%).

### 5. Fiche Détail Livreur (Modal Bottom Sheet)
En appuyant sur n'importe quel livreur :
- Fiche complète avec nom, code livreur, statut, et montant total.
- **Bouton d'appel direct** (`tel:...`) pour contacter immédiatement le livreur.
- Sélecteur d'onglets :
  - **Colis Livrés** (avec numéros d'expédition CN, montants MAD, destinataires).
  - **Colis Non Livrés** (avec motifs d'échec : Client absent, Reporté à demain, Injoignable, etc.).

---

## 🛠 Structure du Projet

```
android/
├── build.gradle.kts                # Configuration Gradle racine
├── settings.gradle.kts             # Configuration du projet & des dépôts
├── gradle.properties               # Paramètres JVM & AndroidX
├── gradlew / gradlew.bat           # Wrapper Gradle
├── gradle/
│   ├── libs.versions.toml          # Version Catalog (AGP, Kotlin, Retrofit, Material 3)
│   └── wrapper/
│       └── gradle-wrapper.properties (Gradle 8.7)
└── app/
    ├── build.gradle.kts            # Dépendances & SDK (compileSdk 34, minSdk 24)
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/chrono/mohammedia/
        │   ├── data/
        │   │   ├── model/Models.kt            # RiderItem, TripStatus, ParcelDetail, HubSummary
        │   │   ├── remote/ChronoApiService.kt # Endpoints Shipsy (Trips, TaskSummary, Reconciliation)
        │   │   ├── remote/ApiClient.kt        # Client Retrofit avec HttpLoggingInterceptor
        │   │   └── repository/RiderRepository.kt # Données réelles seed Mohammedia + Live API
        │   └── ui/
        │       ├── MainActivity.kt            # Menu Navigation Drawer & coordination
        │       ├── adapter/RiderAdapter.kt    # Cartes de livreurs avec badges
        │       ├── adapter/ParcelAdapter.kt   # Lignes détaillées des colis
        │       ├── riders/RidersViewModel.kt  # Gestion d'état LiveData & filtres
        │       ├── riders/RidersFragment.kt   # Dashboard principal, KPI & recherche
        │       ├── riders/RiderDetailBottomSheet.kt # Modal détaillé des colis
        │       └── settings/SettingsFragment.kt     # Écran configuration tokens
        └── res/
            ├── drawable/                      # Icônes vectorielles & formes arrondies
            ├── layout/                        # Interfaces XML modernes
            ├── menu/                          # Menu tiroir & barre d'action
            └── values/                        # Couleurs Chrono, chaînes FR & thèmes M3
```

---

## 💻 Comment ouvrir et exécuter dans Android Studio (Sur votre autre PC)

1. Transférez ou clonez le dossier `android/` sur votre ordinateur équipé d'Android Studio.
2. Lancez **Android Studio**.
3. Choisissez **Open** (ou *File > Open*).
4. Sélectionnez le dossier `android` (`.../Chrono-Enhanced-Mohammedia/android`).
5. Android Studio va lancer automatiquement le **Gradle Sync** :
   - Gradle 8.7 et les dépendances (Material 3, Retrofit, Navigation KTX) se téléchargeront tout seuls via le wrapper.
6. Connectez votre téléphone Android (avec Débogage USB activé) ou lancez un émulateur.
7. Cliquez sur **Run (Bouton vert ▶ ou Shift + F10)**.
8. L'application démarre immédiatement avec le jeu de données opérationnel du Hub Mohammedia !
