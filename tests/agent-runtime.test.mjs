import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { initProject, startRun, advance, verifyTasks, getStatus, canDeliver } from '../dist/packages/core/src/engine.js';
import { agentInvocation, runAgentStage, runIndependentReview, detectHost } from '../dist/packages/agents/src/runtime.js';

const temp=()=>mkdtemp(join(tmpdir(),'aek-v02-'));
const spec='# Spec\n\n## FR-001 Create\n\nAC-FR-001-01: Must be verifiable.\n';
const contract={schema_version:'1.0',id:'TASK-001',name:'Feature',requirements:['FR-001'],acceptance_criteria:['AC-FR-001-01'],depends_on:[],allowed_paths:['app.js'],verification:{commands:[['node','--check','app.js']]},implementer:{id:'coder','context_id':'code-session'}};
async function makeGit(root){
 execFileSync('git',['init','-q'],{cwd:root});
 execFileSync('git',['config','user.email','tests@example.invalid'],{cwd:root});
 execFileSync('git',['config','user.name','Tests'],{cwd:root});
 await writeFile(join(root,'.gitignore'),'.ai-engineering/\n');
 await writeFile(join(root,'app.js'),'export const result = true;\n');
 execFileSync('git',['add','.'],{cwd:root});
 execFileSync('git',['commit','-qm','baseline'],{cwd:root});
}
async function readyReview(){
 const root=await temp();await initProject(root,{});await makeGit(root);await startRun(root,'Build a simple feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'Analysis');await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),spec);await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'Design');await advance(root);
 await writeFile(join(root,'docs/06-tasks/contracts/TASK-001.json'),JSON.stringify(contract));await advance(root);
 execFileSync('git',['add','docs'],{cwd:root});execFileSync('git',['commit','-qm','docs'],{cwd:root});
 await writeFile(join(root,'app.js'),'export const result = 123;\n');
 execFileSync('git',['add','app.js'],{cwd:root});execFileSync('git',['commit','-qm','feature'],{cwd:root});
 await advance(root);await verifyTasks(root,{allowExec:true});await advance(root);
 return root;
}
async function fakeAgent(root,output,exit=0){
 const filename=join(root,'fake-agent.mjs');
 await writeFile(filename,`import {writeFileSync} from 'node:fs';\nconst fs=await import('node:fs'); const args=process.argv.slice(2);\nif(process.env.AEK_MOCK_WRITE === '1')fs.writeFileSync('docs/01-requirements/analysis.md','Created by a child-process Agent');\nconsole.log(${JSON.stringify(output)});\nprocess.exit(${exit});\n`);
 return filename;
}

test('invocations are provider-specific and review never enables direct writes',()=>{
 assert.deepEqual(agentInvocation('codex','Hello',false).args.slice(0,4),['exec','--json','--sandbox','read-only']);
 assert.match(agentInvocation('claude','Hello',false).args.join(' '),/--permission-mode plan/);
 assert.match(agentInvocation('cursor','Hello',false).args.join(' '),/--output-format json/);
 assert.ok(!agentInvocation('cursor','Hello',false).args.includes('--force'));
 assert.ok(agentInvocation('cursor','Hello',true).args.includes('--force'));
});

test('stage runner blocks execution without consent and records a real child-process session',async()=>{
 const root=await temp();await initProject(root,{});await startRun(root,'Create an app');
 const bin=await fakeAgent(root,JSON.stringify({type:'result',result:'Created requirements'}));
 await assert.rejects(runAgentStage(root,'cursor',{binary:process.execPath,binaryArgs:[bin],allowExec:false,allowWrites:true}),/allow-agent-exec|authorization/i);
 const result=await runAgentStage(root,'cursor',{binary:process.execPath,binaryArgs:[bin],allowExec:true,allowWrites:true,env:{AEK_MOCK_WRITE:'1'}});
 assert.equal(result.exitCode,0);
 assert.match(await readFile(join(root,'docs/01-requirements/analysis.md'),'utf8'),/Created by/);
 assert.equal((await getStatus(root)).currentStage,'requirements'); // Model execution alone must not forge a gate.
 assert.equal(result.artifactProduced,true);
 assert.equal((await stat(join(root,result.logPath))).isFile(),true);
});

test('failed agent invocation cannot pass stage and must record nonzero error',async()=>{
 const root=await temp();await initProject(root,{});await startRun(root,'Create an app');
 const bin=await fakeAgent(root,'operation failed',7);
 const result=await runAgentStage(root,'claude',{binary:process.execPath,binaryArgs:[bin],allowExec:true,allowWrites:false});
 assert.equal(result.exitCode,7);
 assert.equal(result.artifactProduced,false);
 await assert.rejects(advance(root),/Missing or empty/);
});

test('missing actual binaries are reported as unavailable instead of fake host success',async()=>{
 const status=await detectHost('codex',{binary:'/definitely/missing/agent-cli-v02'});
 assert.equal(status.available,false);
});

test('independent review executes in isolated Git worktree and imports JSON findings',async()=>{
 const root=await readyReview();
 const output=JSON.stringify({type:'result',result:JSON.stringify({task_id:'TASK-001',summary:'Checked the code and contract',findings:[],verdict:'pass'})});
 const fixture=await fakeAgent(await temp(),output);
 const result=await runIndependentReview(root,'cursor',{binary:process.execPath,binaryArgs:[fixture],allowExec:true});
 assert.equal(result.passed,true);
 assert.equal((await getStatus(root)).reviews.length,1);
 assert.equal((await getStatus(root)).currentStage,'review');
 await assert.rejects(readFile(join(root,'docs/08-reviews/WORKTREE_WAS_MODIFIED.txt')));
 await advance(root);assert.equal((await getStatus(root)).currentStage,'deliver');
 const snapshot=JSON.parse(await readFile(join(root,result.transcriptPath),'utf8'));
 assert.equal(snapshot.status,'completed');
 assert.ok(snapshot.contextId);
});

test('independent review rejects malformed or unresolved high issues; no imported pass',async()=>{
 for(const finalResult of ['not-json',JSON.stringify({task_id:'TASK-001',verdict:'pass',findings:[{severity:'high',status:'open',message:'Bug'}]})]){
  const root=await readyReview();
  const bin=await fakeAgent(await temp(),JSON.stringify({type:'result',result:finalResult}));
  await assert.rejects(runIndependentReview(root,'claude',{binary:process.execPath,binaryArgs:[bin],allowExec:true}),/json|review|high|invalid|findings/i);
  assert.equal((await getStatus(root)).reviews.length,0);
 }
});

test('AI-generated short decision is recorded and blocks later gate until human answers',async()=>{
 const root=await temp();await initProject(root,{});await startRun(root,'Need approval workflow');
 const payload={summary:'Approval level undefined',questions:[{id:'DEC-101',question:'How many approval levels?',blocking:true,options:[{id:'A',label:'one',reason:'simple'},{id:'B',label:'two',reason:'audit'}]}]};
 const bin=await fakeAgent(await temp(),JSON.stringify({type:'result',result:JSON.stringify(payload)}));
 const r=await runAgentStage(root,'cursor',{binary:process.execPath,binaryArgs:[bin],allowExec:true,allowWrites:false});
 assert.deepEqual(r.pendingDecisions,['DEC-101']);
 assert.equal((await getStatus(root)).questions[0].answer,undefined);
 await assert.rejects(advance(root),/DEC-101/);
});

async function scenarioAgent(){
 const scenarioContract={...contract,verification:{commands:[['node','--input-type=module','-e',"await import('./app.js')"]]}};
 const dir=await temp(),path=join(dir,'scenario-agent.mjs');
 await writeFile(path,`import { writeFileSync, mkdirSync } from 'node:fs';\n`+
 `const args=process.argv.slice(2).join(' ');\n`+
 `if(args.includes('independent read-only reviewer')){console.log(JSON.stringify({type:'result',result:JSON.stringify({task_id:'TASK-001',summary:'Reviewed source contract and boundary conditions',findings:[],verdict:'pass'})}));process.exit(0);}\n`+
 `const match=args.match(/Stage: (requirements|spec|design|plan|implement|verify|deliver|learn)/);\n`+
 `const stage=match?.[1];if(!stage){console.error('unrecognized agent prompt');process.exit(5);}\n`+
 `const write=(path,text)=>{const parts=path.split('/');if(parts.length>1)mkdirSync(parts.slice(0,-1).join('/'),{recursive:true});writeFileSync(path,text);};\n`+
 `if(stage==='requirements')write('docs/01-requirements/analysis.md','# Requirements\\n\\nAn editable example.');\n`+
 `if(stage==='spec')write('docs/01-requirements/spec.md',${JSON.stringify(spec)});\n`+
 `if(stage==='design')write('docs/03-architecture/design.md','# Design\\n\\nOne function with regression tests.');\n`+
 `if(stage==='plan')write('docs/06-tasks/contracts/TASK-001.json',${JSON.stringify(JSON.stringify(scenarioContract))});\n`+
 `if(stage==='implement')write('app.js',process.env.AEK_MOCK_BAD_FIRST==='1'?'export const result = ;\\n':'export const result = 123;\\n');\n`+
 `if(stage==='verify'&&args.includes('REPAIR_MODE')&&process.env.AEK_MOCK_UNFIXABLE!=='1')write('app.js','export const result = 123;\\n');\n`+
 `if(stage==='deliver')write('docs/09-delivery/acceptance.md','# Acceptance\\n\\nAC-FR-001-01 verified with evidence.');\n`+
 `if(stage==='learn')write('docs/10-feedback/lessons.md','# Lessons\\n\\nUpdate specs before implementation.');\n`+
 `console.log(JSON.stringify({type:'result',result:JSON.stringify({summary:'Updated '+stage,questions:[]})}));\n`);
 return path;
}

test('simulated CLI-Agent end-to-end drive reaches all nine gates and records evidence without manual long prompts',async()=>{
 const {driveWorkflow}=await import('../dist/packages/agents/src/drive.js');
 const root=await temp();await initProject(root,{});
 execFileSync('git',['init','-q','-b','feat/aek-end-to-end'],{cwd:root});
 execFileSync('git',['config','user.email','tests@example.invalid'],{cwd:root});
 execFileSync('git',['config','user.name','Tests'],{cwd:root});
 await writeFile(join(root,'.gitignore'),'.ai-engineering/\n');
 await writeFile(join(root,'app.js'),'export const result = false;\n');
 execFileSync('git',['add','.gitignore','app.js'],{cwd:root});execFileSync('git',['commit','-qm','baseline'],{cwd:root});
 await startRun(root,'Implement a simple verified function');
 const scenario=await scenarioAgent();
 const result=await driveWorkflow(root,'cursor',{reviewer:'cursor',allowExec:true,allowWrites:true,allowTests:true,autoCommit:true,binary:process.execPath,binaryArgs:[scenario],maxStages:12});
 assert.equal(result.status,'complete',result.reason+' | '+JSON.stringify(result.steps));
 assert.equal((await getStatus(root)).stageStatus.learn,'passed');
 assert.equal((await getStatus(root)).evidence.length,1);
 assert.equal((await getStatus(root)).reviews.length,1);
 assert.equal((await readFile(join(root,'app.js'),'utf8')).includes('123'),true);
 assert.equal(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),'feat/aek-end-to-end');
 assert.match(execFileSync('git',['log','--oneline','-3'],{cwd:root,encoding:'utf8'}),/feat\(aek\): implement TASK-001/);
});

