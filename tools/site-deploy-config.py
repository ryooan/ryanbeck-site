"""Write the site's production Worker configs from wrangler.toml. Does not deploy.

`npm run deploy` deploys .deploy/wrangler.json, not wrangler.toml. That copy
used to be generated once, by hand, and then drifted: `/api/*` was missing
from its run_worker_first from launch until 2026-10-20. So `predeploy` now
regenerates it on every deploy, locally and in CI, from the two files that
are committed -- wrangler.toml for the Worker and site.config.json for the
domain. Nothing here is secret.

    python tools/site-deploy-config.py

tools/configure-app-deploy.py still sets up the two sibling app Workers.
"""
from pathlib import Path
import json, tomllib

ACCOUNT_ID = '0efbd4d43122e579508d8f3b649ed990'   # personal Cloudflare (ryooan@gmail.com)

root = Path(__file__).resolve().parents[1]
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
