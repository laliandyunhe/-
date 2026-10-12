#!/bin/sh
# 把网页源码复制进 assets 后打包。用法：./build-apk.sh [网页源码目录]
WEB="${1:-../web}"
[ -f "$WEB/index.html" ] || { echo "找不到网页源码：$WEB"; exit 1; }
rm -rf app/src/main/assets/web && mkdir -p app/src/main/assets/web
cp -r "$WEB"/. app/src/main/assets/web/
rm -f app/src/main/assets/web/test.html
./gradlew assembleDebug
