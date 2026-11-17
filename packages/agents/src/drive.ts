import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { advance, getStatus, loadContracts, verifyTasks, type Stage } from '../../core/src/engine.js';
import { auditPaths } from '../../core/src/validation.js';
import { exists, pathOf, readJson, readTextOrEmpty, writeAtomic } from '../../core/src/io.js';
import { runAgentStage, runIndependentReview, type AgentOptions, type CliAgent } from './runtime.js';

export interface DriveOptions extends AgentOptions { reviewer:CliAgent;allowTests?:boolean;autoCommit?:boolean;maxStages?:number;maxFixAttempts?:number }
export interface DriveResult { status:'paused'|'failed'|'complete';currentStage:Stage;reason:string;steps:string[] }
const git=(root:string,args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
function head(root:string):string {try{return git(root,['rev-parse','HEAD']);}catch{return '';}}
function dirty(root:string):string[] {
 // -z avoids quoting issues in localized filenames. Rename entries require a separate scope audit.
 return execFileSync('git',['status','--porcelain=v1','-z','-uall'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).split('\0').filter(Boolean)
  .map(line=>line.slice(3));
}
function safeBranch(root:string):string{
 const branch=git(root,['symbolic-ref','--quiet','--short','HEAD']);
 if(!branch||/^(main|master|develop|development|production|release)(\/|$)/i.test(branch))throw Error(`Auto-commit requires a feature branch; current branch: ${branch||'(detached)'}`);
 return branch;
}
function commitDocs(root:string):string{
 safeBranch(root);
 const modified=dirty(root);
 if(!modified.length)return 'No documentation commit necessary';
 if(modified.some(p=>!p.startsWith('docs/')))throw Error(`Auto-commit docs refused: unrelated changes ${modified.join(', ')}`);
 git(root,['add','-A','--','docs']);
 git(root,['commit','-m','docs(aek): approved requirements, design and contracts']);
 return `Committed stage documents at ${head(root).slice(0,8)}`;
}
async function commitImplementation(root:string):Promise<string>{
 safeBranch(root);
 const modified=dirty(root);
 if(!modified.length)throw Error('Agent reported completion without any source change');
 const tasks=await loadContracts(root);
 if(tasks.length!==1)throw Error('V0.2 auto-commit requires exactly one task; multiple contracts require per-task commits and verification');
 const invalid=auditPaths(tasks[0]!,modified);
 if(invalid.length)throw Error(`Auto-commit refused changes outside task contract: ${invalid.join(', ')}`);
 git(root,['add','-A','--',...modified]);
 git(root,['commit','-m',`feat(aek): implement ${tasks[0]!.id}`]);
 return `Committed implementation at ${head(root).slice(0,8)}`;
}
const checkpoint='.ai-engineering/agent-runs/implement-checkpoint.json';
export async function driveWorkflow(root:string,agent:CliAgent,options:DriveOptions):Promise<DriveResult>{
 if(!options.allowExec)throw Error('Explicit --allow-agent-exec is required for drive');
 if(!options.allowWrites)throw Error('Driving implementation requires --allow-writes');
 if(!options.allowTests)throw Error('Running task verification requires --allow-tests');
 if(!Number.isInteger(options.maxStages??12)|| (options.maxStages??12)<1||(options.maxStages??12)>30)throw Error('maxStages must be 1..30');
 if(!Number.isInteger(options.maxFixAttempts??2)||(options.maxFixAttempts??2)<0||(options.maxFixAttempts??2)>5)throw Error('maxFixAttempts must be 0..5');
 const steps:string[]=[];
 const finish=async(status:DriveResult['status'],reason:string):Promise<DriveResult>=>({status,currentStage:(await getStatus(root)).currentStage,reason,steps});
 stages: for(let i=0;i<(options.maxStages??12);i++){
  const s=await getStatus(root),stage=s.currentStage;
  if(s.stageStatus[stage]==='passed')return finish('complete','All nine stages passed their local gates');
  const pending=s.questions.filter(q=>q.blocking&&!q.answer);
  if(pending.length)return finish('paused',`Awaiting human choices: ${pending.map(q=>q.id).join(', ')}`);
  if(stage==='implement'){
    if(!head(root))return finish('paused','A committed Git repository is required before implementation');
    const saved=await exists(pathOf(root,checkpoint))?await readJson<{runId:string;headBefore:string}>(pathOf(root,checkpoint)):null;
    if(saved?.runId===s.id&&saved.headBefore!==head(root)&&!dirty(root).length){
      await advance(root);steps.push('implement: accepted committed implementation checkpoint');continue;
    }
    if(dirty(root).length){
      if(!options.autoCommit)return finish('paused','Commit requirements, design and task contracts before implementation');
      try{steps.push(commitDocs(root));}catch(e){return finish('paused',(e as Error).message);}
    }
    const headBefore=head(root);
    const result=await runAgentStage(root,agent,options);steps.push(`${stage}: model subprocess exit ${result.exitCode}`);
    if(result.exitCode!==0)return finish('failed',`Agent execution failed; trace: ${result.logPath}`);
    if(result.pendingDecisions.length)return finish('paused',`Please answer ${result.pendingDecisions.join(', ')} before implementation continues`);
    if(!dirty(root).length)return finish('paused','Agent exited successfully but produced no source modifications');
    await writeAtomic(pathOf(root,checkpoint),JSON.stringify({runId:s.id,headBefore,agent,trace:result.logPath},null,2));
    if(!options.autoCommit)return finish('paused','Inspect and commit implementation changes, then rerun drive');
    try{steps.push(await commitImplementation(root));await advance(root);continue;}
    catch(e){return finish('paused',(e as Error).message);}
  }
  if(stage==='verify'){
    for(let attempt=0;attempt<=(options.maxFixAttempts??2);attempt++){
      let result:Awaited<ReturnType<typeof verifyTasks>>;
      try{result=await verifyTasks(root,{allowExec:true});}
      catch(e){return finish('paused',`Verification gate blocked: ${(e as Error).message}`);}
      steps.push(`verify: ${result.results.length} executable commands, attempt ${attempt+1}, passed ${result.passed}`);
      if(result.passed){
        try{await advance(root);continue stages;}
        catch(e){return finish('paused',`Evidence verification blocked: ${(e as Error).message}`);}
      }
      if(attempt===(options.maxFixAttempts??2))return finish('paused',`Failed verification after ${attempt+1} attempts; no further automatic retries`);
      const failures=result.results.filter(r=>r.exitCode!==0);
      const detail=failures.map(f=>`${f.taskId}: ${f.command} (exit ${f.exitCode})`).join('\n');
      const repair=await runAgentStage(root,agent,{...options,allowWrites:true,
        extraInstructions:`REPAIR_MODE. This run must repair failing source code without changing accepted requirements or task contracts. Failing commands:\n${detail}\nRead local .ai-engineering/evidence logs for details. Change only allowed task contract source paths. You must NOT modify verification or review evidence, create a false pass, or advance the workflow.`});
      steps.push(`repair: agent exit ${repair.exitCode}`);
      if(repair.exitCode!==0)return finish('failed',`Repair subprocess failed: ${repair.logPath}`);
      if(!dirty(root).length)return finish('paused','Repair agent produced no modified source; cannot retry as fixed');
      if(!options.autoCommit)return finish('paused','Inspect and commit repaired source, then rerun drive');
      try{steps.push(await commitImplementation(root));}
      catch(e){return finish('paused',`Repair scope blocked: ${(e as Error).message}`);}
    }
  }
  if(stage==='review'){
    try{const result=await runIndependentReview(root,options.reviewer,options);steps.push(`review: ${result.tasks.length} independent subprocess review(s)`);await advance(root);continue;}
    catch(e){return finish('paused',`Independent review blocked: ${(e as Error).message}`);}
  }
  if(stage==='deliver'&&(await readTextOrEmpty(pathOf(root,'docs/09-delivery/acceptance.md'))).trim()){
    // A paused regulated run must not repeat the model write after the human approves.
    try{await advance(root);steps.push('deliver: reused existing acceptance after gate approval');continue;}
    catch(e){return finish('paused',`Delivery gate blocked: ${(e as Error).message}`);}
  }
  const result=await runAgentStage(root,agent,options);
  steps.push(`${stage}: agent exit ${result.exitCode}, artifact changed ${result.artifactProduced}`);
  if(result.exitCode!==0)return finish('failed',`Agent execution failed; trace: ${result.logPath}`);
  if(result.pendingDecisions.length)return finish('paused',`Awaiting human choices: ${result.pendingDecisions.join(', ')}`);
  try {await advance(root);}catch(e){return finish('paused',`Stage ${stage} gate blocked: ${(e as Error).message}`);}
 }
 return finish('paused','Stage budget reached; rerun drive to continue');
}
