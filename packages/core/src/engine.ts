import { appendFile, mkdir, readFile, writeFile, lstat, readlink } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { exists, listJsonFiles, now, pathOf, readJson, readTextOrEmpty, sha256, withLock, writeAtomic } from './io.js';
import { auditPaths, TaskContract, validateContracts, validateSpec } from './validation.js';

export const STAGES = ['requirements','spec','design','plan','implement','verify','review','deliver','learn'] as const;
export type Stage = (typeof STAGES)[number];
type StageStatus='pending'|'active'|'passed'|'stale';
export interface Question { id:string;phase:Stage;question:string;blocking:boolean; options:{id:string;label:string;reason:string}[];answer?:string;answered_by?:string;answered_at?:string;}
interface Evidence { id:string;taskId:string;command:string[];commitSha:string;sourceTreeHash:string;worktreeHash:string;contractHash:string;specHash:string;exitCode:number;outputHash:string;logPath:string;startedAt:string;finishedAt:string;signature:string;}
interface Review { taskId:string;reviewerId:string;contextId:string;source:string;findings:{severity:string;status:string}[];commitSha:string;sourceTreeHash:string;at:string;}
interface State { schemaVersion:'1.0';id:string;goal:string;mode:'greenfield'|'feature';currentStage:Stage;stageStatus:Record<Stage,StageStatus>;artifactHashes:Partial<Record<Stage,string>>;questions:Question[];evidence:Evidence[];reviews:Review[];approvals:{stage:Stage;actor:string;at:string}[];updatedAt:string;}
interface ProjectConfig { schemaVersion:'1.0';projectKind:string;riskProfile:string;autonomy:string;runner:string;technologyProfiles:string[];customRules:string[];}
const CONFIG='.ai-engineering/config.json'; const STATE='.ai-engineering/state.json';
const PROJECT_DIRS=['.ai-engineering/evidence','.ai-engineering/prompts','docs/01-requirements','docs/02-product-design','docs/03-architecture','docs/04-database','docs/05-api','docs/06-tasks/contracts','docs/07-verification','docs/08-reviews','docs/09-delivery','docs/10-feedback'];
const artifactPaths:Partial<Record<Stage,string>>={requirements:'docs/01-requirements/analysis.md',spec:'docs/01-requirements/spec.md',design:'docs/03-architecture/design.md',deliver:'docs/09-delivery/acceptance.md',learn:'docs/10-feedback/lessons.md'};
function configFor(kind:string,risk:string):ProjectConfig{return {schemaVersion:'1.0',projectKind:kind,riskProfile:risk,autonomy:'L1',runner:'local',technologyProfiles:[],customRules:[]};}
export async function initProject(root:string,options:{dryRun?:boolean;kind?:string;risk?:string}={}):Promise<{actions:string[];conflicts:string[]}> {
  if(options.risk&&!['basic','standard','regulated'].includes(options.risk))throw new Error(`Unsupported risk profile: ${options.risk}`);
  if(options.kind&&!['greenfield','feature'].includes(options.kind))throw new Error(`Unsupported project kind: ${options.kind}`);
  const base=resolve(root);const actions:string[]=[];
  // Existing nested symlinks are never a safe place to initialize project-owned assets.
  for(const rel of [...PROJECT_DIRS,CONFIG,'.ai-engineering/.evidence-key']){
    let current=base;
    for(const part of rel.split('/')){
      current=join(current,part);
      try {if((await lstat(current)).isSymbolicLink())throw new Error(`Unsafe symlink in initialization path: ${rel}`);}
      catch(err){if((err as NodeJS.ErrnoException).code!=='ENOENT')throw err;}
    }
  }
  const cfg=pathOf(base,CONFIG);
  for (const d of PROJECT_DIRS)if(!await exists(pathOf(base,d)))actions.push(`mkdir ${d}`);
  if(!await exists(cfg))actions.push(`create ${CONFIG}`);
  if(!options.dryRun){
    for(const d of PROJECT_DIRS)await mkdir(pathOf(base,d),{recursive:true});
    if(!await exists(cfg))await writeAtomic(cfg,JSON.stringify(configFor(options.kind??'greenfield',options.risk??'standard'),null,2)+'\n');
    const secret=pathOf(base,'.ai-engineering/.evidence-key');
    if(!await exists(secret))await writeFile(secret,randomBytes(32),{mode:0o600,flag:'wx'});
    const ignore=pathOf(base,'.ai-engineering/.gitignore');
    if(!await exists(ignore))await writeFile(ignore,'state.json\nevents.ndjson\nevidence/\n.evidence-key\n.lock\n');
  }
  return {actions,conflicts:[]};
}
async function loadConfig(root:string):Promise<ProjectConfig>{return readJson<ProjectConfig>(pathOf(root,CONFIG));}
async function loadState(root:string):Promise<State>{return readJson<State>(pathOf(root,STATE));}
async function store(root:string,s:State,event:string):Promise<void>{
  s.updatedAt=now();
  await writeAtomic(pathOf(root,STATE),JSON.stringify(s,null,2)+'\n');
  await appendFile(pathOf(root,'.ai-engineering/events.ndjson'),JSON.stringify({at:s.updatedAt,runId:s.id,stage:s.currentStage,event})+'\n');
}
async function update<T>(root:string,event:string,fn:(s:State)=>Promise<T>):Promise<T>{
  return withLock(root,async()=>{const s=await loadState(root);const result=await fn(s);await store(root,s,event);return result;});
}
export async function startRun(root:string,goal:string,mode?:'greenfield'|'feature'):Promise<State>{
  if(!goal?.trim())throw new Error('Please provide a requirement, e.g. aek start "Build a leave management system"');
  return withLock(root,async()=>{
    if(await exists(pathOf(root,STATE)))throw new Error('A run already exists. Use resume, or backup the state before starting a different run');
    const cfg=await loadConfig(root);
    const statuses=Object.fromEntries(STAGES.map((stage,i)=>[stage,i===0?'active':'pending'])) as Record<Stage,StageStatus>;
    const s:State={schemaVersion:'1.0',id:randomUUID(),goal:goal.trim(),mode:mode??(cfg.projectKind==='feature'?'feature':'greenfield'),currentStage:'requirements',stageStatus:statuses,artifactHashes:{},questions:[],evidence:[],reviews:[],approvals:[],updatedAt:now()};
    await store(root,s,'run_started');
    const goalFile=pathOf(root,'docs/01-requirements/original-request.md');
    if(!await exists(goalFile))await writeFile(goalFile,`# 原始需求\n\n${s.goal}\n`);
    return s;
  });
}
export async function resume(root:string):Promise<State>{return getStatus(root);}
async function hashArtifact(root:string,stage:Stage):Promise<string>{
  if(stage==='plan'){
    const files=await listJsonFiles(pathOf(root,'docs/06-tasks/contracts'));
    return sha256((await Promise.all(files.map(async f=>basename(f)+':'+sha256(await readFile(f))))).join('\n'));
  }
  const file=artifactPaths[stage];return file ? sha256(await readTextOrEmpty(pathOf(root,file))) : '';
}
async function refreshStaleness(root:string,s:State):Promise<boolean>{
  for(const stage of STAGES){
    const saved=s.artifactHashes[stage];
    if(!saved)continue;
    const actual=await hashArtifact(root,stage);
    if(saved!==actual){
      const start=STAGES.indexOf(stage);
      for(const x of STAGES.slice(start)){
        if(x!==stage) s.stageStatus[x]='stale';
        else s.stageStatus[x]='active';
      }
      s.currentStage=stage;
      for(const x of STAGES.slice(start))delete s.artifactHashes[x];
      s.evidence=[];s.reviews=[];
      return true;
    }
  }
  return false;
}
export async function getStatus(root:string):Promise<State>{
  return withLock(root,async()=>{
    const s=await loadState(root);
    if(await refreshStaleness(root,s))await store(root,s,'upstream_changed_invalidated');
    return s;
  });
}
export async function addQuestion(root:string,input:Omit<Question,'answer'|'answered_by'|'answered_at'>):Promise<Question>{
  if(!/^DEC-[A-Z0-9-]+$/.test(input.id)||!input.question||!STAGES.includes(input.phase))throw new Error('Invalid question ID / text / phase');
  if(!Array.isArray(input.options)||input.options.length<2||input.options.length>4||input.options.some(x=>!x.id||!x.label||!x.reason))throw new Error('Provide 2–4 options with labels and reasons');
  return update(root,'question_added',async s=>{
    if(s.questions.some(q=>q.id===input.id))throw new Error(`Duplicate question ${input.id}`);
    s.questions.push(input);return input;
  });
}
export async function recordAnswer(root:string,id:string,answer:string,actor:string):Promise<Question>{
  if(actor!=='human')throw new Error('Only an explicit human decision can resolve a blocking question');
  return update(root,'question_answered',async s=>{
    const q=s.questions.find(q=>q.id===id);if(!q)throw new Error(`Unknown question ${id}`);
    if(!q.options.some(o=>o.id===answer))throw new Error('Answer must match one of the option IDs');
    q.answer=answer;q.answered_by=actor;q.answered_at=now();return q;
  });
}
export async function approve(root:string,stage:Stage,actor:string):Promise<void>{
  if(!STAGES.includes(stage)||!actor.trim())throw new Error('Invalid approval');
  return update(root,'stage_approved',async s=>{s.approvals.push({stage,actor,at:now()});});
}
export async function loadContracts(root:string):Promise<TaskContract[]>{
  const files=await listJsonFiles(pathOf(root,'docs/06-tasks/contracts'));
  return Promise.all(files.map(readJson<TaskContract>));
}
const git=(root:string,args:string[]):string=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
const gitSha=(root:string)=>{
  try{const sha=git(root,['rev-parse','HEAD']);if(!/^[a-f0-9]{40}$/.test(sha))throw Error();return sha;}
  catch{throw new Error('Git repository must contain at least one commit before verification');}
};
function allowPostVerificationDocument(file:string):boolean {
  return file.startsWith('.ai-engineering/')||file.startsWith('docs/09-delivery/')||file.startsWith('docs/10-feedback/');
}
function sourceTreeHash(root:string):string {
  const entries=git(root,['ls-tree','-r','-z','HEAD']).split('\0').filter(Boolean)
    .filter(line=>!allowPostVerificationDocument(line.split('\t').slice(1).join('\t')));
  return sha256(entries.join('\0'));
}
function isAncestor(root:string,commit:string):boolean {
  if(!/^[a-f0-9]{40}$/.test(commit))return false;
  try {execFileSync('git',['merge-base','--is-ancestor',commit,'HEAD'],{cwd:root,stdio:'ignore',timeout:10000});return true;}
  catch{return false;}
}
function dirtyPaths(root:string):string[] {
  return git(root,['status','--porcelain=v1','-z','-uall']).split('\0')
    .filter(x=>x.trim()&&!allowPostVerificationDocument(x.slice(3)));
}
async function worktreeHash(root:string):Promise<string> {
  // Include content hashes for untracked files, not merely their names.
  const status=dirtyPaths(root);
  const diff=git(root,['diff','HEAD','--binary','--','.',':!docs/09-delivery',':!docs/10-feedback',':!.ai-engineering']);
  const untracked:Record<string,string>={};
  for(const line of status){
    if(!line.startsWith('?? '))continue;
    const rel=line.slice(3);
    const full=pathOf(root,rel);
    try {untracked[rel]=(await lstat(full)).isSymbolicLink()?sha256(await readlink(full)):sha256(await readFile(full));}
    catch {untracked[rel]='UNREADABLE_OR_CHANGED';}
  }
  return sha256(JSON.stringify({status,diff,untracked}));
}
const payload=(e:Evidence):string=>JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k])=>k!=='signature')));
async function sign(root:string,e:Evidence):Promise<string>{const key=await readFile(pathOf(root,'.ai-engineering/.evidence-key'));return createHmac('sha256',key).update(payload(e)).digest('hex');}
async function validEvidence(root:string,e:Evidence):Promise<boolean>{
  try{
    const expected=await sign(root,e);
    return e.exitCode===0 && /^[0-9a-f]{64}$/.test(e.signature) && timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(e.signature,'hex'));
  }catch{return false;}
}
async function checkVerification(root:string,s:State):Promise<void>{
  const tasks=await loadContracts(root);
  const spec=await readTextOrEmpty(pathOf(root,'docs/01-requirements/spec.md'));
  const report=validateContracts(tasks,spec);
  if(!report.ok)throw new Error('Contract validation failed: '+report.errors.join('; '));
  const tree=await worktreeHash(root);const codeHash=sourceTreeHash(root);const specHash=sha256(spec);
  const dirty=dirtyPaths(root);
  if(dirty.length)throw new Error('Verification evidence invalid: working tree has uncommitted changes');
  for(const task of tasks){
    const matching=s.evidence.filter(e=>e.taskId===task.id && isAncestor(root,e.commitSha) && e.sourceTreeHash===codeHash && e.worktreeHash===tree && e.contractHash===sha256(JSON.stringify(task)) && e.specHash===specHash);
    for(const command of task.verification.commands){
      const cmd=matching.find(e=>JSON.stringify(e.command)===JSON.stringify(command));
      if(!cmd||!await validEvidence(root,cmd))throw new Error(`Verification evidence missing, stale, or signature invalid for ${task.id}: ${command.join(' ')}`);
      const actualLog=await readTextOrEmpty(pathOf(root,cmd.logPath));
      if(sha256(actualLog)!==cmd.outputHash)throw new Error(`Verification evidence log modified for ${task.id}`);
    }
  }
}
function getCommitChangedPaths(root:string):string[]{
  try {return git(root,['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n').filter(Boolean);}catch{return [];}
}
function sanitize(text:string):string{
  return text.replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi,'$1=[REDACTED]')
    .replace(/(Authorization:\s*Bearer\s+)\S+/gi,'$1[REDACTED]');
}
async function execute(root:string,argv:string[],ms=30000):Promise<{exitCode:number;output:string}>{
  return new Promise(resolveResult=>{
    const child=spawn(argv[0]!,argv.slice(1),{cwd:root,env:{...process.env,CI:'true'},shell:false,windowsHide:true});
    let output='';let done=false;
    const timer=setTimeout(()=>child.kill('SIGKILL'),ms);
    const absorb=(x:Buffer)=>{if(output.length<128000)output+=x.toString().slice(0,128000-output.length);};
    child.stdout?.on('data',absorb);child.stderr?.on('data',absorb);
    child.on('error',(err)=>{output+='\n'+err.message;});
    child.on('close',(code,signal)=>{
      if(done)return;done=true;clearTimeout(timer);
      resolveResult({exitCode:signal?124:(code??127),output:sanitize(output)});
    });
  });
}
export async function verifyTasks(root:string,options:{allowExec?:boolean}={}):Promise<{passed:boolean;results:{taskId:string;command:string;exitCode:number}[]}>{
  if(!options.allowExec)throw new Error('Execution requires explicit --allow-exec approval; commands come from task contracts');
  const s=await getStatus(root);
  if(s.currentStage!=='verify')throw new Error('Must be in verify stage');
  const tasks=await loadContracts(root);
  const spec=await readTextOrEmpty(pathOf(root,'docs/01-requirements/spec.md'));
  const report=validateContracts(tasks,spec);if(!report.ok)throw new Error(report.errors.join('; '));
  const head=gitSha(root);
  const dirty=dirtyPaths(root);
  if(dirty.length)throw new Error('Verification requires a clean, committed working tree; commit all docs and task changes first: '+dirty.map(x=>x.slice(3)).join(', '));
  const tree=await worktreeHash(root);const changed=getCommitChangedPaths(root);
  for(const task of tasks){const forbidden=auditPaths(task,changed);if(forbidden.length)throw new Error(`${task.id}: changed files outside task scope: ${forbidden.join(', ')}`);}
  const results:{taskId:string;command:string;exitCode:number}[]=[];
  for(const task of tasks){
    for(const command of task.verification.commands){
      const startedAt=now();const result=await execute(root,command);const finishedAt=now();
      const id=randomUUID();const logPath=`.ai-engineering/evidence/${id}.log`;
      await writeAtomic(pathOf(root,logPath),result.output);
      const evidence:Evidence={id,taskId:task.id,command,commitSha:head,sourceTreeHash:sourceTreeHash(root),worktreeHash:tree,contractHash:sha256(JSON.stringify(task)),specHash:sha256(spec),exitCode:result.exitCode,outputHash:sha256(result.output),logPath,startedAt,finishedAt,signature:''};
      evidence.signature=await sign(root,evidence);
      await update(root,'verification_executed',async s=>{s.evidence.push(evidence);});
      results.push({taskId:task.id,command:command.join(' '),exitCode:result.exitCode});
    }
  }
  return {passed:results.every(x=>x.exitCode===0),results};
}
export async function submitReview(root:string,review:{reviewer_id:string;context_id:string;task_id:string;findings:{severity:string;status:string}[];source:string}):Promise<Review>{
  const tasks=await loadContracts(root);
  const task=tasks.find(t=>t.id===review.task_id);
  if(!task)throw new Error(`Unknown task ${review.task_id}`);
  if(review.reviewer_id===task.implementer.id || review.context_id===task.implementer.context_id || !review.reviewer_id || !review.context_id || !review.source)throw new Error('Independent reviewer and separate context are required');
  if(review.findings.some(x=>['critical','high'].includes(x.severity.toLowerCase())&&x.status!=='closed'))throw new Error('Unresolved high/critical review finding');
  if(!['new-session','external-agent','ci'].includes(review.source))throw new Error('Review must declare an independent external context');
  const s=await getStatus(root);if(s.currentStage!=='review')throw new Error('Review is only accepted in review stage');
  await checkVerification(root,s);
  const data:Review={taskId:task.id,reviewerId:review.reviewer_id,contextId:review.context_id,source:review.source,findings:review.findings,commitSha:gitSha(root),sourceTreeHash:sourceTreeHash(root),at:now()};
  await update(root,'review_submitted',async state=>{state.reviews=state.reviews.filter(x=>x.taskId!==data.taskId);state.reviews.push(data);});
  return data;
}
async function checkReviews(root:string,s:State):Promise<void>{
  await checkVerification(root,s);
  const tasks=await loadContracts(root);const codeHash=sourceTreeHash(root);
  for(const task of tasks){
    const review=s.reviews.find(r=>r.taskId===task.id&&isAncestor(root,r.commitSha)&&r.sourceTreeHash===codeHash&&r.reviewerId!==task.implementer.id&&r.contextId!==task.implementer.context_id&&!r.findings.some(f=>['critical','high'].includes(f.severity.toLowerCase())&&f.status!=='closed'));
    if(!review)throw new Error(`Independent review missing or stale for ${task.id}`);
  }
}
export async function canDeliver(root:string):Promise<{ok:boolean;reasons:string[]}>{
  const s=await getStatus(root);const reasons:string[]=[];
  if(s.currentStage!=='deliver')reasons.push('Not at deliver stage');
  try{await checkReviews(root,s);}catch(err){reasons.push((err as Error).message);}
  if(!(await readTextOrEmpty(pathOf(root,'docs/09-delivery/acceptance.md'))).trim())reasons.push('Missing acceptance.md');
  const cfg=await loadConfig(root);
  if(cfg.riskProfile==='regulated'&&!s.approvals.some(a=>a.stage==='deliver'))reasons.push('Regulated project requires explicit deliver approval');
  return {ok:!reasons.length,reasons};
}
export async function advance(root:string):Promise<State>{
  await getStatus(root); // Detect stale inputs before transition.
  return update(root,'stage_advanced',async s=>{
    const stage=s.currentStage;
    const unanswered=s.questions.filter(q=>q.phase===stage&&q.blocking&&!q.answer);
    if(unanswered.length)throw new Error(`Blocking decisions unresolved: ${unanswered.map(q=>q.id).join(', ')}`);
    if(stage==='requirements'){
      if(!(await readTextOrEmpty(pathOf(root,artifactPaths.requirements!))).trim())throw new Error('Missing or empty docs/01-requirements/analysis.md');
    }else if(stage==='spec'){
      const spec=await readTextOrEmpty(pathOf(root,artifactPaths.spec!));if(!spec)throw new Error('Missing spec.md');
      const result=validateSpec(spec);if(!result.ok)throw new Error(result.errors.join('; '));
    }else if(stage==='design'){
      if(!(await readTextOrEmpty(pathOf(root,artifactPaths.design!))).trim())throw new Error('Missing or empty design.md');
    }else if(stage==='plan'){
      const tasks=await loadContracts(root);const spec=await readTextOrEmpty(pathOf(root,artifactPaths.spec!));
      const result=validateContracts(tasks,spec);if(!result.ok)throw new Error(result.errors.join('; '));
    }else if(stage==='implement'){
      gitSha(root);
    }else if(stage==='verify'){
      await checkVerification(root,s);
    }else if(stage==='review'){
      await checkReviews(root,s);
    }else if(stage==='deliver'){
      // Avoid nested lock by performing exact checks here.
      await checkReviews(root,s);
      if(!(await readTextOrEmpty(pathOf(root,artifactPaths.deliver!))).trim())throw new Error('Missing acceptance.md');
      const cfg=await loadConfig(root);
      if(cfg.riskProfile==='regulated'&&!s.approvals.some(a=>a.stage==='deliver'))throw new Error('Regulated deliver approval is required');
    }else if(stage==='learn'){
      if(!(await readTextOrEmpty(pathOf(root,artifactPaths.learn!))).trim())throw new Error('Missing lessons.md');
    }
    if(['requirements','spec','design','plan','deliver','learn'].includes(stage))s.artifactHashes[stage]=await hashArtifact(root,stage);
    s.stageStatus[stage]='passed';
    const index=STAGES.indexOf(stage);if(index<STAGES.length-1){s.currentStage=STAGES[index+1]!;s.stageStatus[s.currentStage]='active';}
    return s;
  });
}
