#!/usr/bin/env bash
#
# Local preview server. Mirrors the GitHub Actions deploy step: pulls the pinned
# collections data from data.quipsapp.com, rebuilds the collection pages/sitemap,
# the press kit archive, and terms.html/privacy.html from their sources, then
# serves the whole site over HTTP so fetch() works (browsers block fetch of
# local files over file://). Requires the `zip` CLI (for the press kit build).
#
# Usage:
#   ./serve.sh            # pull data (if missing), rebuild, and serve on :8000
#   ./serve.sh 4000       # serve on a different port
#   ./serve.sh --refresh  # re-pull collections data even if it already exists
#
set -euo pipefail
cd "$(dirname "$0")"

PORT=8000
REFRESH=0
for arg in "$@"; do
  case "$arg" in
    --refresh) REFRESH=1 ;;
    *[!0-9]*) ;;            # ignore non-numeric args
    *) PORT="$arg" ;;
  esac
done

VER="$(tr -d '[:space:]' < .data-version)"
BASE="https://data.quipsapp.com/v${VER}"

if [[ ! -f collections.json || "$REFRESH" -eq 1 ]]; then
  echo "Pulling collections v${VER} from ${BASE}"
  curl -fsSL "${BASE}/collections.json" -o collections.json
  mkdir -p collections
  for id in $(python3 -c "import json;print('\n'.join(c['id'] for c in json.load(open('collections.json'))['collections']))"); do
    curl -fsSL "${BASE}/collections/${id}.json" -o "collections/${id}.json"
  done
  echo "Pulled $(ls collections | wc -l) collection files."
  # Optional generated artifacts, same list (and same degrade-quietly rule) as
  # the deploy workflow, so local preview matches what CI publishes.
  for feed in recently-added on-this-day newsletter-picks featured-collections search-index; do
    if curl -fsSL "${BASE}/${feed}.json" -o "${feed}.json"; then
      echo "Pulled ${feed}.json"
    else
      echo "No ${feed}.json for v${VER} (skipping)"
      rm -f "${feed}.json"
    fi
  done
else
  echo "Using existing collections data (run with --refresh to re-pull)."
fi

echo "Rebuilding collection pages and sitemap"
node scripts/build-collections.mjs

echo "Rebuilding press kit archive"
node scripts/build-press-kit.mjs

echo "Rebuilding terms.html/privacy.html from legal/*.md"
node scripts/build-legal.mjs

echo "Rebuilding spec/quote-markup.html from spec/quote-markup.md"
node scripts/build-spec.mjs

echo "Serving http://localhost:${PORT}  (Ctrl+C to stop)"
# no-store so browsers never serve stale css/js while iterating locally
exec python3 -c "
import http.server

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('', ${PORT}), NoCacheHandler).serve_forever()
"
