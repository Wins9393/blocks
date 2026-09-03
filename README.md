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

Sur un téléphone, les dix boutons tiennent en deux rangées de cinq. **À partir
de 880 pixels de large, ils passent sur une seule rangée qui va d'un bord à
l'autre** : chaque bouton grandit, et la scène récupère la hauteur d'une rangée
— le sol descend d'autant (`BOTTOM_SAFE_LARGE`), sinon il flotterait au-dessus
d'une bande vide. Le seuil vit en double, dans `src/core/constants.ts` et dans
la feuille de style : les deux doivent basculer ensemble. Un bouton ne dépasse
jamais le dixième de la rangée, sans quoi une mission qui n'offre qu'un seul
bloc étirerait sa tuile sur toute la largeur.

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

**Les blocs et les objets sont en volume, et il n'y a plus que ça.** Le jeu a
d'abord porté les deux dessins de front, avec un bouton pour basculer ; garder
deux fois la même garde-robe — une fois au trait, une fois modelée — coûtait
plus cher que ça ne rendait service, et les deux se répondaient de moins en
moins. Le rendu WebGL ne remplace pas pour autant le moteur 2D : il s'y glisse.
Décor au canvas, puis les corps et ce qui se porte sous le visage, puis les
visages au trait par-dessus, puis les chapeaux et les lunettes qui se posent
dessus. Un revers assumé : **sans WebGL, il n'y a plus de repli** — la scène,
les visages et les pastilles s'affichent, les corps non. Les deux passes WebGL partagent un seul tampon de profondeur — seule la
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

**Seuls les objets sont modelés.** Cheveux, sourcils, bouches, moustaches,
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
isolé, la ferait bouger avec l'orientation et brouillerait la lecture. Ce qui a
monté, plutôt qu'une seconde lampe, c'est **le fond** : l'ambiante, et surtout la
moitié basse du ciel d'environnement. Presque noire, elle éteignait tout ce qui
regarde vers le bas — sur un écran de téléphone, la moitié des faces d'un bloc
posé. Un bloc rend aujourd'hui **90 %** de sa couleur à plat, contre 80 % avant.

**Un shader mobile n'a pas la précision d'un shader de bureau.** Un fragment sans
qualificatif tourne en `mediump` — seize bits sur téléphone, trente-deux
silencieusement sur ordinateur. Deux précautions valent donc pour tout le monde :
on demande `highp` dès que la carte sait le faire, et **aucune `pow()` ne reçoit
une base nulle, négative ou supérieure à un**. `pow(0.0, n)` est *indéfini* dans
la norme GLSL ES et plusieurs pilotes mobiles renvoient NaN ; un seul NaN
traverse toute la formule, et `max(NaN, 0.0)` rend zéro — le pixel finit en noir
opaque. Il reste un filet en bout de chaîne : une couleur qui n'est pas
`>= 0` retombe sur la couleur du bloc. Le relief se perd sur ce pixel, la lecture
non.

**L'arrondi des cubes en volume est bien plus serré que celui du tracé** (11 %
d'un cube contre 20 %). Au rayon du dessin, la rainure entre deux cubes fait
quatorze pixels et son arête ramasse toute la lumière : le bloc devient un
chapelet de coussins. Serré, il laisse une rainure fine et les cases se
comptent mieux. Le tout coûte **0,2 ms par image** de plus que le trait, avec vingt
blocs et dix accessoires à l'écran.

**Le son se coupe en deux robinets.** La voix qui répète les nombres fatigue
bien avant les notes — et l'inverse arrive tout autant. Le bouton haut-parleur
ouvre donc un petit menu : *Voix* et *Bruitages*, chacun son interrupteur. Le
dessin du bouton dit ce qui reste allumé, avec une pastille quand une seule des
deux est coupée. L'ancien réglage unique (`muted`) est relu une dernière fois au
chargement : quelqu'un qui avait demandé le silence ne se le voit pas rallumer
dans son dos. Même traitement pour `relief`, du temps où les blocs pouvaient
revenir au trait : la clé est lue puis jetée, pour ne pas se réécrire
indéfiniment dans la sauvegarde.

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

## Le mode construction

Un troisième mode, à côté du jeu libre et des missions : on y bâtit avec des
matières au lieu de compter avec des nombres. Il est ouvert dès le premier
lancement — ce qui se gagne dans ce jeu, ce sont les pièces de l'atelier,
jamais l'accès à quoi que ce soit.

