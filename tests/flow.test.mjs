import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { initProject, startRun, getStatus, advance, recordAnswer, addQuestion, resume, verifyTasks, submitReview, canDeliver } from '../dist/packages/core/src/engine.js';
import { validateSpec, validateContracts, auditPaths } from '../dist/packages/core/src/validation.js';
import { installAgent } from '../dist/packages/adapters/src/install.js';

const tmp=async()=>mkdtemp(join(tmpdir(),'aek-'));
async function createGit(root) {
  execFileSync('git',['init','-q'],{cwd:root});
  execFileSync('git',['config','user.email','tests@example.invalid'],{cwd:root});
  execFileSync('git',['config','user.name','Tests'],{cwd:root});
  await writeFile(join(root,'.gitignore'),'.ai-engineering/\n');
  await writeFile(join(root,'app.js'),'export const ok = true;\n');
  execFileSync('git',['add','.gitignore'],{cwd:root});
  execFileSync('git',['commit','-qm','test: baseline ignore'],{cwd:root});
  execFileSync('git',['add','app.js'],{cwd:root});
  execFileSync('git',['commit','-qm','feat: implement app js'],{cwd:root});
}
const sampleSpec='# Spec\n\n## FR-001 Create\n\nAC-FR-001-01: 输入有效时返回结果。\n';
const contract={schema_version:'1.0',id:'TASK-001',name:'Create',requirements:['FR-001'],acceptance_criteria:['AC-FR-001-01'],depends_on:[],allowed_paths:['app.js'],forbidden_paths:['.env*','secrets/**'],verification:{commands:[['node','--check','app.js']]},implementer:{id:'agent-A',context_id:'session-A'}};
async function setContract(root,c=contract) {const p=join(root,'docs/06-tasks/contracts');await mkdir(p,{recursive:true}); await writeFile(join(p,c.id+'.json'),JSON.stringify(c,null,2));}
async function commitApprovedDocsAndImplementation(root){
 execFileSync('git',['add','docs'],{cwd:root});execFileSync('git',['commit','-qm','docs: approved specification and task contracts'],{cwd:root});
 await writeFile(join(root,'app.js'),'export const ok = true; export const implemented = true;\n');
 execFileSync('git',['add','app.js'],{cwd:root});execFileSync('git',['commit','-qm','feat: implement TASK-001'],{cwd:root});
}


test('init is idempotent and dry run has no writes', async()=>{
 const root=await tmp(); let plan=await initProject(root,{dryRun:true,kind:'greenfield'});
 assert.equal(plan.actions.length>0,true); await assert.rejects(readFile(join(root,'.ai-engineering/config.json')));
 await initProject(root,{kind:'greenfield'});
 const cfg=await readFile(join(root,'.ai-engineering/config.json'),'utf8');
 await initProject(root,{kind:'feature'}); assert.equal(await readFile(join(root,'.ai-engineering/config.json'),'utf8'),cfg);
});

test('start, answer blocking question, resume state, require spec validation',async()=>{
 const root=await tmp(); await initProject(root,{}); await startRun(root,'员工请假系统');
 await addQuestion(root,{id:'DEC-001',phase:'requirements',question:'审批规则？',blocking:true,options:[{id:'A',label:'一级审批',reason:'简单'},{id:'B',label:'两级审批',reason:'审计'}]});
 await assert.rejects(advance(root),/DEC-001/);
 await recordAnswer(root,'DEC-001','B','human');
 assert.equal((await resume(root)).currentStage,'requirements');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'业务分析');
 await advance(root);
 assert.equal((await getStatus(root)).currentStage,'spec');
 await assert.rejects(advance(root),/spec.md/);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec);
 await advance(root);
 assert.equal((await getStatus(root)).currentStage,'design');
});

test('spec validation rejects duplicate FR and missing AC',()=>{
 assert.equal(validateSpec('## FR-001 X\n## FR-001 X\n').ok,false);
 assert.equal(validateSpec('## FR-001 X\n').ok,false);
 assert.equal(validateSpec(sampleSpec).ok,true);
});

