#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
arch_package_dir="${project_root}/packaging/arch"
bundle_dir="${project_root}/src-tauri/target/release/bundle/arch"

cd "${project_root}"
npm run tauri -- build --no-bundle

mkdir -p "${bundle_dir}"
makepkg_args=(
  --dir "${arch_package_dir}"
  --force
  --clean
  --cleanbuild
  --nosign
)

# The companion driver package may have been built locally without being
# installed on the build machine yet. Keep its dependency in .PKGINFO while
# allowing this package to be produced alongside it.
if ! pacman -T uniwill-laptop-dkms >/dev/null 2>&1; then
  makepkg_args+=(--nodeps)
fi

PKGDEST="${bundle_dir}" makepkg "${makepkg_args[@]}"
