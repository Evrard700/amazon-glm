#!/bin/bash
# Sequential image search for seed data (rate-limit friendly)
cd /home/z/my-project/seed-imgs

declare -A QUERIES=(
  ["01-smartphone"]="professional product photo modern smartphone clean white background"
  ["05-smartwatch"]="smartwatch product photo clean background"
  ["06-coffee"]="espresso coffee machine home kitchen appliance product photo"
  ["07-blender"]="blender kitchen appliance product photo clean"
  ["08-perfume"]="luxury perfume bottle product photography studio"
  ["09-shea"]="african shea butter skincare cosmetics jar product photo"
  ["10-laptop"]="modern laptop computer product photo clean background"
  ["11-sneakers"]="colorful sneakers shoes product photography"
  ["12-speaker"]="portable bluetooth speaker product photo"
  ["13-ebook"]="ebook digital reading tablet marketing flat lay"
  ["14-course"]="online course learning workspace laptop flat lay"
  ["15-weather"]="smart home weather station device product photo"
  ["16-powerbank"]="power bank charging smartphone product photo"
  ["17-sunglasses"]="stylish sunglasses product photography fashion"
  ["18-yoga"]="yoga fitness mat equipment flat lay"
  ["19-deco"]="african home decoration living room interior"
  ["20-hero"]="happy african woman shopping online smartphone bright"
  ["21-solarlamp"]="solar powered lamp product africa"
  ["22-tea"]="african hibiscus bissap tea herbal product"
  ["23-headphones"]="over-ear headphones product photo white background"
)

ORDER=(01-smartphone 05-smartwatch 06-coffee 07-blender 08-perfume 09-shea 10-laptop 11-sneakers 12-speaker 13-ebook 14-course 15-weather 16-powerbank 17-sunglasses 18-yoga 19-deco 20-hero 21-solarlamp 22-tea 23-headphones)

for key in "${ORDER[@]}"; do
  if [ -f "${key}.json" ]; then
    echo "SKIP ${key} (exists)"
    continue
  fi
  echo "SEARCH ${key}..."
  z-ai image-search -q "${QUERIES[$key]}" -c 3 --gl us --no-rank -o "${key}.json" 2>&1 | tail -1
  sleep 6
done
echo "ALL_DONE"
