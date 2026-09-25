import {spawn,spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
for (const script of ['tools/build-apps.mjs','tools/setup-apps.mjs']) {const result=spawnSync(process.execPath,[script],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
const cli=resolve('node_modules/wrangler/bin/wrangler.js');const port=process.env.SITE_PORT||'8787';const children=[];
for(const [cwd,p] of [['../March Madness 2026','8791'],['../mtg-mechanics-cheatsheet','8792'],['.',port]]){const child=spawn(process.execPath,[cli,'dev','--port',p,'--log-level','warn'],{cwd:resolve(cwd),stdio:'inherit'});children.push(child);child.on('exit',code=>{if(code){for(const c of children)c.kill();process.exitCode=code;}});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const child of children)child.kill();});
