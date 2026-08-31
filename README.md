# Blocks

Un bac à sable physique pour fabriquer, casser et recomposer les nombres.
Chaque nombre est un personnage fait de `n` cubes : on les colle pour additionner,
on les secoue ou on les tranche pour décomposer.

## Lancer

```bash
npm install && npm run dev
```

`npm test` pour les tests unitaires, `npm run build` pour la PWA de production.

## Les quatre gestes

| Geste | Effet |
| --- | --- |
| Appuyer sur un **bloc de la barre** (1 à 10) | le fait tomber dans la scène |
| Glisser un bloc contre un autre, puis lâcher | fusion — un aperçu montre `3 + 4 = 7` avant de valider |
| Tenir un bloc et le **secouer** | détache une unité à chaque secousse |
| Tracer un **trait franc** à travers un bloc | le coupe en deux là où le trait passe |
| Lâcher un bloc dans la **corbeille** | le supprime (annulable) |

## Décisions de conception

**La fusion exige une intention.** Avec de la gravité, tout finit par se toucher :
si le contact suffisait, l'écran fusionnerait tout seul en un bloc géant. La fusion
n'a donc lieu qu'au *relâché* d'un glisser qui a réellement parcouru du chemin
(`MERGE_MIN_TRAVEL`) — ni le contact passif, ni un simple tap ne fusionnent.

**Un personnage par nombre.** Coiffure, bouche et accessoires sont fixés par la
valeur (`src/render/faces.ts`) : le 3 porte une moustache, le 8 des lunettes
rondes, le 10 une couronne. La couleur seule ne suffisait pas — deux teintes
voisines se confondent de loin, et un enfant retient bien mieux « le moustachu »
que « le jaune orangé ». Une règle traverse la série : **la couronne marque une
dizaine.** De 11 à 20, le personnage garde la couronne du 10 et le visage de son
unité : 13 a la moustache du 3, 18 les lunettes du 8. La décomposition se lit
sur la tête.

Les parties fixes du visage sont peintes une fois puis reposées en image : au
trait, vingt visages coûtaient 2 ms par image, soit quatre fois le reste de la
scène. Seuls le regard et les verres sont retracés à chaque tour.

**Les têtes livrées ne sont que des réglages par défaut.** Chaque espace a sa
garde-robe : yeux, sourcils, bouche, cheveux, chapeau, lunettes, moustache,
joues et écharpe se choisissent bloc par bloc dans l'atelier. La couleur, elle,
n'est pas réglable — c'est elle qui dit quel nombre on regarde, et deux blocs
repeints à l'identique ne se distingueraient plus.

La garde-robe ne garde que les écarts au réglage d'origine : reprendre la pièce
livrée l'oublie, ce qui rend « remettre comme au début » exact et laisse les
blocs jamais touchés suivre les évolutions du dessin. Régler le 10 rhabille du
même coup tous les nombres de 11 à 20 — c'est la règle de la dizaine, et elle
tient quel que soit le chapeau choisi.

**Un bouton par bloc, dessiné par le même code que la scène.** La barre du bas
montre les blocs de 1 à 10 avec leur silhouette réelle et leur personnage : le
bouton montre exactement ce qu'il pose. Deux dessins séparés auraient divergé au
premier changement de coiffure.

**Un espace par enfant.** Chaque espace porte un prénom et garde sa propre
construction *et sa propre garde-robe* (`src/game/persist.ts`). Changer d'espace
range la scène en cours sur son rayon avant de sortir l'autre.

**Forme canonique plutôt qu'émergente.** Chaque nombre a une forme officielle
(`src/core/shape.ts`) : le rectangle le plus carré possible, et pour un nombre
premier ≥ 5, le rectangle de `n − 1` surmonté d'un cube. Fusionner devient une
addition, découper devient un comptage — aucune géométrie à réconcilier.
Effet de bord : les nombres premiers sont les seuls à porter une bosse, donc
l'enfant voit la primalité avant qu'on la lui nomme.

**Pas d'appui long.** L'appui long entre en conflit avec le début d'un glisser et
rate une fois sur deux chez un jeune enfant. Le bloc est déjà tenu quand on le
déplace : *tenir + secouer* suffit, sans mode à armer.

**Un bloc = un corps rigide composé**, pas une chaîne de contraintes de soudure
(molles et coûteuses). Séparer revient à détruire un corps et à en créer deux.

**Glisser cinématique**, pas de `MouseConstraint` : un correcteur proportionnel
impose la vitesse à chaque pas, ce qui garde des collisions correctes sans
l'élasticité molle du ressort de Matter.

**Zéro asset.** Sons synthétisés à la volée (Web Audio) et voix via l'API de
synthèse du navigateur, en français. La PWA pèse ~100 ko compressés.

## Architecture

```
src/core/      formes canoniques, palette, constantes — pur, testé, sans dépendance
src/physics/   adaptateur Matter.js : forme → corps composé
src/input/     reconnaissance de gestes (secousse, coupe) — pur, testé
src/render/    canvas 2D
src/audio/     synthèse sonore et voix
src/game/      orchestration, boucle à pas fixe, sauvegarde
src/ui/        React : barres, atelier, espaces et aide — rien de la scène
```

React ne sert que pour l'habillage. La boucle de jeu vit en dehors de React et
pilote le canvas directement.

## Réglages utiles

`src/core/constants.ts` — `MAX_VALUE` (20) plafonne la taille d'un bloc,
`MAX_UNITS` (150) le total à l'écran, `UNIT` (36 px) la taille d'un cube.

## Licence et inspiration

Le concept « un nombre est fait de n cubes » vient du matériel Cuisenaire et des
blocs de Dienes, dans le domaine public depuis des décennies. Ce projet n'utilise
ni les personnages, ni les noms, ni la palette d'aucune œuvre sous licence :
couleurs propres, personnages dessinés pour ce projet, nom original.

## Suite

- Niveaux d'apprentissage : « fais un bloc de 8 », puis avec contraintes
  (« fais 17 avec des 3 et des 1 »), le mode libre restant toujours accessible.
- Multiplication par rectangles (la forme canonique s'y prête déjà).
- Soudure telle quelle + geste « ranger » qui claque la forme canonique.