test('Agent execution transcripts are git-ignored even in a project without a root ignore rule',async()=>{
 const root=await temp();await initProject(root,{});await startRun(root,'Internal requirements');
 execFileSync('git',['init','-q'],{cwd:root});
 const bin=await fakeAgent(await temp(),JSON.stringify({type:'result',result:'Examined docs'}));
 const run=await runAgentStage(root,'cursor',{binary:process.execPath,binaryArgs:[bin],allowExec:true});
 assert.equal(run.exitCode,0);
 const listing=execFileSync('git',['status','--short','--untracked-files=all'],{cwd:root,encoding:'utf8'});
 assert.doesNotMatch(listing,/agent-runs\/.*json/);
});

test('bounded failure repair invokes model again, commits repaired source and re-verifies before delivery',async()=>{
 const {driveWorkflow}=await import('../dist/packages/agents/src/drive.js');
 const root=await temp();await initProject(root,{});
 execFileSync('git',['init','-q','-b','feat/repair-flow'],{cwd:root});
 execFileSync('git',['config','user.email','tests@example.invalid'],{cwd:root});
 execFileSync('git',['config','user.name','Tests'],{cwd:root});
 await writeFile(join(root,'.gitignore'),'.ai-engineering/\n');
 await writeFile(join(root,'app.js'),'export const result = false;\n');
 execFileSync('git',['add','.gitignore','app.js'],{cwd:root});execFileSync('git',['commit','-qm','baseline'],{cwd:root});
 await startRun(root,'Build and repair on failure');
 const scenario=await scenarioAgent();
 const result=await driveWorkflow(root,'cursor',{reviewer:'cursor',allowExec:true,allowWrites:true,allowTests:true,autoCommit:true,maxFixAttempts:2,binary:process.execPath,binaryArgs:[scenario],env:{AEK_MOCK_BAD_FIRST:'1'},maxStages:15});
 assert.equal(result.status,'complete',result.reason+' | '+JSON.stringify(result.steps));
 assert.match(result.steps.join(' '),/repair:/);
 assert.equal((await getStatus(root)).evidence.some(e=>e.exitCode!==0),true);
 assert.equal((await getStatus(root)).evidence.some(e=>e.exitCode===0),true);
 assert.equal((await readFile(join(root,'app.js'),'utf8')).includes('123'),true);
});

