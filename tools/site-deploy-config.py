"""Write the site's production Worker configs from wrangler.toml. Does not deploy.

`npm run deploy` deploys .deploy/wrangler.json, not wrangler.toml. That copy
used to be generated once, by hand, and then drifted: `/api/*` was missing
from its run_worker_first from launch until 2026-10-20. So `predeploy` now
regenerates it on every deploy, locally and in CI, from the two files that
are committed -- wrangler.toml for the Worker and site.config.json for the
domain. The Cloudflare account ID is not committed (the repo is public): it comes from
CLOUDFLARE_ACCOUNT_ID (an Actions secret in CI) or the gitignored deployment.local.json.

    python tools/site-deploy-config.py

tools/configure-app-deploy.py still sets up the two sibling app Workers.
"""
from pathlib import Path
import json, os, tomllib

root = Path(__file__).resolve().parents[1]
local = root / 'deployment.local.json'
ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID') or (
    json.loads(local.read_text()).get('account_id') if local.exists() else None)
if not ACCOUNT_ID:
    raise SystemExit('Set CLOUDFLARE_ACCOUNT_ID or account_id in deployment.local.json (personal Cloudflare account)')
site = json.loads((root / 'site.config.json').read_text())
if not site.get('chosen'):
    raise SystemExit('site.config.json has no chosen domain')
domain = site['origin'].removeprefix('https://')

data = tomllib.loads((root / 'wrangler.toml').read_text())
data['account_id'] = ACCOUNT_ID
data['main'] = '../' + data['main']
data['assets']['directory'] = '../' + data['assets']['directory']
data['routes'] = [{'pattern': domain, 'custom_domain': True}]
data.pop('build', None)

redirect = {'name': 'ryanbeck-www-redirect', 'main': '../worker/redirect.js',
            'compatibility_date': data['compatibility_date'], 'workers_dev': False,
            'account_id': ACCOUNT_ID,
            'routes': [{'pattern': 'www.' + domain, 'custom_domain': True}]}

dest = root / '.deploy'
dest.mkdir(exist_ok=True)
(dest / 'wrangler.json').write_text(json.dumps(data, indent=2) + '\n')
(dest / 'wrangler-www.json').write_text(json.dumps(redirect, indent=2) + '\n')
print('Wrote .deploy/wrangler.json and .deploy/wrangler-www.json for', domain)