**Trois états qui s'excluent, donc un sélecteur et pas des interrupteurs.** Le
drapeau des missions était une bascule ; à trois états, deux bascules
indépendantes ne disent plus laquelle tient, et c'est exactement l'état qu'un
enfant n'arrive pas à lire. Le sélecteur montre les trois et allume celui qui
est actif. Il coûte la largeur de deux boutons dans une barre qui n'en avait
pas à donner : le nom de l'espace, puis son chevron, puis la taille des outils
cèdent par paliers jusqu'à 320 px. C'est en jeu libre que la barre est la plus
chargée — l'atelier s'y ajoute, alors qu'un chantier s'en passe.

**Ce qui n'a plus d'objet se retire.** Sur un chantier, l'atelier n'a personne à
habiller, et le robinet des voix ne commande rien puisque plus aucun nombre
n'est prononcé : le bouton du son y coupe les bruitages directement, sans
menu — un menu d'une seule ligne ne vaut pas mieux qu'un interrupteur. Un
atelier resté joignable depuis la construction serait une porte dérobée entre
deux mondes qu'on vient de séparer.

**Un espace tient deux scènes qui ne se voient jamais**, `blocks.build.v1:` à
côté de `blocks.scene.v2:`. Changer de mode range l'une et sort l'autre,
exactement comme changer d'espace passe d'un rayon à l'autre. Une scène unique
et partagée aurait demandé de convertir, et la conversion n'a pas de sens dans
un sens ni dans l'autre : un 7 canonique devient quoi, en matière ? et un
escalier de chêne repassé en nombres vaut douze cubes sans avoir la forme du 12.

Le jeu libre et les missions, eux, **partagent la même scène**. C'est ce qui fait
qu'aller de l'un à l'autre ne recharge rien : recharger reconstruirait tous les
corps et leur ferait perdre leur élan. Le mode fait aussi partie du rayon — un
espace quitté sur son chantier le retrouve. Le réglage d'avant les trois modes
(`actif`, un booléen qui ne disait que « en mission ou non ») est relu une
dernière fois puis jamais réécrit, pour ne pas renvoyer au jeu libre, dans son
dos, quelqu'un qui avait quitté en mission.

### Un bloc n'est plus un nombre, c'est ses cases

Au mode nombre, `value` est l'unique source de vérité : la forme, la couleur, le
visage, la maille et la sauvegarde en découlent tous. Un bloc n'est pas une
forme, c'est un nombre qui *sait* se dessiner.

La soudure au point de contact casse ça à la racine, puisqu'elle produit un
polyomino quelconque — un L, un T, un escalier — qui ne se range dans aucun
`shapeFor(n)`. **La forme est donc devenue une donnée de plein droit**
(`shapeOf`), et `value` n'est plus qu'un compte de cubes. Les deux modes
partagent le même moteur : le mode nombre passe simplement `shapeFor(v)` là où
il passait `v`.

**La matière est par cube, jamais par bloc.** Un mur mêle le chêne et la brique,
et souder ne repeint rien. Chaque cube porte donc sa matière et **le grain figé
à sa naissance** — une graine tirée une fois pour toutes, si bien que le veinage
d'un cube ne change plus jamais, ni quand on l'assemble, ni quand on le coupe. Un
grain calé sur l'assemblage sauterait à chaque brique posée, parce que son
centre de masse bouge.

L'ordre des cases est l'unique lien entre une case et sa matière : `shapeOf` le
conserve tel quel, et tout ce qui découpe — la coupe, la secousse — voyage avec
ses indices plutôt qu'avec ses points.

### Les gestes du chantier

| Geste | Effet |
| --- | --- |
| **Tirer** une matière hors de la barre | le cube naît sous le doigt et se pose où on le lâche |
| Glisser un bloc contre un autre, puis lâcher | il se soude, aimanté sur la grille de sa cible |
| Tenir un bloc et le **secouer** | détache le cube que le doigt tient |
| Tracer un **trait franc** | coupe, et chaque morceau connexe devient un bloc |

**Le cube ne tombe pas du ciel : on le tire de la barre.** Il naît sous le doigt
au moment où celui-ci se pose sur la matière, et il suit la main jusqu'à sa
place. Un cube lâché du haut atterrit où il veut, et sur un chantier de sept
écrans, souvent hors de vue — il faudrait partir à sa recherche. Le lâcher sans
être sorti de la barre l'y range, ce qui n'est pas une exception mais la règle
du rangement appliquée telle quelle : la barre *est* la corbeille du chantier.
Rien n'ayant alors été créé, rien n'est à annuler non plus — un cube tiré puis
rendu ne laisse pas une entrée muette dans la pile.

