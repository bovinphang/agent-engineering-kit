import {test} from 'node:test';
import assert from 'node:assert/strict';
import { readdir,readFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const root=resolve(import.meta.dirname,'..');
test('all phase skills declare valid names, triggers, gates and installed prompts',async()=>{
 const skills=(await readdir(join(root,'skills'))).filter(x=>x.startsWith('ai-'));
 assert.equal(skills.length>=11,true);
 for(const name of skills){
   const content=await readFile(join(root,'skills',name,'SKILL.md'),'utf8');
   assert.match(content,new RegExp(`^---\\nname: ${name}\\n`));
   assert.match(content,/description: Use when/);
   assert.match(content,/aek |ai-engineering /);
   assert.match(content,/Block|阻断|STOP/);
 }
 const prompts=(await readdir(join(root,'prompts/stages'))).filter(x=>x.endsWith('.md'));
 assert.equal(prompts.length,9);
 for(const file of prompts){const content=await readFile(join(root,'prompts/stages',file),'utf8'); assert.match(content,/完成条件|Gate/);assert.match(content,/输入|Input/);}
});