test('task DAG, AC coverage, unsafe scope and path traversal are rejected',()=>{
 assert.equal(validateContracts([contract],sampleSpec).ok,true);
 assert.equal(validateContracts([{...contract,depends_on:['TASK-999']}],sampleSpec).ok,false);
 assert.equal(validateContracts([{...contract,depends_on:['TASK-001']}],sampleSpec).ok,false);
 assert.equal(validateContracts([{...contract,acceptance_criteria:[]}],sampleSpec).ok,false);
 assert.deepEqual(auditPaths({...contract,allowed_paths:['src/**']},['src/a.ts','../secrets/key']),['../secrets/key']);
 assert.deepEqual(auditPaths({...contract,allowed_paths:['src/**']},['src/a.ts','src/../secrets/key']),['src/../secrets/key']);
});

test('verification evidence is tied to commit + worktree and cannot be replaced with handmade pass',async()=>{
 const root=await tmp(); await initProject(root,{}); await createGit(root); await startRun(root,'Feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'分析'); await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec); await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'architecture design'); await advance(root);
 await setContract(root); await advance(root);
 await commitApprovedDocsAndImplementation(root);
 await advance(root); // implement step
 await verifyTasks(root,{allowExec:true});
 assert.equal((await getStatus(root)).evidence.length,1);
 const statePath=join(root,'.ai-engineering/state.json');
 const data=JSON.parse(await readFile(statePath,'utf8')); data.evidence[0].exitCode=99; await writeFile(statePath,JSON.stringify(data));
 await assert.rejects(advance(root),/evidence|签名|verification/i);
});

test('non-zero test command fails and stale source rejects evidence',async()=>{
 const root=await tmp(); await initProject(root,{}); await createGit(root); await startRun(root,'Test');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'分析'); await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec); await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design'); await advance(root);
 await setContract(root,{...contract,verification:{commands:[['node','-e','process.exit(4)']]}}); await advance(root);await commitApprovedDocsAndImplementation(root); await advance(root);
 const r=await verifyTasks(root,{allowExec:true}); assert.equal(r.passed,false);
 await assert.rejects(advance(root),/verification|evidence/i);
});

test('spec change invalidates downstream stages',async()=>{
 const root=await tmp(); await initProject(root,{}); await startRun(root,'Feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'analysis'); await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec); await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design'); await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec+'\n## FR-002 Changed\nAC-FR-002-01: yes\n');
 const result=await getStatus(root); assert.equal(result.currentStage,'spec'); assert.equal(result.stageStatus.design,'stale');
});

test('installation preserves existing guidance and refuses conflicting skill files',async()=>{
 const root=await tmp(); await initProject(root,{});
 await writeFile(join(root,'AGENTS.md'),'custom pre-existing rules');
 const preview=await installAgent(root,'codex',{dryRun:true}); assert.equal(preview.actions.length>0,true);
 await installAgent(root,'codex',{});
 assert.equal(await readFile(join(root,'AGENTS.md'),'utf8'),'custom pre-existing rules');
 const skill=join(root,'.agents/skills/ai-start/SKILL.md'); await writeFile(skill,'custom');
 const update=await installAgent(root,'codex',{}); assert.equal(update.conflicts.includes('.agents/skills/ai-start/SKILL.md'),true);
 assert.equal(await readFile(skill,'utf8'),'custom');
 await installAgent(root,'claude',{}); await installAgent(root,'cursor',{});
 assert.match(await readFile(join(root,'.claude/skills/ai-start/SKILL.md'),'utf8'),/name: ai-start/);
 assert.match(await readFile(join(root,'.cursor/rules/ai-engineering.mdc'),'utf8'),/ai-engineering/);
 assert.match(await readFile(join(root,'.ai-engineering/templates/contracts/task-contract.json'),'utf8'),/TASK-001/);
});

test('review requires independent actor and rejects unresolved high issues',async()=>{
 const root=await tmp(); await initProject(root,{}); await createGit(root); await startRun(root,'Review');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'analysis'); await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec); await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design'); await advance(root);
 await setContract(root); await advance(root);await commitApprovedDocsAndImplementation(root); await advance(root);
 await verifyTasks(root,{allowExec:true}); await advance(root);
 await assert.rejects(submitReview(root,{reviewer_id:'agent-A',context_id:'session-A',task_id:'TASK-001',findings:[],source:'new-session'}),/independent|独立/i);
 await assert.rejects(submitReview(root,{reviewer_id:'reviewer-B',context_id:'session-B',task_id:'TASK-001',findings:[{severity:'high',status:'open'}],source:'new-session'}),/high|严重/i);
 await submitReview(root,{reviewer_id:'reviewer-B',context_id:'session-B',task_id:'TASK-001',findings:[],source:'new-session'});
 await advance(root); assert.equal((await getStatus(root)).currentStage,'deliver');
 assert.equal((await canDeliver(root)).ok,false);
});

