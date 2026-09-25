import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','march-madness','--local','--config','../March Madness 2026/wrangler.toml'],{stdio:'inherit'});process.exit(result.status||0);
