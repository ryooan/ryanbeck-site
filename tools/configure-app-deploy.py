"""Generate deployment configs after the user chooses a domain. Does not deploy."""
from pathlib import Path
import json,sys,tomllib,re
root=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2: raise SystemExit('Usage: python tools/configure-app-deploy.py private-config.json')
config=json.loads(Path(sys.argv[1]).read_text())
required=['domain','account_id','database_id','google_client_id']
if any(not config.get(k) for k in required): raise SystemExit('Supply '+', '.join(required))
domain=config['domain']
if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}',domain) or domain in ['ryanbeck.com','example.com','yourdomain.com']: raise SystemExit('Choose the real domain first')
expected=__import__('os').environ.get('CLOUDFLARE_ACCOUNT_ID')
if expected and config['account_id']!=expected: raise SystemExit('account_id does not match CLOUDFLARE_ACCOUNT_ID; verify account ownership first')
if not re.fullmatch(r'[0-9a-f-]{36}',config['database_id']) or config['database_id']=='00000000-0000-0000-0000-000000000000': raise SystemExit('A real D1 database ID is required')
for folder,prefix in [(root,None),(root.parent/'March Madness 2026','march-madness'),(root.parent/'mtg-mechanics-cheatsheet','mtg-cheat-sheet')]:
    data=tomllib.loads((folder/'wrangler.toml').read_text())
    data['account_id']=config['account_id']
    data['main']='../'+data['main']
    data['assets']['directory']='../'+data['assets']['directory']
    data['routes']=([{'pattern':domain,'custom_domain':True}] if prefix is None else [{'pattern':domain+'/'+prefix,'zone_name':domain},{'pattern':domain+'/'+prefix+'/*','zone_name':domain}])
    if prefix=='march-madness':
        data['d1_databases'][0]['database_id']=config['database_id']
        data['d1_databases'][0]['migrations_dir']='../migrations'
        data['vars']['GOOGLE_CLIENT_ID']=config['google_client_id']
    # Assets are explicitly built before deployment; no cwd-dependent build hook.
    data.pop('build',None)
    dest=folder/'.deploy';dest.mkdir(exist_ok=True)
    (dest/'wrangler.json').write_text(json.dumps(data,indent=2)+'\n')
site=json.loads((root/'site.config.json').read_text());site.update(origin='https://'+domain,chosen=True);(root/'site.config.json').write_text(json.dumps(site,indent=2)+'\n')
print('Prepared three configs and site origin. Next: site-url, builds, tests, personal-account check, secrets, and deployment approval.')

redirect={'name':'ryanbeck-www-redirect','main':'../worker/redirect.js','compatibility_date':'2026-08-01','workers_dev':False,'account_id':config['account_id'],'routes':[{'pattern':'www.'+domain,'custom_domain':True}]}
(root/'.deploy/wrangler-www.json').write_text(json.dumps(redirect,indent=2)+'\n')
