#!/usr/bin/env bash
#
# Archives a Release build and uploads it to App Store Connect (TestFlight).
#
#   ios/scripts/testflight.sh
#
# Run it from a logged-in Terminal on the Mac, not over SSH: codesign asks the
# login keychain for the signing key, and macOS may show an "allow access"
# dialog (click Always Allow). Xcode must be signed in to an Apple ID on team
# 772YSVJ4U7 (Xcode > Settings > Accounts) with the Admin or App Manager role,
# so automatic signing can create the Apple Distribution certificate and the
# App Store profile. The App Store Connect app record for io.ballotwatch.app
# must already exist; neither xcodebuild nor altool can create it.
#
# Bump CFBundleVersion in BallotWatch/Info.plist before each upload: App Store
# Connect rejects a build number it has already seen for the version.
#
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$IOS_DIR"

if [ ! -f BallotWatch/Secrets.plist ]; then
  echo "error: BallotWatch/Secrets.plist is missing; run ios/scripts/make-secrets.sh" >&2
  exit 1
fi

xcodegen generate

ARCHIVE="build/BallotWatch.xcarchive"
rm -rf "$ARCHIVE" build/export

xcodebuild \
  -project BallotWatch.xcodeproj \
  -scheme BallotWatch \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  archive

# destination=upload in ExportOptions.plist sends the build straight to App
# Store Connect instead of writing an .ipa.
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/export \
  -allowProvisioningUpdates

echo "Uploaded. The build appears in App Store Connect > TestFlight after processing (often 10-30 minutes)."
