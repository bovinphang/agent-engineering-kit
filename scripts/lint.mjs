#!/usr/bin/env node
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const names=(await readdir(join(root,'skills'))).filter(x=>x.startsWith('ai-'));
const problems=[];
if(names.length<11)problems.push('Expected 11+ engineering skills');
for(const name of names){
 const text=await readFile(join(root,'skills',name,'SKILL.md'),'utf8');
 if(!text.startsWith(`---\nname: ${name}\ndescription: Use when`))problems.push(`${name}: missing Agent Skills frontmatter`);
 if(!/Block|阻断|STOP/.test(text))problems.push(`${name}: missing failure handling`);
 if(!/aek |ai-engineering /.test(text))problems.push(`${name}: no CLI integration`);
}
const stageFiles=(await readdir(join(root,'prompts/stages'))).filter(x=>x.endsWith('.md'));
if(stageFiles.length!==9)problems.push('Expected exactly 9 stage prompts');
for(const f of stageFiles){const text=await readFile(join(root,'prompts/stages',f),'utf8');if(!text.includes('## 完成条件 / Gate'))problems.push(`${f}: missing gate`);}
for(const name of ['task-contract','question','project-config']){
 try{JSON.parse(await readFile(join(root,'schemas',`${name}.schema.json`),'utf8'));}
 catch{problems.push(`invalid JSON schema file ${name}`);}
}
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}
else console.log(`OK: ${names.length} skills, ${stageFiles.length} stage prompts, 3 parsable schemas`);
