#!/bin/sh
# Les icônes de la PWA, toutes tirées de public/icon.svg.
#
# macOS seulement, et volontairement sans dépendance : qlmanage rasterise le
# SVG (c'est le moteur de Quick Look), sips redimensionne. Ajouter une chaîne
# de rendu en npm pour quatre fichiers qui changent une fois par an ne valait
# pas son poids.
#
#   sh scripts/icons.sh
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Rendu une fois en grand, puis réduit : rasteriser directement en 180 perd les
# petits détails du visage, les réduire depuis 1024 les garde.
grand() {
  qlmanage -t -s 1024 -o "$tmp" "$1" >/dev/null 2>&1
  echo "$tmp/$(basename "$1").png"
}

# L'icône masquable est la même, ramenée dans le cercle de sécurité : Android
# rogne un disque de 80 %, et le bloc dessiné bord à bord y perdrait ses coins.
# Seule l'échelle change — le fond, lui, couvre le carré dans les deux cas.
sed 's/scale(1.35)/scale(1)/' public/icon.svg > "$tmp/masquable.svg"

ordinaire=$(grand public/icon.svg)
masquable=$(grand "$tmp/masquable.svg")

# sips redimensionne, png-lisse.mjs efface le tramage du rasteriseur et rend
# un fichier quatre fois plus léger, à l'œil identique.
taille() { # <source> <côté> <sortie>
  sips -z "$2" "$2" "$1" --out "$tmp/brut.png" >/dev/null
  node scripts/png-lisse.mjs "$tmp/brut.png" "$3"
}

taille "$ordinaire" 512 public/pwa-512.png
taille "$ordinaire" 192 public/pwa-192.png
taille "$ordinaire" 180 public/apple-touch-icon.png
taille "$masquable" 512 public/maskable-512.png
