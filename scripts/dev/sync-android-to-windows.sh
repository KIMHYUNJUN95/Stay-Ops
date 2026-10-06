#!/usr/bin/env bash
# Android Studio(Windows)용 빌드 사본 만들기 (2026-10-06).
#
# 저장소는 WSL 안에 있는데, Android Studio 는 WSL 경로의 프로젝트를 열면 「WSL 안에 JDK 를 깔라」고 요구한다.
# 그래서 앱 빌드에 필요한 것만 Windows 쪽 폴더로 복사해 그 폴더를 연다:
#   - android/                      (네이티브 프로젝트)
#   - node_modules/@capacitor/*     (android/capacitor.settings.gradle 이 ../node_modules/... 로 참조하는 플러그인)
# 상대 경로가 그대로 맞도록 같은 구조로 둔다. 앱 내용은 배포된 웹을 띄우므로 웹 코드는 복사하지 않는다.
#
# 언제 다시 돌리나: `npm run cap:sync` 를 했거나 android/ · capacitor.config.ts · Capacitor 플러그인을 바꾼 뒤.
# 사용: bash scripts/dev/sync-android-to-windows.sh [대상 폴더]   (기본 /mnt/c/dev/stayops-android = C:\dev\stayops-android)
# 문서: docs/engineering/03-deployment-strategy.md 「Android 첫 실행」
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="${1:-/mnt/c/dev/stayops-android}"

cd "$ROOT"
npx cap sync android >/dev/null

mkdir -p "$DEST/node_modules/@capacitor"
# 빌드 산출물 · IDE 상태 · Windows 쪽 sdk 경로(local.properties)는 덮어쓰지 않는다.
rsync -a --delete \
  --exclude '.gradle/' --exclude '.idea/' --exclude 'build/' --exclude 'app/build/' --exclude 'local.properties' \
  android/ "$DEST/android/"

# capacitor.settings.gradle 이 참조하는 플러그인 패키지만 복사
grep -o "\.\./node_modules/@capacitor/[a-z-]*" android/capacitor.settings.gradle | sort -u | while read -r rel; do
  pkg="${rel#../}"
  rsync -a --delete "$pkg/" "$DEST/$pkg/"
done

echo "완료: $(wslpath -w "$DEST/android" 2>/dev/null || echo "$DEST/android") 를 Android Studio 로 여세요."
