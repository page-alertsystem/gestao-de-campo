#!/bin/bash
# Gera o GIO Mobile .apk (Linux: apt install android-sdk-platform-23 aapt apksigner zipalign dalvik-exchange default-jdk)
set -e
cd "$(dirname "$0")"
J=/usr/lib/android-sdk/platforms/android-23/android.jar
rm -rf gen obj bin && mkdir -p gen obj bin
aapt package -f -m -J gen -M AndroidManifest.xml -S res -I $J
javac -nowarn -source 8 -target 8 -bootclasspath $J -cp $J -encoding UTF-8 -d obj $(find src gen -name '*.java')
dalvik-exchange --dex --min-sdk-version=23 --output=bin/classes.dex obj
aapt package -f -M AndroidManifest.xml -S res -I $J -F bin/unsigned.apk
(cd bin && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 bin/unsigned.apk bin/aligned.apk
PW=$(cat keystore-senha.txt)
apksigner sign --ks gio-mobile.jks --ks-key-alias gio-mobile --ks-pass pass:$PW --key-pass pass:$PW --out bin/gio-mobile.apk bin/aligned.apk
apksigner verify bin/gio-mobile.apk && echo "OK: bin/gio-mobile.apk"
