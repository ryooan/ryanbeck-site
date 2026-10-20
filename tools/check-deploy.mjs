import fs from 'node:fs';
const site=JSON.parse(fs.readFileSync('site.config.json'));if(!site.chosen||site.origin==='https://ryanbeck.com')throw Error('Choose and configure the production domain first.');
if(!fs.existsSync('.deploy/wrangler.json'))throw Error('Generate the deployment config with python tools/site-deploy-config.py first.');
console.log('Domain and generated deployment config are present. Verify personal-account credentials and secrets before deploying.');