Deux conséquences ont dû être réglées. Le doigt est encore *dans la barre*, qui
recouvre la bande de sol : né là, le cube naîtrait **sous** le sol et le solveur
ne l'en sortirait plus. Il naît donc à la place que le glisser lui donnerait
déjà — il sort de la barre du même mouvement, sans saut. Et le défilement au
bord ne s'arme qu'une fois le doigt entré franchement dans le cadre : le premier
bouton est à 46 px du bord gauche, dans la bande qui déclenche le défilement, et
le monde se serait mis à filer avant que l'enfant ait bougé d'un millimètre.
Attraper un bloc déjà collé au bord obéit désormais à la même règle — il faut
s'en éloigner une fois pour que le retour au bord veuille dire quelque chose.

**La règle de fusion n'a pas bougé d'une ligne** : `MERGE_MIN_TRAVEL` de trajet,
un candidat à moins de `MERGE_GAP`, et un lâcher. Le contact passif ne soude
rien, le lâcher volontaire soude. Seul le *résultat* change — on garde la
géométrie au lieu de recanonicaliser. La conséquence est à assumer : en
pratique, presque tout ce qu'on pose se soude, puisqu'on le pose en le poussant
contre son voisin. Pour empiler sans coller, on lâche d'un peu plus haut.

**Tout se joue dans la grille du bloc cible** (`src/core/build.ts`). On y exprime
la pose du bloc tiré, on arrondit au cube près *et au quart de tour*, et on
cherche la place la plus proche qui tienne. L'assemblage garde l'inclinaison de
la cible, et **la cible ne bouge pas d'un pixel** : le corps est replacé pour que
sa première case retombe exactement où elle était. Voir sa maison se recentrer à
chaque brique serait insupportable.

**L'aperçu montre une place, plus une addition.** Sur un chantier, l'ancien
aperçu annonçait `4 + 1 = 5` et dessinait la forme canonique du 5 : ni le compte
ni la forme n'étaient vrais, puisque la soudure allait poser un cube contre un
mur. On montre donc la seule chose qui le soit — les cases du bloc tiré, à
l'endroit et dans l'inclinaison où elles vont se coller, en trait clair et non
en matière pleine : ce n'est pas encore posé. Le battement lent dit qu'il attend
le lâcher.

Ce que l'aperçu annonce et ce que le lâcher fait sortent **du même calcul** : une
seule fonction cherche la place, appelée deux fois. C'est la seule garantie qui
tienne — deux calculs jumeaux finiraient par diverger, et un aperçu qui ment est
pire que pas d'aperçu. La conversion de la grille vers le monde est en revanche
testée contre la formule du dessin (`caseEnMonde`), pour que la place montrée
soit celle où le cube se dessinera.

Le mode nombre, lui, garde son addition : c'est tout son propos.

**La soudure se fait par l'arête, jamais par le coin.** Deux conditions et pas
une de plus : aucune case sur une case prise, et au moins une arête partagée. Si
la place visée est occupée, on essaie les voisines par ordre de distance ; si
rien ne convient, on refuse. Pousser le voisin d'un cran serait un moteur de
dominos — appuyer dans un mur plein déplacerait toute une rangée sous le doigt.

Le coin est écarté pour une raison qui se paie deux gestes plus loin : avec deux
définitions de connexité en lice, **couper une diagonale rendrait un résultat que
personne ne saurait prédire**. Et un escalier tenu par les angles n'a l'air
solide dans aucun monde.

**Une coupe ne rend pas deux moitiés, mais autant de morceaux qu'elle en
détache.** Un U tranché en travers de ses branches en donne trois. Même chose
pour la secousse : ôter le cube du milieu d'un pont en laisse deux. Les deux
gestes passent donc par le même découpage en groupes qui se tiennent par une
arête (`connectedParts`), et chaque morceau est reposé là où ses cubes se
trouvent déjà — sinon ce qui reste sauterait.

**La secousse détache le cube que le doigt tient**, pas une unité prise au bord.
C'est le geste qui répare l'erreur ancienne : l'annulation ne défait que le
dernier geste, et une brique mal posée se voit trois briques plus tard. Sans
lui, il faudrait couper la maison en deux pour la corriger.

### Ce que le rendu a dû apprendre

