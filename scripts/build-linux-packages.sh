#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"

cd "${project_root}"
release_version="$(node -p "require('./package.json').version")"
build_number="$(node -p "require('./package.json').buildNumber")"

# Compile once, then give each native package manager its conventional build
# identity: Debian uses SemVer build metadata, while RPM uses Release.
npm run tauri -- build --no-bundle
npm run tauri -- bundle \
  --bundles deb \
  --config "{\"version\":\"${release_version}+${build_number}\"}"
npm run tauri -- bundle \
  --bundles rpm \
  --config "{\"version\":\"${release_version}\",\"bundle\":{\"linux\":{\"rpm\":{\"release\":\"${build_number}\"}}}}"
