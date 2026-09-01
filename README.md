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

**Les blocs et les objets passent en volume d'un bouton** (le cube dans la
barre du haut). Le rendu WebGL ne remplace pas le moteur 2D, il s'y glisse :
décor au canvas, puis les corps et ce qui se porte sous le visage, puis les
visages au trait par-dessus, puis les chapeaux et les lunettes qui se posent
dessus. Les deux passes WebGL partagent un seul tampon de profondeur — seule la
couleur est effacée entre elles — et chaque bloc reçoit un z tiré de son ordre
de dessin : le chapeau d'un bloc du fond passe donc derrière le bloc de devant,
alors même qu'il est peint après lui.

**La caméra est en perspective**, l'œil au milieu de l'écran, à quatre
cinquièmes de hauteur d'écran (`RECUL`). Le plan médian d'un bloc tombe
exactement là où la physique le place — ombres, pastilles et aperçus de fusion
restent donc calés au pixel — et seule son épaisseur fuit : un bloc posé sur un
bord montre sa tranche.

Ce n'est pas gratuit et il faut le savoir : la face avant, plus proche de l'œil,
grandit d'un centième et s'écarte du centre, si bien que le dessin d'un bloc du
bord ne coïncide plus tout à fait avec sa forme de collision. L'écart reste sous
les trois pixels, et `RECUL` est la manette — l'allonger ramène vers une vue à
plat, le raccourcir creuse la fuite et tord les bords.

**Le visage au trait reçoit la même homothétie** (`avantPlan`) : il se peint sur
la face avant du volume, pas sur le plan médian. Sans cette correction, il
glisse du corps dès qu'un bloc quitte le milieu de l'écran — deux pixels, mais
deux pixels qui décollent les yeux de la tête. Un test vérifie pour les cent
valeurs que le volume tient dans le même cadre que le dessin.

**L'ordre de dessin ne recule plus les blocs.** Il se traduit par un simple
décalage de profondeur dans le nuanceur : sous une perspective, reculer un bloc
pour l'ordonner l'aurait rapetissé.

**Le bloc en volume est un cube arrondi par case, collés côte à côte.** Le creux
entre deux cubes voisins *est* la rainure : rien à tracer par-dessus, et chaque
cube attrape la lumière sur son propre arrondi. C'est ce qui lui donne l'air
d'un jouet plutôt que d'une plaque gravée.

L'assembler à partir de grands rectangles coûtait moins de triangles, mais
laissait **un trou en étoile à chaque croisement de quatre cases** — invisible
sur un carré de quatre, criant sur un dix-neuf, où la lumière s'y engouffrait.
Le cube par case n'a pas ce défaut, et sa silhouette garde les mêmes cotes que
le dessin, à un petit pincement près à chaque jointure.

**Les objets sont transcrits, pas réinventés.** Chaque pièce reprend les cotes
de son dessin (`src/render/objets3d.ts`), selon trois règles apprises à la
mesure :

- ce qui est **plat de face** — étoile, cœur, oreille de chat — est extrudé du
  tracé lui-même, par découpe d'oreilles : c'est juste au point près ;
- ce qui **coiffe la tête** — dômes, cônes, calottes — doit être *plus profond
  que la dalle*. Moins profond, sa partie basse passe derrière la face avant du
  bloc et le chapeau se met à flotter au-dessus du crâne ;
- ce que le dessin **étale en bande** — bord de chapeau, bandeau, écharpe —
  devient une plaque posée devant la dalle. L'anneau serait plus juste, mais sur
  vingt-trois pixels d'épaisseur il ne montre qu'un arc deux fois plus étroit
  que la tête. Et le pousser vers l'avant ne sauve rien : sous une perspective,
  avancer un objet l'éloigne aussi du centre de l'écran, donc il remonte
  d'autant qu'on l'avait fait descendre.

**Seuls les objets passent en volume.** Cheveux, sourcils, bouches, moustaches,
joues et yeux restent dessinés : le regard suit le doigt et les paupières
clignent, ce qu'une texture ne saurait pas suivre sans être repeinte à chaque
image. Deux tests tiennent ce partage — que toute pièce d'objet ait bien un
modèle, et que la pilosité n'en ait pas.

