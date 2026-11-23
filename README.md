# WOD War Room

Préparer une compétition CrossFit par équipe de trois **sans arriver fatigué**.

L'application sert pendant la semaine de compétition et pendant les séances d'équipe : elle rappelle les WODs de l'édition précédente, aide à composer des mini-WODs ciblés, signale quand une séance devient trop lourde à l'approche du jour J, propose une version plus sûre en un clic, et garde une trace des compétences de chacun.

Interface en français, pensée d'abord pour le téléphone.

## Ce que fait l'application

| Écran | Rôle |
| --- | --- |
| **Tableau de bord** | Jours restants, séance du jour, charge planifiée, point bloquant principal, priorités de l'équipe. |
| **Semaine** | Planning du lundi au jour J. Ajouter, déplacer, modifier, supprimer une séance ; alerte si une séance exigeante arrive à J-2 ou J-1. |
| **Mini-WOD Builder** | Six modèles (dont les trois du cahier des charges) et un générateur par objectif, durée, matériel et intensité. Tout est modifiable : mouvements, reps, charges, tours, synchro, repos, jour. |
| **Mode séance** | Briefing, décompte de 10 s, chrono (cap ou AMRAP), compteur de tours, puis débrief : résultat, RPE réel, évaluation à chaud des mouvements. |
| **Équipe** | Matrice de compétence (à l'aise, gérable, difficile, pas encore acquis, inconnu), 1RM, max enchaînés, tests enregistrés. |
| **Stratégie** | Qui fait quoi sur chaque WOD de référence, comparaison des binômes synchro, partage des reps, deux scénarios A/B comparés. |
| **Fatigue Guard** | Indice de fraîcheur, charge par jour, zones sollicitées, alertes, récupération déclarée, formule et réglages. |
| **WODs de référence** | Les trois WODs de l'an dernier, ce qu'ils demandent, ce qui est noté et ce qui reste à confirmer. |

## Principes

- **Rien n'est inventé.** Les profils non renseignés restent « inconnus ». Les règles absentes des notes (synchro, partage des reps, scoring) sont listées comme « à confirmer » et ne sont jamais supposées.
- **Les WODs de référence sont ceux de l'an dernier**, pas les épreuves confirmées.
- **L'utilisateur garde la main.** Aucune alerte ne bloque l'édition ; chaque correction automatique est annulable.
- **Pas de fausse précision.** Le Fatigue Guard est une heuristique de planification. Il ne prédit ni blessure ni fatigue réelle et ne remplace ni un coach ni un professionnel de santé.

## Fatigue Guard : comment c'est calculé

```
score d'une séance = (volume + durée) × intensité × proximité × contexte
```

- **Volume** : reps par athlète impliqué × coût du mouvement (1 burpee = 1 point) × facteur de charge. Synchro : chaque athlète fait toutes les reps ; partagé : les reps sont divisées.
- **Facteur de charge** : `0,6 + charge / 1RM` quand le 1RM est connu ; 1 sinon ; 1,5 quand le 1RM est inconnu et la charge élevée.
- **Durée** : minutes × 0,8.
- **Intensité** : `(RPE / 6) ^ 1,6`.
- **Proximité** : ×1,05 à J-4, ×1,2 à J-3, ×1,6 à J-2, ×2 à J-1.
- **Contexte** : ×1,15 si un athlète reprend après deux semaines d'arrêt ou plus ; ×1,15 si la récupération déclarée est basse.

Seuils par défaut : 100 (attention) et 160 (risque élevé) par séance ; 300 et 450 sur la semaine.

Des règles explicites s'ajoutent au score : squats ou fentes lourds près de la compétition, charge à 90 % du 1RM ou plus, RPE trop élevé pour le jour, volume de burpees ou de gym à la barre, grip et overhead cumulés, travail excentrique des jambes, hausse de volume par rapport au modèle, séance longue, douleur signalée.

Chaque alerte orange ou rouge donne une explication, ses facteurs, une suggestion et, quand c'est possible, un correctif en un clic. L'« alternative plus sûre » garde les mêmes mouvements et ne modifie que ce qui déclenche une alerte.

Tous les seuils et multiplicateurs se règlent dans l'écran Fatigue Guard. Le code est dans [`src/domain/risk.ts`](src/domain/risk.ts).

## Partage entre athlètes

GitHub Pages est un hébergement statique : il n'y a ni serveur ni synchronisation en temps réel.

**Mode livré : partage sans configuration**

- Les données restent dans le navigateur de chaque téléphone (`localStorage`).
- « Partager le plan » produit un lien qui contient tout le plan, compressé dans l'URL (environ 3 500 caractères). Le destinataire l'ouvre, voit un résumé et choisit de le charger ou non.
- « Partager ce mini-WOD » produit un lien plus court pour une seule séance.
- Export et import d'un fichier JSON pour la sauvegarde.
- Après une modification, il faut renvoyer le lien : l'application le dit clairement.
- Le lien contient les profils et la récupération déclarée : quiconque le reçoit peut les lire.

**Mode collaboratif en temps réel : non livré**

Un espace partagé avec Supabase (authentification, Row Level Security, synchronisation, historique) n'a pas été implémenté : il demande un projet Supabase à créer et ne pouvait pas être testé de bout en bout. Plutôt qu'une synchronisation à moitié fonctionnelle, l'application s'en tient au partage par lien.

Pour l'ajouter plus tard : une table `plans (id, team_id, state jsonb, updated_at, updated_by)`, des politiques RLS limitant lecture et écriture aux membres de `team_members`, un abonnement Realtime sur la ligne du plan, et uniquement la clé publique `anon` dans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. La clé `service_role` ne doit jamais se trouver dans le code du navigateur.

## Installation

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement. |
| `npm test` | Tests unitaires (Vitest). |
| `npm run lint` | Lint (oxlint), avertissements refusés. |
| `npm run typecheck` | Vérification TypeScript. |
| `npm run build` | Build de production dans `dist/`. |
| `npm run preview` | Sert le build local. |
| `npm run check` | Lint, types, tests et build à la suite. |

## Déploiement

Chaque `push` sur `main` lance [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) : lint, types, tests, build, puis publication sur GitHub Pages.

Pour un nouveau dépôt :

```bash
gh repo create <compte>/wod-war-room --public --source . --push
gh api -X POST repos/<compte>/wod-war-room/pages -f build_type=workflow
```

Le build utilise des chemins relatifs (`base: './'`) et un routage par hash (`#/builder`), donc le site fonctionne sous n'importe quel sous-chemin et un rechargement ne produit jamais de 404.

## Architecture

```
src/
  domain/        Logique pure, sans React, entièrement testée
    types.ts       Modèle de données
    movements.ts   Catalogue des mouvements (coût, zones, matériel, 1RM de référence)
    data.ts        WODs de référence, modèles, profils et plan par défaut
    calc.ts        Calculs de WOD, charges relatives, dates
    risk.ts        Fatigue Guard, alternative plus sûre, semaine, indice de fraîcheur
    generator.ts   Générateur de mini-WODs
    strategy.ts    Binômes, répartition de la charge, points bloquants
    share.ts       Nettoyage des données entrantes, liens, JSON
    domain.test.ts 57 tests
  state/store.tsx  État global, persistance locale, routage par hash
  components/      Éditeur de WOD, panneau Fatigue Guard, partage
  pages/           Un fichier par écran
  ui/kit.tsx       Composants de base
```

Pile : React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, lucide-react, lz-string. Polices embarquées (Inter, Barlow Condensed) : aucune requête vers un service tiers.

Toute donnée venant d'un lien, d'un fichier ou du stockage local passe par `sanitizeState` : valeurs bornées, mouvements inconnus écartés, textes tronqués.

## Tests

`npm test` couvre notamment : volumes synchro et partagés, zéro tour, valeurs négatives ou non numériques, charges extrêmes, 1RM manquants, profils vides, calibration des modèles (verts du lundi au mercredi), WODs de compétition (rouges), hausse de 60 % des burpees, squats lourds à 48 h, séance exigeante jeudi ou vendredi, règles contradictoires, alternative plus sûre (toujours verte quand la cause est corrigeable, séance d'origine intacte), générateur selon le matériel, binômes sans données, aller-retour des liens, liens abîmés et données malformées.

## Limites connues

- Pas de synchronisation automatique entre téléphones (voir plus haut).
- Les coûts par mouvement et les seuils sont des choix raisonnés, pas des valeurs validées scientifiquement.
- Quand la répartition d'un mouvement n'est pas précisée dans les notes, la charge est estimée à parts égales.
- Le SkiErg « distance maximale » du WOD 2 n'est pas chiffré.
- Interface en français uniquement.
- Le bundle JavaScript pèse environ 245 ko compressé (les graphiques en représentent une bonne part).
- Le maintien de l'écran allumé pendant le chrono dépend du navigateur.