test('AC mention without a concrete AC declaration must fail spec gate',()=>{
 assert.equal(validateSpec('## FR-001 Create\nRelated to AC-FR-001-01 in future.').ok,false);
});

test('init rejects unknown risk rather than silently dropping regulated controls',async()=>{
 const root=await tmp();await assert.rejects(initProject(root,{risk:'regualted'}),/risk|profile/i);
});

test('evidence is invalid if an untracked code file changes content after verification',async()=>{
 const root=await tmp(); await initProject(root,{}); await createGit(root); await startRun(root,'Feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'分析'); await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec); await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design'); await advance(root);
 await setContract(root);await advance(root);await commitApprovedDocsAndImplementation(root);await advance(root);
 await verifyTasks(root,{allowExec:true});
 await writeFile(join(root,'scratch.tmp'),'modified');
 await assert.rejects(advance(root),/evidence|verification/i);
});

test('adapter can verify installation and only uninstall unmodified owned files',async()=>{
 const { verifyAgentInstallation, uninstallAgent }=await import('../dist/packages/adapters/src/install.js');
 const root=await tmp();await initProject(root,{});
 await installAgent(root,'cursor',{});
 assert.equal((await verifyAgentInstallation(root,'cursor')).ok,true);
 const edited=join(root,'.cursor/skills/ai-start/SKILL.md');await writeFile(edited,'custom replacement');
 const result=await uninstallAgent(root,'cursor',{});
 assert.equal(result.conflicts.includes('.cursor/skills/ai-start/SKILL.md'),true);
 assert.equal(await readFile(edited,'utf8'),'custom replacement');
 assert.equal((await verifyAgentInstallation(root,'cursor')).ok,false);
});

test('verification rejects last git commit changed outside allowed task paths',async()=>{
 const root=await tmp();await initProject(root,{});await createGit(root);await startRun(root,'Feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'analysis');await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec);await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design');await advance(root);
 await setContract(root);await advance(root);await commitApprovedDocsAndImplementation(root);await advance(root);
 await writeFile(join(root,'forbidden.txt'),'unexpected');
 execFileSync('git',['add','forbidden.txt'],{cwd:root});execFileSync('git',['commit','-qm','bad: unexpected file'],{cwd:root});
 await assert.rejects(verifyTasks(root,{allowExec:true}),/outside task scope/);
});

test('CLI init/install/status commands work in real child process',async()=>{
 const root=await tmp();const bin=resolve(import.meta.dirname,'..','bin','ai-engineering.mjs');
 const call=(...a)=>JSON.parse(execFileSync('node',[bin,...a,'--project',root],{encoding:'utf8'}));
 assert.equal(call('init','--kind','feature').actions.length>0,true);
 assert.equal(call('install','codex').actions.length>0,true);
 assert.equal(call('adapter-check','codex').ok,true);
 assert.equal(call('start','在现有邮件系统新增批量下载').stage,'requirements');
 assert.equal(call('status').currentStage,'requirements');
 assert.equal(call('uninstall','codex').actions.length>0,true);
});

test('verification rejects dirty working tree to prevent uncommitted edits masquerading as committed tests',async()=>{
 const root=await tmp();await initProject(root,{});await createGit(root);await startRun(root,'Feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'analysis');await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec);await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design');await advance(root);
 await setContract(root);await advance(root);await advance(root);
 await assert.rejects(verifyTasks(root,{allowExec:true}),/clean|commit|dirty/i);
});

