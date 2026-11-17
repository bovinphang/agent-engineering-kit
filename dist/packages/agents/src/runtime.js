import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { STAGES, addQuestion, getStatus, loadContracts, submitReview } from '../../core/src/engine.js';
import { exists, now, pathOf, readTextOrEmpty, sha256, writeAtomic } from '../../core/src/io.js';
const rootOfPackage = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const binaries = { codex: 'codex', claude: 'claude', cursor: 'cursor-agent' };
const stageFiles = Object.fromEntries(STAGES.map((s, i) => [s, `${String(i + 1).padStart(2, '0')}-${s === 'implement' ? 'build' : s === 'deliver' ? 'ship' : s}.md`]));
const stageArtifacts = { requirements: 'docs/01-requirements/analysis.md', spec: 'docs/01-requirements/spec.md', design: 'docs/03-architecture/design.md', deliver: 'docs/09-delivery/acceptance.md', learn: 'docs/10-feedback/lessons.md' };
/** Shell-free, provider-specific invocation. A stage runner may write only after explicit approval. */
export function agentInvocation(agent, prompt, writes) {
    if (!Object.hasOwn(binaries, agent))
        throw new Error(`Unsupported CLI agent: ${agent}`);
    if (agent === 'codex')
        return { binary: binaries[agent], args: ['exec', '--json', '--sandbox', writes ? 'workspace-write' : 'read-only', '--ephemeral', prompt] };
    if (agent === 'claude')
        return { binary: binaries[agent], args: ['-p', '--output-format', 'json', '--permission-mode', writes ? 'acceptEdits' : 'plan',
                ...(writes ? ['--disallowedTools', 'Bash'] : []), prompt] };
    return { binary: binaries[agent], args: ['-p', ...(writes ? ['--force'] : []), '--output-format', 'json', prompt] };
}
function redact(input) {
    return input.replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
        .replace(/(Authorization:\s*Bearer\s+)\S+/gi, '$1[REDACTED]');
}
async function safeLog(root, rel, data) {
    const out = pathOf(root, rel);
    for (let d = dirname(out); d.startsWith(resolve(root)); d = dirname(d)) {
        try {
            if ((await lstat(d)).isSymbolicLink())
                throw Error(`Refusing symlinked log directory: ${d}`);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        if (d === resolve(root))
            break;
    }
    await mkdir(dirname(out), { recursive: true });
    // Defense in depth for projects initialized by older AEK versions without agent-runs/ in their ignore rules.
    const ignore = pathOf(root, '.ai-engineering/agent-runs/.gitignore');
    if (!await exists(ignore))
        await writeAtomic(ignore, '*\n!.gitignore\n');
    await writeAtomic(out, JSON.stringify(data, null, 2) + '\n');
}
async function runProcess(inv, cwd, options) {
    const timeout = options.timeoutMs ?? 180000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 1200000)
        throw new Error('timeoutMs must be 100..1200000');
    // Prevent a model in the project from silently receiving unrelated app credentials.
    const envKeys = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TMP', 'TEMP', 'TMPDIR', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'HOMEDRIVE', 'HOMEPATH', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'CI'];
    const env = {};
    for (const k of envKeys)
        if (process.env[k])
            env[k] = process.env[k];
    const key = inv.binary === 'codex' ? 'CODEX_API_KEY' : inv.binary === 'claude' ? 'ANTHROPIC_API_KEY' : inv.binary === 'cursor-agent' ? 'CURSOR_API_KEY' : undefined;
    if (key && process.env[key])
        env[key] = process.env[key];
    Object.assign(env, options.env ?? {});
    env.AEK_AGENT_SESSION = '1';
    return new Promise(resolveResult => {
        let stdout = '', stderr = '', truncated = false, timedOut = false, closed = false;
        const child = spawn(options.binary ?? inv.binary, [...(options.binaryArgs ?? []), ...inv.args], { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const store = (value, kind) => {
            const previous = kind === 'stdout' ? stdout : stderr;
            const chunk = value.toString('utf8');
            if (previous.length + chunk.length > 262144)
                truncated = true;
            const next = (previous + chunk).slice(0, 262144);
            if (kind === 'stdout')
                stdout = next;
            else
                stderr = next;
        };
        child.stdout?.on('data', (d) => store(d, 'stdout'));
        child.stderr?.on('data', (d) => store(d, 'stderr'));
        child.on('error', error => store(Buffer.from(`SPAWN ERROR: ${error.message}`), 'stderr'));
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
        child.on('close', (code, signal) => {
            if (closed)
                return;
            closed = true;
            clearTimeout(timer);
            resolveResult({ exitCode: timedOut ? 124 : signal ? 128 : (code ?? 127), stdout: redact(stdout), stderr: redact(stderr), timedOut, truncated });
        });
    });
}
function parseFinal(agent, stdout) {
    let parsed;
    if (agent === 'codex') {
        // Codex emits JSONL events. Turn failures and missing final messages are not passes.
        let failed = false;
        let message = '';
        let completed = false;
        for (const line of stdout.split('\n').filter(Boolean)) {
            let ev;
            try {
                ev = JSON.parse(line);
            }
            catch {
                continue;
            }
            if (ev.type === 'turn.failed' || ev.type === 'error')
                failed = true;
            if (ev.type === 'turn.completed')
                completed = true;
            if (ev.type === 'item.completed') {
                const item = ev.item;
                if (item?.type === 'agent_message' && typeof item.text === 'string')
                    message = item.text;
            }
        }
        if (failed || !completed || !message.trim())
            throw new Error('Codex returned an incomplete or failed execution stream');
        return message;
    }
    try {
        parsed = JSON.parse(stdout.trim());
    }
    catch {
        throw new Error(`${agent} did not emit a valid JSON result`);
    }
    if (!parsed || typeof parsed !== 'object')
        throw new Error(`${agent} returned invalid result`);
    const obj = parsed;
    if (obj.is_error === true || obj.subtype === 'error' || obj.type === 'error')
        throw new Error(`${agent} reported a provider error`);
    if (typeof obj.result !== 'string')
        throw new Error(`${agent} response missing result string`);
    return obj.result;
}
async function promptForStage(root, stage, goal) {
    const promptPath = pathOf(root, '.ai-engineering/prompts/stages', stageFiles[stage]);
    const prompt = await readTextOrEmpty(promptPath) || await readTextOrEmpty(join(rootOfPackage, 'prompts/stages', stageFiles[stage]));
    if (!prompt.trim())
        throw new Error(`Missing stage Prompt ${stageFiles[stage]}; install platform assets first`);
    const system = await readTextOrEmpty(pathOf(root, '.ai-engineering/prompts/core/system.md')) || await readTextOrEmpty(join(rootOfPackage, 'prompts/core/system.md'));
    const status = await getStatus(root);
    const answered = status.questions.filter(x => x.answer).map(q => `${q.id}=${q.answer}: ${q.options.find(o => o.id === q.answer)?.label}`);
    const pending = status.questions.filter(x => x.blocking && !x.answer).map(q => q.id);
    if (pending.length)
        throw new Error(`Blocking decisions unresolved: ${pending.join(', ')}`);
    return `${system}\n\n${prompt}\n\n## Current AEK run\nGoal: ${goal}\nStage: ${stage}\nApproved decisions: ${answered.join('; ') || '(none)'}\nProject root is the current working directory. Read existing project docs and source before making changes. Do not edit .ai-engineering/state.json or bypass the stages. Do not call aek advance; the supervisor will validate and advance independently. Do not deploy, publish, send external messages, or perform irreversible actions.\nIf a key business rule remains uncertain, do not assume it: return JSON final answer in the form {"summary":"...","questions":[{"id":"DEC-001","question":"...","blocking":true,"options":[{"id":"A","label":"...","reason":"..."},{"id":"B","label":"...","reason":"..."}]}]}; questions may be empty. The supervisor records these and pauses for a human decision.\n`;
}
export async function detectHost(agent, options = {}) {
    const binary = options.binary ?? binaries[agent];
    const r = await runProcess({ binary, args: ['--version'] }, process.cwd(), { binary, timeoutMs: 6000 });
    return { agent, available: r.exitCode === 0, version: (r.stdout || r.stderr).trim().slice(0, 160), binary };
}
export async function runAgentStage(root, agent, options = {}) {
    if (!options.allowExec)
        throw new Error('Explicit --allow-agent-exec authorization required');
    const s = await getStatus(root);
    const stage = s.currentStage;
    if (s.stageStatus[stage] === 'passed')
        throw new Error('Run is already complete');
    const rel = stageArtifacts[stage];
    const before = rel ? sha256(await readTextOrEmpty(pathOf(root, rel))) : '';
    const prompt = (await promptForStage(root, stage, s.goal)) + (options.extraInstructions ? `\n\n## Supervised repair instructions\n${options.extraInstructions}\n` : '');
    const inv = agentInvocation(agent, prompt, !!options.allowWrites);
    const startedAt = now(), r = await runProcess(inv, resolve(root), options);
    const logPath = `.ai-engineering/agent-runs/${randomUUID()}.json`;
    let summary = '';
    let finalMessage = '';
    let protocolOk = false;
    if (r.exitCode === 0 && !r.truncated) {
        try {
            finalMessage = parseFinal(agent, r.stdout);
            summary = finalMessage.slice(0, 4000);
            protocolOk = true;
        }
        catch (e) {
            summary = e.message;
        }
    }
    else
        summary = r.stderr.slice(-2000) || 'Agent process failed or transcript truncated';
    let finalExitCode = r.exitCode === 0 && !protocolOk ? 65 : r.exitCode;
    const pendingDecisions = [];
    if (protocolOk) {
        let response;
        try {
            response = JSON.parse(finalMessage.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
        }
        catch { /* Older host prompts may produce non-JSON summaries; no decisions to import. */ }
        if (response && Object.hasOwn(response, 'questions')) {
            try {
                if (!Array.isArray(response.questions))
                    throw Error('AI decisions must be an array');
                for (const question of response.questions) {
                    if (!question || typeof question !== 'object')
                        throw Error('Invalid AI question');
                    const q = question;
                    const options = q.options;
                    const input = { id: q.id, phase: stage, question: q.question, blocking: q.blocking !== false, options };
                    await addQuestion(root, input);
                    pendingDecisions.push(input.id);
                }
            }
            catch (e) {
                finalExitCode = 65;
                summary = `AI decision protocol invalid: ${e.message}`;
            }
        }
    }
    const after = rel ? sha256(await readTextOrEmpty(pathOf(root, rel))) : undefined;
    const artifactProduced = !!rel && after !== before && !!(await readTextOrEmpty(pathOf(root, rel))).trim();
    await safeLog(root, logPath, { agent, stage, startedAt, finishedAt: now(), status: finalExitCode === 0 ? 'completed' : 'failed', exitCode: finalExitCode, artifactProduced, transcript: r.stdout, stderr: r.stderr, summary, timedOut: r.timedOut, truncated: r.truncated, invocation: inv.args.slice(0, -1) });
    return { agent, stage, exitCode: finalExitCode, artifactProduced, logPath, summary, pendingDecisions };
}
function parseReview(text, expectedTask) {
    let report;
    try {
        report = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    }
    catch {
        throw new Error('Reviewer final message must be a JSON object');
    }
    if (!report || typeof report !== 'object')
        throw new Error('Invalid review JSON');
    const r = report;
    if (r.task_id !== expectedTask || !['pass', 'fail'].includes(r.verdict) || !Array.isArray(r.findings) || typeof r.summary !== 'string' || !r.summary.trim())
        throw new Error('Invalid review JSON schema or mismatched task ID');
    for (const f of r.findings) {
        if (!f || !['critical', 'high', 'medium', 'low'].includes(f.severity?.toLowerCase()) || !['open', 'closed'].includes(f.status))
            throw new Error('Invalid review finding');
    }
    if (r.verdict !== 'pass' || r.findings.some(f => ['critical', 'high'].includes(f.severity.toLowerCase()) && f.status !== 'closed'))
        throw new Error('Independent review failed: unresolved issues or non-pass verdict');
    return r;
}
function git(root, args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
async function freshReviewWorkspace(root) {
    const dir = await mkdtemp(join(tmpdir(), 'aek-review-'));
    try {
        git(root, ['worktree', 'add', '--detach', dir, 'HEAD']);
    }
    catch (error) {
        await rm(dir, { recursive: true, force: true });
        throw error;
    }
    return { dir, cleanup: async () => {
            try {
                git(root, ['worktree', 'remove', '--force', dir]);
            }
            finally {
                await rm(dir, { recursive: true, force: true });
            }
        } };
}
export async function runIndependentReview(root, agent, options = {}) {
    if (!options.allowExec)
        throw new Error('Explicit --allow-agent-exec authorization required for external review');
    const state = await getStatus(root);
    if (state.currentStage !== 'review')
        throw new Error(`Review can run only in review stage; current: ${state.currentStage}`);
    if (git(root, ['status', '--porcelain', '-uall']).trim())
        throw new Error('Reviewer requires a committed, clean source tree');
    const contracts = await loadContracts(root);
    if (!contracts.length)
        throw new Error('No task contracts to review');
    const worktree = await freshReviewWorkspace(root);
    const contextId = randomUUID(), sessionId = randomUUID();
    const reviewerId = `${agent}-reviewer-${sessionId}`;
    const transcriptPath = `.ai-engineering/agent-runs/review-${sessionId}.json`;
    const sessions = [];
    try {
        for (const task of contracts) {
            const diff = git(root, ['show', '--format=', '--no-ext-diff', 'HEAD']).slice(0, 64000);
            const spec = (await readTextOrEmpty(pathOf(root, 'docs/01-requirements/spec.md'))).slice(0, 30000);
            const evidence = state.evidence.filter(e => e.taskId === task.id).map(e => ({ command: e.command, exitCode: e.exitCode, commitSha: e.commitSha, logPath: e.logPath }));
            const brief = `You are an independent read-only reviewer in a fresh isolated Git worktree, not the implementer.\n` +
                `Inspect the actual source files and commit diff, not author claims. Task: ${task.id}\nContract: ${JSON.stringify(task)}\n` +
                `Spec:\n${spec}\nSigned verification evidence summary: ${JSON.stringify(evidence)}\nLatest commit diff (truncated at 64 KB):\n${diff}\n` +
                `Review business logic, boundaries, security, privacy, regressions and tests. Do not modify any file.\n` +
                `Return ONLY a JSON object (no prose/markdown) with: ` +
                `{"task_id":"${task.id}","verdict":"pass" or "fail","summary":"specific checks performed",` +
                `"findings":[{"severity":"critical|high|medium|low","status":"open|closed","file":"path","message":"finding"}]}. ` +
                `Use verdict fail for unresolved high/critical findings, missing evidence, or review uncertainty.`;
            const inv = agentInvocation(agent, brief, false);
            const startedAt = now(), r = await runProcess(inv, worktree.dir, options);
            let review;
            let error = '';
            try {
                if (r.exitCode !== 0 || r.truncated || r.timedOut)
                    throw new Error(`Reviewer process failed: exit=${r.exitCode}`);
                if (git(worktree.dir, ['status', '--porcelain', '-uall']).trim())
                    throw new Error('Independent reviewer modified its read-only worktree; review rejected');
                review = parseReview(parseFinal(agent, r.stdout), task.id);
            }
            catch (e) {
                error = e.message;
            }
            sessions.push({ taskId: task.id, startedAt, finishedAt: now(), exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, error });
            if (!review) {
                await safeLog(root, transcriptPath, { status: 'failed', agent, reviewerId, contextId, sessions });
                throw new Error(error);
            }
            // A passing model answer is never enough without the prior signed test evidence.
            await submitReview(root, { reviewer_id: reviewerId, context_id: contextId, task_id: task.id, findings: review.findings, source: 'external-agent' });
        }
        await safeLog(root, transcriptPath, { status: 'completed', agent, reviewerId, contextId, gitSha: git(root, ['rev-parse', 'HEAD']), sessions });
        return { passed: true, tasks: contracts.map(t => t.id), transcriptPath, agent };
    }
    finally {
        await worktree.cleanup();
    }
}