**Un bloc de matière ne porte rien.** Le visage et la pastille du nombre étaient
déjà retirés du chantier, mais les chapeaux, lunettes et écharpes se choisissent
dans la passe en volume, à partir de la `value` du bloc — laquelle n'est plus,
sur un chantier, que son nombre de cubes. Un mur de dix briques se coiffait donc
de la couronne du 10, et un escalier de cinq du chapeau étoile. Une tenue vide
(`NU`) répond désormais pour tout bloc qui a une matière ; `lookFor` ne répond
plus que pour les nombres.

La silhouette et la maille étaient mises en cache **par valeur** ; elles le sont
maintenant par signature de cases — deux assemblages de même compte n'ont pas la
même forme, et le même mur en chêne ou en brique n'est pas la même maille. Les
couleurs et les modèles d'éclairage se donnent cube par cube.

Un cache par valeur se remplissait une fois pour toutes : il n'y a que cent
formes. **Un chantier, lui, fabrique une maille neuve à chaque soudure**, et
chaque assemblage abandonné laisserait ses tampons sur la carte pour la durée de
la partie. Le cache est donc borné, et jette les plus anciens — qui sont aussi
ceux qu'on ne redessine plus.

Ni visage ni pastille sur un chantier : c'est la matière qui dit ce qu'on
regarde, et un personnage y ferait revenir le nombre par la fenêtre.

### Les dix matières

| | Matière | Modèle | Grain |
| --- | --- | --- | --- |
| 1 | Chêne | mat | veines claires |
| 2 | Noyer | mat | veines sombres |
| 3 | Pierre | mat | moucheture |
| 4 | Brique | mat | rangées et mortier |
| 5 | Herbe | mat | grain fin |
| 6 | Acier | métal | brossé |
| 7 | Or | métal | aucun |
| 8 | Verre | verre | aucun |
| 9 | Néon | lumière | aucun |
| 10 | Cristal | gemme | facettes |

Dix, ce qui remplit la barre pile — deux rangées de cinq sur téléphone, une
seule au-delà de 880 px. **Tout est visible d'un coup d'œil** : au-delà de dix,
la barre pagine, et un enfant de quatre ans ne cherche pas dans une liste qui
défile. Chaque bouton montre un cube dessiné par le moteur de la scène, grain
compris — avec une graine fixée par la matière, sinon le bouton changerait de
veinage à chaque image.

**Chaque matière porte sa couleur, et il n'y a pas d'axe de teinte par-dessus.**
Du bois bleu ferait du grain un bruit posé sur un aplat, et la matière cesserait
de se reconnaître. Les variantes sont des entrées de plus — chêne *et* noyer —
pas une case à croiser. Un test tient la règle : deux matières ne partagent
jamais ni nom ni couleur, les cinq modèles d'éclairage sont tous représentés, et
**toute matière mate a un grain**, sans quoi cinq aplats bruns et gris
rejoueraient exactement le problème que le retrait de `colorFor` avait résolu.

**Le grain est calculé, pas dessiné.** Rien à télécharger : la PWA garde son
« zéro asset ». Deux attributs de plus par sommet — la position dans le repère
du **cube** et le couple (grain, graine) — et une fonction de nuanceur par
famille. Le repère du cube est ce qui accroche la veine à sa case : calé sur le
bloc, le grain glisserait d'un cran chaque fois qu'une soudure déplace le centre
de masse, et tout un mur sauterait au moment précis où l'enfant regarde la
brique qu'il vient de poser.

Aucune puissance dans ces fonctions : la norme GLSL ES laisse `pow()` indéfinie
sur une base nulle, et un seul NaN suffit à noircir le pixel. Le bruit de poche
garde de petites constantes, parce qu'un sinus nourri de grands nombres ne rend
plus du hasard mais des bandes dès qu'on tombe en demi-précision.

**La clé de la maille est calculée à la naissance du bloc** (`world.add`), pas à
chaque image : elle dit la forme, les matières *et* les graines, et un mur de
deux cents cubes ferait sinon deux kilo-octets de chaîne soixante fois par
seconde.

**Le son suit la matière.** Chaque matière a sa hauteur, son timbre et sa part
de souffle : l'herbe étouffe à 150 Hz, le cristal tinte à 1500. Pose, soudure et
choc en prennent la couleur. Si le chêne et le verre font le même bruit, la
matière n'est plus qu'une peau — or c'est elle qui a remplacé le personnage.