test('end-to-end nine-stage regulated flow blocks delivery until authorized and records lessons',async()=>{
 const root=await tmp(); await initProject(root,{risk:'regulated'});await createGit(root);await startRun(root,'Financial workflow');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'Business and authorization analysis');await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec);await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'Security architecture, fallback and data flow');await advance(root);
 await setContract(root);await advance(root);await commitApprovedDocsAndImplementation(root);await advance(root);
 assert.equal((await verifyTasks(root,{allowExec:true})).passed,true);await advance(root);
 await submitReview(root,{reviewer_id:'agent-B',context_id:'new-session-B',task_id:'TASK-001',findings:[],source:'new-session'});await advance(root);
 await writeFile(join(root,'docs/09-delivery/acceptance.md'),'AC-FR-001-01 passed with signed evidence');
 assert.match((await canDeliver(root)).reasons.join(' '),/approval/);
 await assert.rejects(advance(root),/approval/);
 const {approve}=await import('../dist/packages/core/src/engine.js');
 await approve(root,'deliver','human');
 assert.equal((await canDeliver(root)).ok,true);await advance(root);
 await writeFile(join(root,'docs/10-feedback/lessons.md'),'Document future changes and retest');await advance(root);
 const state=await getStatus(root);assert.equal(state.currentStage,'learn');assert.equal(state.stageStatus.learn,'passed');
});

test('new code commit invalidates previously passing signed verification evidence',async()=>{
 const root=await tmp();await initProject(root,{});await createGit(root);await startRun(root,'Feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'analysis');await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec);await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design');await advance(root);
 await setContract(root);await advance(root);await commitApprovedDocsAndImplementation(root);await advance(root);
 await verifyTasks(root,{allowExec:true});
 await writeFile(join(root,'app.js'),'export const implemented = false;\n');
 execFileSync('git',['add','app.js'],{cwd:root});execFileSync('git',['commit','-qm','fix: change implementation'],{cwd:root});
 await assert.rejects(advance(root),/evidence|Verification/i);
});

test('delivery-only documentation commit does not invalidate previously verified implementation',async()=>{
 const root=await tmp();await initProject(root,{});await createGit(root);await startRun(root,'Feature');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'analysis');await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec);await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design');await advance(root);
 await setContract(root);await advance(root);await commitApprovedDocsAndImplementation(root);await advance(root);
 await verifyTasks(root,{allowExec:true});await advance(root);
 await submitReview(root,{reviewer_id:'reviewer-B',context_id:'new-context',task_id:'TASK-001',findings:[],source:'new-session'});await advance(root);
 await writeFile(join(root,'docs/09-delivery/acceptance.md'),'AC verified');
 execFileSync('git',['add','docs/09-delivery/acceptance.md'],{cwd:root});execFileSync('git',['commit','-qm','docs: add acceptance evidence'],{cwd:root});
 assert.equal((await canDeliver(root)).ok,true);
});

test('installer refuses symlinked skill target directories',async()=>{
 const root=await tmp();await initProject(root,{});
 await mkdir(join(root,'.agents'),{recursive:true});
 const {symlink}=await import('node:fs/promises');
 const external=await tmp();await symlink(external,join(root,'.agents/skills'),'dir');
 await assert.rejects(installAgent(root,'codex',{}),/symlink/);
});

test('init refuses symlinked internal project directory to prevent writing outside repo',async()=>{
 const root=await tmp();const external=await tmp();
 const {symlink}=await import('node:fs/promises');
 await symlink(external,join(root,'.ai-engineering'),'dir');
 await assert.rejects(initProject(root,{}),/symlink|unsafe/i);
 await assert.rejects(readFile(join(external,'config.json'),'utf8'));
});


test('a second successful verification supersedes a first failure on the same source commit',async()=>{
 const root=await tmp();await initProject(root,{});await createGit(root);await startRun(root,'Retry check');
 await writeFile(join(root,'docs/01-requirements/analysis.md'),'analysis');await advance(root);
 await writeFile(join(root,'docs/01-requirements/spec.md'),sampleSpec);await advance(root);
 await writeFile(join(root,'docs/03-architecture/design.md'),'design');await advance(root);
 const cmd=['node','-e',"process.exit(require('node:fs').existsSync('.ai-engineering/transient-error')?7:0)"];
 await setContract(root,{...contract,verification:{commands:[cmd]}});await advance(root);
 await commitApprovedDocsAndImplementation(root);await advance(root);
 await writeFile(join(root,'.ai-engineering/transient-error'),'temporary outage');
 assert.equal((await verifyTasks(root,{allowExec:true})).passed,false);
 await (await import('node:fs/promises')).rm(join(root,'.ai-engineering/transient-error'));
 assert.equal((await verifyTasks(root,{allowExec:true})).passed,true);
 await advance(root); assert.equal((await getStatus(root)).currentStage,'review');
});