test('Codex JSONL parser accepts completed final answer but rejects a failed turn even with exit zero',async()=>{
 const root=await temp();await initProject(root,{});await startRun(root,'Codex protocol test');
 const completed=[JSON.stringify({type:'thread.started',thread_id:'new'}),JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Wrote analysis'}}),JSON.stringify({type:'turn.completed'})].join('\n');
 const good=await fakeAgent(await temp(),completed);
 const r=await runAgentStage(root,'codex',{binary:process.execPath,binaryArgs:[good],allowExec:true});
 assert.equal(r.exitCode,0);assert.equal(r.summary,'Wrote analysis');
 const failed=[JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Not done'}}),JSON.stringify({type:'turn.failed'})].join('\n');
 const bad=await fakeAgent(await temp(),failed);
 const second=await runAgentStage(root,'codex',{binary:process.execPath,binaryArgs:[bad],allowExec:true});
 assert.notEqual(second.exitCode,0);
});

test('independent reviewer must not modify even its isolated checkout',async()=>{
 const root=await readyReview();const folder=await temp();
 const file=join(folder,'bad-reviewer.mjs');
 await writeFile(file,`import {writeFileSync} from 'node:fs';\nwriteFileSync('app.js','export const modified=true;');\nconsole.log(JSON.stringify({type:'result',result:JSON.stringify({task_id:'TASK-001',verdict:'pass',summary:'checked',findings:[]})}));\n`);
 await assert.rejects(runIndependentReview(root,'cursor',{binary:process.execPath,binaryArgs:[file],allowExec:true}),/modified|read-only|worktree/i);
 assert.equal((await getStatus(root)).reviews.length,0);
 assert.match(await readFile(join(root,'app.js'),'utf8'),/123/);
});

test('auto-commit refuses a protected main branch before allowing Agent implementation',async()=>{
 const {driveWorkflow}=await import('../dist/packages/agents/src/drive.js');
 const root=await temp();await initProject(root,{});
 execFileSync('git',['init','-q','-b','main'],{cwd:root});
 execFileSync('git',['config','user.email','tests@example.invalid'],{cwd:root});
 execFileSync('git',['config','user.name','Tests'],{cwd:root});
 await writeFile(join(root,'.gitignore'),'.ai-engineering/\n');await writeFile(join(root,'app.js'),'export const result = false;\n');
 execFileSync('git',['add','.gitignore','app.js'],{cwd:root});execFileSync('git',['commit','-qm','baseline'],{cwd:root});
 await startRun(root,'Should not commit to protected branch');
 const scenario=await scenarioAgent();
 const result=await driveWorkflow(root,'cursor',{reviewer:'cursor',allowExec:true,allowWrites:true,allowTests:true,autoCommit:true,binary:process.execPath,binaryArgs:[scenario]});
 assert.equal(result.status,'paused');assert.match(result.reason,/feature branch/i);
 assert.equal(await readFile(join(root,'app.js'),'utf8'),'export const result = false;\n');
 assert.equal(execFileSync('git',['rev-list','--count','HEAD'],{cwd:root,encoding:'utf8'}).trim(),'1');
});

test('automatic repair stops after an unproductive Agent repair instead of looping forever',async()=>{
 const {driveWorkflow}=await import('../dist/packages/agents/src/drive.js');
 const root=await temp();await initProject(root,{});
 execFileSync('git',['init','-q','-b','feat/fail-closed'],{cwd:root});
 execFileSync('git',['config','user.email','tests@example.invalid'],{cwd:root});execFileSync('git',['config','user.name','Tests'],{cwd:root});
 await writeFile(join(root,'.gitignore'),'.ai-engineering/\n');await writeFile(join(root,'app.js'),'export const result = false;\n');
 execFileSync('git',['add','.gitignore','app.js'],{cwd:root});execFileSync('git',['commit','-qm','baseline'],{cwd:root});
 await startRun(root,'Never fake a successful verification');
 const scenario=await scenarioAgent();
 const result=await driveWorkflow(root,'cursor',{reviewer:'cursor',allowExec:true,allowWrites:true,allowTests:true,autoCommit:true,maxFixAttempts:2,binary:process.execPath,binaryArgs:[scenario],env:{AEK_MOCK_BAD_FIRST:'1',AEK_MOCK_UNFIXABLE:'1'}});
 assert.equal(result.status,'paused');assert.match(result.reason,/no modified source|failed verification/i);
 assert.equal((await getStatus(root)).currentStage,'verify');
 assert.equal((await getStatus(root)).reviews.length,0);
});

test('regulated delivery pauses after generating acceptance then resumes without overwriting it once approved',async()=>{
 const {driveWorkflow}=await import('../dist/packages/agents/src/drive.js');
 const {approve}=await import('../dist/packages/core/src/engine.js');
 const root=await temp();await initProject(root,{risk:'regulated'});
 execFileSync('git',['init','-q','-b','feat/regulatory'],{cwd:root});
 execFileSync('git',['config','user.email','tests@example.invalid'],{cwd:root});execFileSync('git',['config','user.name','Tests'],{cwd:root});
 await writeFile(join(root,'.gitignore'),'.ai-engineering/\n');await writeFile(join(root,'app.js'),'export const result = false;\n');
 execFileSync('git',['add','.gitignore','app.js'],{cwd:root});execFileSync('git',['commit','-qm','baseline'],{cwd:root});
 await startRun(root,'Regulated release smoke');
 const scenario=await scenarioAgent();
 const opts={reviewer:'cursor',allowExec:true,allowWrites:true,allowTests:true,autoCommit:true,binary:process.execPath,binaryArgs:[scenario]};
 const first=await driveWorkflow(root,'cursor',opts);
 assert.equal(first.status,'paused');assert.match(first.reason,/approval/i);
 const acceptance=await readFile(join(root,'docs/09-delivery/acceptance.md'),'utf8');
 await approve(root,'deliver','human');
 const second=await driveWorkflow(root,'cursor',opts);
 assert.equal(second.status,'complete',second.reason);
 assert.equal(await readFile(join(root,'docs/09-delivery/acceptance.md'),'utf8'),acceptance);
});