**Un aveu sur le verre.** Le modèle du verre a été réglé pour des verres de
lunettes posés sur un visage : transparent de face, couvrant de biais, et
d'autant plus opaque qu'il est sombre. Un *cube* plein de cette matière, sur une
scène au fond sombre, n'a rien derrière lui à laisser voir — il se lit donc
comme un bloc de verre fumé plutôt que comme du verre clair. Sa teinte a été
descendue pour lui rendre du corps. Relever le plancher d'opacité du modèle
réglerait mieux la question, mais rendrait du même coup les lunettes de vue plus
opaques dans le mode nombre : ce n'est pas un réglage qui se change d'un côté
seulement.

### Le monde est plus grand que l'écran

**Un chantier borné, 40 × 24 cases**, plus une bande de sol — une taille fixe qui
ne dépend pas de l'écran. Sans bord, un cube poussé vers la droite disparaît et
rien ne dit qu'il existe encore : un enfant de quatre ans ne part pas à sa
recherche. 960 cases, dont le plafond de **400 cubes** occupe 42 % — le reste est
l'air qu'il faut pour poser, glisser et couper. Ce n'est ni Matter ni le GPU qui
fixent ce plafond : un assemblage soudé compte pour un corps, et la maille se
refait à la soudure, pas à l'image. C'est la place.

À `UNIT = 36`, le terrain d'un téléphone tient **130 cases en tout**. Le chantier
en fait sept fois plus, et c'est le seul moyen d'y bâtir autre chose qu'un mur.

**Au mode nombre, la caméra est l'identité — au sens strict.** Elle vise le
centre de la vue à l'échelle 1, si bien que `toScreen` et `toWorld` rendent leur
argument inchangé. Les deux modes passent par le même chemin et le mode nombre
n'y perd pas un pixel : `RECUL`, `avantPlan`, l'écart de trois pixels entre le
dessin et la forme de collision — tout ce qui a été mesuré le reste. Un test
tient cette égalité.

Trois endroits seulement voient la caméra, et c'est ce qui a rendu la chose
faisable : **le goulot du pointeur** (`toLocal`, qui n'était que
`clientX - rect.left`), **le canvas 2D** (un `translate`/`scale` posé après le
`dpr`), et **le passage du monde à l'écran dans `drawBlocs`**, puisque le relief
travaille déjà en pixels d'écran. Le ciel, lui, ne défile pas : il se peint à
l'écran, seule sa ligne d'horizon suit la caméra.

**Zoomer est une homothétie uniforme, profondeur comprise.** L'échelle s'applique
aussi à `sz`, sans quoi un bloc dézoomé garderait son épaisseur : à 0,5× il
deviendrait une dalle deux fois trop épaisse pour sa taille. Comme l'œil reste à
distance fixe de l'écran, la fuite reste *proportionnellement* la même à tous les
zooms — un bloc au bord montre toujours autant de tranche par rapport à
lui-même — et la perspective, elle, ne bouge jamais.

**Un doigt dans le vide coupe, deux déplacent et zooment.** C'est sans ambiguïté,
parce qu'un glisser de bloc exige d'avoir *attrapé* un bloc : deux doigts dans le
vide ne peuvent être que la navigation. Le second doigt annule donc la coupe que
le premier avait commencée. Le point du monde qui était sous le milieu des deux
doigts y reste pendant tout le geste, sans quoi l'image fuit sous la main dès
qu'on pince.

**Le monde défile tout seul quand le doigt approche d'un bord pendant un
glisser.** Ce n'est pas un supplément de confort : on tire un cube de la barre et
on le pose d'un seul geste, et si sa place est hors champ, il faudrait cadrer
d'abord et poser ensuite. Le doigt ne bouge pas mais le monde sous lui, si : le
bloc est donc recalé sur la contrée qu'on vient de découvrir.

**On ne jette plus dans le sol : on rend le cube à la barre.** Dès qu'on peut
cadrer une tour, une trappe creusée dans le sol devient injoignable — et une
suppression qu'on ne peut pas atteindre est pire que pas de suppression du tout.
La barre est fixée à l'écran, donc toujours à portée quel que soit le cadrage, et
elle n'occupe **aucune case du monde** : c'est l'objection exacte qui avait fait
descendre la corbeille sous le sol. En prime, c'est la symétrie du geste de
pose — on tire de la barre, on rend à la barre.