Deux pièges trouvés en mesurant. **Tout ce que le dessin pose *sur* le bloc doit
sortir de son épaisseur** : écharpes, nœud papillon, médaille et foulard étaient
modelés au milieu de la dalle, donc parfaitement invisibles. Et **la normale
d'un solide de révolution dépend du sens de son profil** : décrit de bas en
haut, un cylindre s'éclairait par l'intérieur et ressortait deux fois trop
sombre — le haut-de-forme en faisait les frais.

**L'atelier montre les pièces dans le même volume que la scène** : la vignette
du bloc, les dix blocs de la rangée et chaque essayage passent par le même
moteur, avec un œil à distance fixe — une vignette de cent pixels ne doit pas
fuir comme un grand-angle. Le moteur des vignettes a son propre contexte pour
ne pas déranger celui de la scène.

**Une monture fermée est un anneau, pas une plaque.** Le ruban qui suit un
tracé fermé était extrudé contour par contour : deux plaques pleines, donc des
lunettes carrées sans verre et un regard bouché — c'est ce qui donnait
l'impression que les yeux avaient cessé de suivre le doigt. Un test vérifie
qu'aucune monture ne couvre l'œil, le cache-œil excepté.

**L'éclairage est recto-verso, réglé sur le regard et non sur l'enroulement des
triangles.** La face arrière d'un verre gardait sa normale à l'opposé de la
caméra : son terme de bord montait à 1, et le verre devenait un carreau opaque.
Et un verre couvre d'autant plus qu'il est sombre — sans quoi les lunettes de
soleil laissent voir les yeux comme une paire de lunettes de vue.

**Deux réglages du rendu se paient cher si on les rate.** Le contexte WebGL est
déclaré en **alpha prémultiplié** : avec l'anticrénelage, un pixel de bord sort
déjà multiplié par sa couverture, et annoncer le contraire fait redividiser le
compositeur — d'où des liserés blancs, invisibles sur un écran de bureau et
criants sur mobile. Et l'écrêtage des couleurs **garde la teinte** : on divise
par le canal le plus fort au lieu de couper chaque canal, sans quoi un bloc
clair voit son bleu buter à 1 pendant que son rouge monte encore, et vire au
blanc.

L'éclairage est volontairement doux et à **une seule source**, comme le dessin :
beaucoup d'ambiante, peu de spéculaire. Une lampe d'appoint du côté opposé
relevait bien les faces sombres, mais elle allumait aussi les arêtes
par-derrière et délavait les blocs clairs — essayée, retirée. La couleur d'un
bloc dit quel nombre on regarde ; un éclairage de studio, plus joli sur un objet
isolé, la ferait bouger avec l'orientation et brouillerait la lecture.

**L'arrondi des cubes en volume est bien plus serré que celui du tracé** (11 %
d'un cube contre 20 %). Au rayon du dessin, la rainure entre deux cubes fait
quatorze pixels et son arête ramasse toute la lumière : le bloc devient un
chapelet de coussins. Serré, il laisse une rainure fine et les cases se
comptent mieux. Le tout coûte **0,2 ms par image** de plus que le trait, avec vingt
blocs et dix accessoires à l'écran.

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

**L'icône est le bloc de 4, transcrit du rendu du jeu** (`public/icon.svg`) :
même couleur de palette, même silhouette d'un seul tenant, même lumière venue
d'en haut à gauche, même visage sur le cube que `pickFace` désigne. Les cotes
viennent de `src/render`, à un facteur d'échelle près — le logo n'est pas un
dessin à part, c'est le personnage.

`sh scripts/icons.sh` en tire les quatre PNG du manifeste. Trois détails
comptent : iOS ignore un `apple-touch-icon` en SVG et affiche alors une capture
de la page à sa place ; l'icône masquable est la même image ramenée dans le
cercle de sécurité, parce qu'Android rogne un disque de 80 % et que le bloc
dessiné bord à bord y perdrait ses coins ; et le fond couvre le carré entier,
donc la même image sert de tuile ronde, carrée ou rognée.

