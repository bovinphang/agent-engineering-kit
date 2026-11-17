#!/usr/bin/env node
import {access,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const paths=['bin/ai-engineering.mjs','dist/packages/cli/src/index.js','dist/packages/core/src/engine.js','dist/packages/adapters/src/install.js','README.zh-CN.md','schemas/task-contract.schema.json'];
const errors=[];
for(const path of paths){try{await access(join(root,path));}catch{errors.push('Missing: '+path);}}
for(const name of ['ai-start','ai-requirements','ai-spec','ai-design','ai-plan','ai-build','ai-verify','ai-review','ai-ship','ai-learn','ai-resume']){
  try{const value=await readFile(join(root,'skills',name,'SKILL.md'),'utf8');if(!value.startsWith('---'))throw Error('Invalid frontmatter');}
  catch{errors.push(`Missing or invalid skill: ${name}`);}
}
const stages=(await readdir(join(root,'prompts/stages'))).filter(x=>x.endsWith('.md'));
if(stages.length!==9)errors.push('Nine phase prompt assets required');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log('OK: offline release assets present. Real agent-host smoke tests are not implied.');
