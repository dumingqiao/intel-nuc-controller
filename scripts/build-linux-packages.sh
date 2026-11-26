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

# Tauri's RPM bundler stores every `bundle.linux.rpm.depends` entry verbatim as
# a package *name* (rpm::Dependency::any), so "foo >= 1.0" becomes a package
# literally called "foo >= 1.0" that nothing provides. Versioned requirements
# must use RPM rich-dependency syntax, e.g. "(foo >= 1.0)". Fail the build if
# a plain name with a version slipped back in.
if command -v rpm >/dev/null 2>&1; then
  shopt -s nullglob
  rpm_packages=(src-tauri/target/release/bundle/rpm/*-"${release_version}-${build_number}".*.rpm)
  if (( ${#rpm_packages[@]} == 0 )); then
    echo "build-linux-packages.sh: no RPM found for ${release_version}-${build_number}" >&2
    exit 1
  fi
  for package in "${rpm_packages[@]}"; do
    # Query names only: a real package name never contains a space.
    bad_requires="$(rpm -qp --qf '[%{REQUIRENAME}\n]' "${package}" | grep -E '^[^(].* ' || true)"
    if [[ -n "${bad_requires}" ]]; then
      echo "build-linux-packages.sh: ${package} has unresolvable requirements:" >&2
      echo "${bad_requires}" >&2
      echo "Use RPM rich-dependency syntax in tauri.conf.json, e.g. \"(name >= version)\"." >&2
      exit 1
    fi
  done
fi