**Le cadrage se range avec le chantier.** On quitte un jeu en plein milieu d'une
tour ; retrouver la vue d'ensemble à la place du détail sur lequel on travaillait,
c'est perdre le fil, d'autant que le monde fait trois écrans. Un chantier vide
garde donc quand même sa caméra. Et le cube se pose en haut de **ce qu'on
regarde**, pas en haut du monde : tomber du plafond d'un monde de trois écrans le
ferait atterrir hors de vue.

### Le zoom se règle aussi sans doigts

**Un ordinateur n'a qu'un seul pointeur.** Le geste à deux doigts y est
physiquement impossible, et un pincement de pavé tactile n'envoie pas deux
`pointerdown` mais des `wheel` — que rien n'écoutait. La caméra du chantier ne
bougeait donc pas d'un pixel hors du tactile : ni déplacement, ni zoom. C'est le
même manque que « on ne peut pas zoomer », vu de l'autre côté.

**La molette rend les deux mêmes gestes, lus pareil** : défiler déplace comme
deux doigts qui glissent, `ctrl`+molette (ce qu'envoie un pincement de pavé)
zoome comme deux doigts qui s'écartent, `shift` bascule sur l'horizontale pour
une molette qui n'a pas d'axe pour ça. Deux détails qui coûtent une heure quand
on les oublie : Firefox compte en **lignes** sur une vraie molette et en pixels
sur un pavé (`deltaMode`), et le zoom est **exponentiel** — une soustraction
rendrait le dézoom de plus en plus lent.

**Le zoom se montre en pourcentage, de 0 à 100, sur le bord droit.** Un `+` et un
`−` seuls ne disent jamais où l'on en est : dézoomé à fond puis rezoomé, on ne
sait plus si l'on est revenu à la vue de départ. Le nombre le dit.

- **50 % est le zoom de repos**, pas la moyenne des deux bornes. `zoomMin` dépend
  de la taille de l'écran — 0,28 sur un téléphone, 0,64 sur un ordinateur — donc
  l'échelle a deux pentes. C'est le prix pour que « la vue normale » se lise au
  même endroit de la commande partout : à moitié, on retrouve exactement ce qu'on
  avait en arrivant. 0 % est le monde entier dans la vue, 100 % le plus gros.
- **Les boutons tombent sur des paliers ronds.** Un zoom arrivé au pincement à
  43 % remonte à 50, pas à 53 : sinon les crans resteraient décalés pour toujours
  et le nombre affiché ne serait jamais celui qu'on vise. Cinq appuis mènent d'un
  bout à l'autre. Un test tient l'aller-retour entre le nombre et l'échelle.
- **La commande n'existe pas hors chantier**, et c'est le jeu qui le dit
  (`GameState.zoom` est nul), pas l'habillage : au mode nombre la caméra est
  l'identité, et un réglage y serait soit inerte, soit destructeur de cette
  égalité.
- **Elle flotte sur le côté plutôt que dans la barre du haut**, déjà pleine
  depuis le sélecteur à trois modes : deux boutons et un nombre de plus la
  feraient déborder sur un téléphone de 320 px.

**Le zoom des boutons vise le milieu de la vue, celui de la molette le curseur.**
Les deux passent par la même ancre que le pincement — le point du monde qui était
sous le geste y reste. L'échelle est bornée **avant** de calculer l'ancre : bornée
après, le point visé glisserait dès qu'on bute sur une limite.

### `e.detail` n'est pas un témoin de clavier

La barre pose aussi un cube au clavier, pour qui ne peut pas tirer. On
reconnaissait cet appui à `e.detail === 0` — un clic sans pointeur. **Dans
Firefox, chaque vrai clic vaut aussi 0** : le `preventDefault()` du `pointerdown`
(nécessaire, sans lui le navigateur ouvre son propre glisser) supprime le
`mousedown`, et le compteur de clics ne s'incrémente jamais. Chaque clic prenait
donc les deux chemins à la fois : un cube tiré sous le doigt, rendu à la barre au
relâchement, **et** un second lâché du haut de la vue qui tombait au milieu de la
scène. C'est exactement le symptôme qu'on voyait.

Le remède ne consiste pas à corriger le seuil mais à cesser de déduire : le bouton
retient lui-même qu'un pointeur l'a ouvert. Conséquence assumée — **un clic de
souris qui ne sort pas de la barre ne produit plus rien**, ce qui est déjà la
règle du rangement.

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
- L'aide de première ouverture du chantier, avec son propre drapeau : les six
  gestes y sont assez différents pour ne pas se déduire de ceux des nombres.
- Le verre : le laisser fumé, ou le passer au modèle des gemmes (voir plus haut).
