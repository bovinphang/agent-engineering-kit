import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initProject, startRun, getStatus, resume, advance, addQuestion, recordAnswer, verifyTasks, submitReview, canDeliver, approve, loadContracts } from '../../core/src/engine.js';
import { validateContracts } from '../../core/src/validation.js';
import { installAgent, uninstallAgent, verifyAgentInstallation } from '../../adapters/src/install.js';
import { readTextOrEmpty } from '../../core/src/io.js';
import { detectHost, runAgentStage, runIndependentReview } from '../../agents/src/runtime.js';
import { driveWorkflow } from '../../agents/src/drive.js';
const help = `AI-Native Engineering Kit (aek) v0.2.0
Usage: aek <command> [arguments] [--project <path>]
  init [--kind greenfield|feature] [--risk standard|regulated] [--dry-run]
  install codex|claude|cursor [--dry-run]   Install skills & rules (existing files untouched)
  uninstall codex|claude|cursor [--dry-run]  Remove only unchanged installed files
  adapter-check codex|claude|cursor          Verify skill/rule assets; not host smoke test
  start "Natural-language requirement" [--mode greenfield|feature]
  status | resume                         Recover current stage and pending questions
  advance                                 Validate stage gate, advance on success
  question-add path/to/question.json       Add a blocking decision with 2-4 options
  questions                               List unanswered questions
  answer DEC-001 A                        Record explicit human choice
  verify --allow-exec                     Execute contract commands and store evidence
  contract-check                          Validate FR/AC/task traceability
  review path/to/review.json               Import attested independent-review result
  approve deliver --actor human            Authorize regulated acceptance gate
  release-ready                           Evaluate delivery readiness (does not deploy)
  agent-check codex|claude|cursor         Detect an actual installed Agent CLI (--version)
  agent-stage codex|claude|cursor --allow-agent-exec --allow-writes
                                          Execute the current stage in the real host CLI; no automatic gate bypass
  agent-review codex|claude|cursor --allow-agent-exec
                                          Run independent read-only review in a fresh Git worktree
  drive --agent codex --reviewer claude --allow-agent-exec --allow-writes --allow-tests [--auto-commit]
                                          Resume auto-workflow until decision, safety gate, failure or completion
  doctor                                  Show environment and workflow status

Read docs/09-delivery/quickstart.md for full instructions.
`;
const getOption = (args, name, defaultValue) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : defaultValue; };
const flags = (args) => args.filter((x, i) => !x.startsWith('--') && (i === 0 || !args[i - 1]?.startsWith('--')));
const out = (data) => console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
export async function main(args) {
    const command = args[0] ?? 'help';
    const root = resolve(getOption(args, '--project', process.cwd()));
    const positional = flags(args).slice(1);
    const dryRun = args.includes('--dry-run');
    switch (command) {
        case 'help':
        case '-h':
        case '--help':
            out(help);
            return;
        case 'init':
            out(await initProject(root, { dryRun, kind: getOption(args, '--kind'), risk: getOption(args, '--risk') }));
            return;
        case 'install':
            out(await installAgent(root, positional[0], { dryRun }));
            return;
        case 'uninstall':
            out(await uninstallAgent(root, positional[0], { dryRun }));
            return;
        case 'adapter-check':
            out(await verifyAgentInstallation(root, positional[0]));
            return;
        case 'start':
            out({ stage: (await startRun(root, positional.join(' '), getOption(args, '--mode'))).currentStage, next: 'Use ai-requirements skill; create analysis.md, answer blocking questions, then `aek advance`' });
            return;
        case 'status':
        case 'resume': {
            const s = command === 'resume' ? await resume(root) : await getStatus(root);
            out({ runId: s.id, goal: s.goal, currentStage: s.currentStage, stageStatus: s.stageStatus, unanswered: s.questions.filter(q => q.blocking && !q.answer).map(q => ({ id: q.id, question: q.question, options: q.options })), evidenceCount: s.evidence.length, reviewCount: s.reviews.length });
            return;
        }
        case 'advance':
            out({ currentStage: (await advance(root)).currentStage });
            return;
        case 'question-add': {
            const input = JSON.parse(await readFile(resolve(positional[0]), 'utf8'));
            out(await addQuestion(root, input));
            return;
        }
        case 'questions':
            out((await getStatus(root)).questions.filter(q => !q.answer));
            return;
        case 'answer':
            out(await recordAnswer(root, positional[0], positional[1], getOption(args, '--actor', 'human')));
            return;
        case 'verify':
            out(await verifyTasks(root, { allowExec: args.includes('--allow-exec') }));
            return;
        case 'review':
            out(await submitReview(root, JSON.parse(await readFile(resolve(positional[0]), 'utf8'))));
            return;
        case 'approve':
            await approve(root, positional[0], getOption(args, '--actor', 'human'));
            out('Approval recorded. This is an explicit user authorization, not an autonomous Agent action.');
            return;
        case 'release-ready':
            out(await canDeliver(root));
            return;
        case 'contract-check': {
            const tasks = await loadContracts(root);
            const spec = await readTextOrEmpty(resolve(root, 'docs/01-requirements/spec.md'));
            out(validateContracts(tasks, spec));
            return;
        }
        case 'agent-check':
            out(await detectHost(positional[0], { binary: getOption(args, '--binary') }));
            return;
        case 'agent-stage': {
            const result = await runAgentStage(root, positional[0], {
                allowExec: args.includes('--allow-agent-exec'), allowWrites: args.includes('--allow-writes'),
                binary: getOption(args, '--binary'), timeoutMs: Number(getOption(args, '--timeout-ms', '180000'))
            });
            out(result);
            if (result.exitCode !== 0)
                process.exitCode = 1;
            return;
        }
        case 'agent-review': {
            out(await runIndependentReview(root, positional[0], {
                allowExec: args.includes('--allow-agent-exec'), binary: getOption(args, '--binary'),
                timeoutMs: Number(getOption(args, '--timeout-ms', '180000'))
            }));
            return;
        }
        case 'drive': {
            const result = await driveWorkflow(root, getOption(args, '--agent', 'codex'), {
                reviewer: getOption(args, '--reviewer', 'claude'),
                allowExec: args.includes('--allow-agent-exec'), allowWrites: args.includes('--allow-writes'),
                allowTests: args.includes('--allow-tests'), autoCommit: args.includes('--auto-commit'),
                maxStages: Number(getOption(args, '--max-stages', '12')), maxFixAttempts: Number(getOption(args, '--max-fix-attempts', '2')), timeoutMs: Number(getOption(args, '--timeout-ms', '180000'))
            });
            out(result);
            if (result.status !== 'complete')
                process.exitCode = result.status === 'paused' ? 2 : 1;
            return;
        }
        case 'doctor': {
            let stage = 'not started';
            try {
                stage = (await getStatus(root)).currentStage;
            }
            catch { }
            out({ node: process.version, project: root, stage, skills: ['codex', 'claude', 'cursor'], execution: 'local Agent subprocess invocation supported, requires installed and authenticated CLI', hostSmoketest: 'not executed in build environment' });
            return;
        }
        default: throw new Error(`Unknown command: ${command}\n${help}`);
    }
}
