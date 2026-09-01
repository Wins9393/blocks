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
| Descendre un bloc dans la **trappe du sol** | le supprime (annulable) |

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
garde-robe : yeux, sourcils, bouche, cheveux, chapeau, lunettes, barbe, joues et
cou se choisissent bloc par bloc dans l'atelier. La couleur, elle, n'est pas
réglable — c'est elle qui dit quel nombre on regarde, et deux blocs repeints à
l'identique ne se distingueraient plus.

**Les cheveux appartiennent au personnage, les accessoires sont des objets.**
C'est la règle qui gouverne les couleurs (`src/render/faces.ts`). Une chevelure
prend une teinte du bloc ; un bonnet est en laine rouge, une casquette en denim,
une couronne en or à trois gemmes. Quand toutes les pièces étaient teintées de
la couleur du bloc, le personnage n'avait pas l'air habillé — il avait l'air
peint, et rien ne donnait envie d'être débloqué.

Deux ou trois pièces bougent : l'hélice tourne, l'auréole flotte, un reflet
balaie les lunettes de soleil. Elles sont exclues du cache de têtes, et c'est le
meilleur rapport effet/effort de toute la garde-robe.

La garde-robe ne garde que les écarts au réglage d'origine : reprendre la pièce
livrée l'oublie, ce qui rend « remettre comme au début » exact et laisse les
blocs jamais touchés suivre les évolutions du dessin. Régler le 10 rhabille du
même coup tous les nombres de 11 à 20 — c'est la règle de la dizaine, et elle
tient quel que soit le chapeau choisi.

**Un bouton par bloc, dessiné par le même code que la scène.** La barre du bas
montre les blocs de 1 à 10 avec leur silhouette réelle et leur personnage : le
bouton montre exactement ce qu'il pose. Deux dessins séparés auraient divergé au
premier changement de coiffure.

**La corbeille est une trappe dans le sol, hors du terrain de jeu.** Elle a
d'abord été un objet posé sur la scène : c'était un obstacle physique autant
qu'un encombrement, et les blocs venaient s'empiler contre elle. La rendre
éphémère — elle n'apparaît que lorsqu'un bloc est tenu — a réglé
l'encombrement, mais pas le vrai problème : **partout dans le terrain, elle
occupe une place où des blocs vivent**, et glisser un bloc vers son voisin pour
le fusionner le jetait par accident.

Elle est donc passée sous la ligne du sol, sur toute la largeur. Aucune fusion
n'y passe jamais : un bloc posé au sol garde le doigt au-dessus de cette ligne,
et il faut vingt pixels de plus, vers le bas, pour armer la trappe. Le test
n'est plus une boîte mais une profondeur — descendre le doigt sous le sol est un
geste franc que rien d'autre ne demande.

Les battants s'écartent quand le doigt approche, et le bloc rétrécit juste ce
qu'il faut pour entrer dans l'ouverture : c'est ce geste qui dit « lâche ici »,
sans un mot à lire. La trappe est dessinée en deux passes, avant et après les
blocs, pour que le bloc plonge derrière sa lèvre avant.

Le seau est dessiné en deux passes, avant et après les blocs, pour que le bloc
plonge derrière la paroi avant. Une seule passe et il flottait par-dessus, ou
disparaissait sous le seau.

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

**Le geste s'écoute sur la fenêtre, pas sur le canvas.** La capture de pointeur
est capricieuse au doigt ; sans elle, un glisser qui passe au-dessus d'une barre
d'interface perd ses mouvements en route et le lâcher ne tombe nulle part.

**Glisser cinématique**, pas de `MouseConstraint` : un correcteur proportionnel
impose la vitesse à chaque pas, ce qui garde des collisions correctes sans
l'élasticité molle du ressort de Matter.

**Zéro asset.** Sons synthétisés à la volée (Web Audio) et voix via l'API de
synthèse du navigateur, en français. La PWA pèse ~100 ko compressés.

## Les missions