Le rasteriseur de macOS trame ses dégradés — un bruit d'un point par pixel,
invisible à l'œil mais fatal à la compression : l'icône de 512 pesait 197 ko.
`scripts/png-lisse.mjs` arrondit chaque canal à un pas de 4 et ré-encode en RVB,
ce qui la ramène à 48 ko sans différence visible. Les grandes icônes restent
hors du préchargement : le système les lit une fois à l'installation, la page ne
les demande jamais.

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

**La barre ne contient jamais la réponse.** « Fabrique un bloc de 2 » se réglait
d'un doigt sur le 2 : aucune recherche, aucune réflexion. Tout bloc qui gagne la
mission rien qu'en le posant — autant de fois que la mission en demande — est
donc retiré de la barre (`paletteFor`). C'est une règle déduite du prédicat, pas
une liste : une mission ajoutée demain est filtrée sans qu'on y pense, et les
conséquences se lisent toutes seules — « un bloc qui a une bosse » perd le 5
*et* le 7, « un bloc bien plein » perd tous les rectangles pleins, « trois blocs
pareils » ne laisse que le 1. Un test énumère toutes les mains qu'on peut poser
sans rien assembler et vérifie qu'aucune ne gagne : il reste toujours au moins
un geste à faire.

Ce filtre a mis au jour une vieille bévue : « fabrique un bloc tout carré »
s'écrivait `values.some(estCarre)`, et `some` passe l'indice du tableau en
second argument — le côté minimal tombait à 0, et n'importe quel bloc de 1
gagnait la mission.

**Le fantôme montre une solution, pas la seule.** « Fabrique un bloc tout carré »
affiche un 4 ; le prédicat accepte 9, 16, 25. Un test vérifie l'invariant : la
solution montrée doit toujours valider la mission, sinon l'enfant fait
exactement ce qu'on lui montre et il ne se passe rien.

**Aucun échec.** Pas de minuteur, pas de vies, pas de mauvaise réponse. Faire 9
au lieu de 8 ne déclenche rien : on secoue, et voilà. Une mission mise de côté
repasse en fin de file plutôt que de disparaître.

**Rien n'est verrouillé : la carte du parcours ouvre les trente missions.** Le
compteur du bandeau y mène — c'est là qu'on regarde où on en est, donc c'est là
qu'on cherche à revenir en arrière. Chaque chapitre montre ses six missions en
images, cochées quand elles sont réussies, et n'importe laquelle se rejoue.
Avant, la seule navigation était « une autre » : on avançait, on ne revenait
jamais. Refaire une mission se fête pareil dans la scène mais n'ouvre pas de
panneau de récompense — la pièce est déjà dans l'atelier, et un panneau qui la
« donne » une seconde fois mentirait. Le choix est un détour, pas un état : la
mission faite, le parcours reprend sa suite.

**La table se range entre deux missions.** Les blocs de la mission précédente
validaient souvent la suivante tout seuls : « fabrique un bloc de 3 » était déjà
gagné parce qu'un 3 traînait, et l'enfant recevait une récompense sans rien
faire. La scène repart donc vide à chaque fois — à la fermeture du panneau, en
passant une mission, et en entrant en mode mission. Ce n'est pas la corbeille :
les blocs se dispersent sur place, on range la table, on ne jette pas le
travail. Un test tient l'autre bout de la règle : **rien ne se valide sur une
scène vide**, sinon le rangement offrirait la mission suivante au lieu de la
poser.

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
src/render/    canvas 2D, et le relief WebGL qui s'y glisse (mesh, objets3d, relief)
src/audio/     synthèse sonore et voix
src/game/      orchestration, boucle à pas fixe, sauvegarde
src/ui/        React : barres, atelier, espaces et aide — rien de la scène
scripts/       fabrication des icônes de la PWA, hors du bundle
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

- La collection des pièces gagnées, à côté de la carte du parcours.
- Un sixième chapitre : il faudra d'abord dessiner les pièces qui vont avec.
- Multiplication par rectangles (la forme canonique s'y prête déjà).
- Soudure telle quelle + geste « ranger » qui claque la forme canonique.