Le mode mission (drapeau dans la barre du haut) enchaîne trente exercices en cinq
chapitres : compter jusqu'à 5, jusqu'à 10, les formes, la dizaine, les défis. Chacun affiche **le bloc à fabriquer, en image**, avec son chiffre, et
le dit à voix haute : un enfant de quatre ans ne lit pas « fabrique un bloc de
7 », il reconnaît la forme et il l'écoute.

**Une mission est un prédicat sur la scène, jamais une séquence scriptée**
(`src/core/missions.ts`). « Il existe un bloc de 8 », « il existe deux blocs de
4 », « il existe un bloc à bosse ». L'enfant y arrive comme il veut, en
fusionnant, en coupant ou en secouant. Le jeu, lui, ignore tout des missions :
il publie l'état de la scène, et c'est l'application qui statue.

**Les contraintes de moyens ne sont pas dans le prédicat.** « Fabrique un 9 avec
seulement des 3 » se traduit par une barre de blocs qui ne montre que le 3. La
règle est dans ce qui est disponible : rien à lire, rien à enfreindre. Et pour
« enlève 1 à un 4 », seuls des 4 sont offerts — la soustraction naît de ce qui
manque dans la barre.

**Le fantôme montre une solution, pas la seule.** « Fabrique un bloc tout carré »
affiche un 4 ; le prédicat accepte 9, 16, 25. Un test vérifie l'invariant : la
solution montrée doit toujours valider la mission, sinon l'enfant fait
exactement ce qu'on lui montre et il ne se passe rien.

**Aucun échec.** Pas de minuteur, pas de vies, pas de mauvaise réponse. Faire 9
au lieu de 8 ne déclenche rien : on secoue, et voilà. Une mission mise de côté
repasse en fin de file plutôt que de disparaître.

**La réussite se voit d'abord dans la scène.** Le bloc qu'on vient de fabriquer
saute et se couvre d'étincelles, le bandeau se dore, et le panneau de récompense
n'arrive qu'une seconde et demie plus tard : ouvert aussitôt, il cachait la forme
au moment précis où l'enfant veut la regarder.

**Chaque réussite ouvre une pièce de l'atelier**, montrée portée sur un
personnage plutôt que décrite. Les pièces fermées restent visibles en silhouette
avec un cadenas : c'est ce qu'on voit sans l'avoir qui donne envie de le gagner.
Des tests garantissent qu'aucune récompense n'est donnée deux fois, qu'aucune
n'était déjà disponible, et surtout que **toute pièce fermée est gagnable** : une
pièce qu'aucune mission ne donne se verrait derrière son cadenas sans qu'aucun
chemin n'y mène, et ce serait une promesse qu'on ne tient pas.

## Architecture

```
src/core/      formes canoniques, palette, vestiaire, missions, constantes — pur et testé
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

`src/core/constants.ts` — `MAX_VALUE` (100) plafonne la taille d'un bloc,
`MAX_UNITS` (150) le total à l'écran, `UNIT` (36 px) la taille d'un cube.

La fusion s'arrête aussi plus tôt quand le résultat ne tiendrait pas entre les
murs (`World.fits`) : un bloc plus large que la scène y resterait coincé et le
solveur finirait par l'éjecter. Sur un écran de 320 px, seuls le 81, le 90, le
99 et le 100 — les formes de neuf et dix cubes de large — sont hors d'atteinte.

## Licence et inspiration

Le concept « un nombre est fait de n cubes » vient du matériel Cuisenaire et des
blocs de Dienes, dans le domaine public depuis des décennies. Ce projet n'utilise
ni les personnages, ni les noms, ni la palette d'aucune œuvre sous licence :
couleurs propres, personnages dessinés pour ce projet, nom original.

## Suite

- Une carte du parcours par chapitre, et la collection des pièces gagnées.
- Un sixième chapitre : il faudra d'abord dessiner les pièces qui vont avec.
- Multiplication par rectangles (la forme canonique s'y prête déjà).
- Soudure telle quelle + geste « ranger » qui claque la forme canonique.
