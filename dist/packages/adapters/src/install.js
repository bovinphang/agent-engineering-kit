import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, sha256 } from '../../core/src/io.js';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const skillRoot = (agent) => agent === 'claude' ? '.claude/skills' : agent === 'cursor' ? '.cursor/skills' : '.agents/skills';
const RULES = {
    codex: { path: 'AGENTS.md', content: '# AI-Native Engineering\n\nUse the ai-start skill for new software tasks and the ai-resume skill for ongoing runs. Before editing, inspect .ai-engineering/state.json and the task contract. Never assert a gate passed without `aek verify --allow-exec` and `aek advance`. For independent review use a fresh Agent context. Production changes require explicit approval.\n' },
    claude: { path: 'CLAUDE.md', content: '# AI-Native Engineering\n\nUse /ai-start for new software tasks or /ai-resume to continue. Follow stage prompts stored under .ai-engineering/prompts/. Run the aek CLI for deterministic checks. Never self-approve independent review. Never deploy production without human authorization.\n' },
    cursor: { path: '.cursor/rules/ai-engineering.mdc', content: '---\ndescription: Use the AI-Native Engineering workflow for all structured software development changes\nalwaysApply: true\n---\n\nFor development tasks invoke ai-start or ai-resume from .cursor/skills. Follow .ai-engineering/prompts and stage gates via aek CLI. Review must be separate context; deployment requires approval.\n' }
};
async function walk(dir) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory())
            result.push(...await walk(path));
        else if (entry.isFile())
            result.push(path);
    }
    return result;
}
async function safeInstall(root, files, dryRun) {
    const actions = [], conflicts = [], skipped = [];
    for (const file of files) {
        const destination = resolve(root, file.target);
        if (destination === resolve(root) || !destination.startsWith(resolve(root) + sep))
            throw new Error('Destination escapes project');
        // Reject symlink in any existing ancestor, not only at the target.
        for (let d = destination; d.startsWith(resolve(root) + sep); d = dirname(d)) {
            try {
                if ((await lstat(d)).isSymbolicLink())
                    throw new Error(`Refusing symlink target: ${file.target}`);
            }
            catch (err) {
                if (err.code !== 'ENOENT')
                    throw err;
            }
        }
        if (await exists(destination)) {
            const existing = await readFile(destination, 'utf8');
            if (existing === file.content)
                skipped.push(file.target);
            else
                conflicts.push(file.target);
            continue;
        }
        actions.push(file.target);
        if (!dryRun) {
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, file.content, { flag: 'wx' });
        }
    }
    return { actions, conflicts, skipped };
}
export async function installAgent(root, agent, options = {}) {
    if (!['codex', 'claude', 'cursor'].includes(agent))
        throw new Error(`Unsupported agent: ${agent}`);
    if (!await exists(join(resolve(root), '.ai-engineering/config.json')))
        throw new Error('Run `aek init` before install');
    const files = [];
    const skills = await walk(join(packageRoot, 'skills'));
    for (const file of skills) {
        const path = relative(join(packageRoot, 'skills'), file).split(sep).join('/');
        files.push({ target: `${skillRoot(agent)}/${path}`, content: await readFile(file, 'utf8') });
    }
    const prompts = await walk(join(packageRoot, 'prompts'));
    for (const file of prompts) {
        const path = relative(join(packageRoot, 'prompts'), file).split(sep).join('/');
        files.push({ target: `.ai-engineering/prompts/${path}`, content: await readFile(file, 'utf8') });
    }
    for (const component of ['templates', 'schemas']) {
        const assets = await walk(join(packageRoot, component));
        for (const file of assets) {
            const path = relative(join(packageRoot, component), file).split(sep).join('/');
            files.push({ target: `.ai-engineering/${component}/${path}`, content: await readFile(file, 'utf8') });
        }
    }
    files.push({ target: RULES[agent].path, content: RULES[agent].content });
    const result = await safeInstall(root, files, !!options.dryRun);
    if (!options.dryRun && result.actions.length) {
        const folder = join(root, '.ai-engineering/install-manifests');
        await mkdir(folder, { recursive: true });
        const manifest = join(folder, `${agent}.json`);
        const prior = await exists(manifest) ? JSON.parse(await readFile(manifest, 'utf8')) : { files: [] };
        const byPath = new Map(prior.files.map(item => [item.path, item]));
        for (const file of files) {
            if (result.actions.includes(file.target) && !file.target.startsWith('.ai-engineering/'))
                byPath.set(file.target, { path: file.target, sha256: sha256(file.content) });
        }
        await writeFile(manifest, JSON.stringify({ files: [...byPath.values()] }, null, 2) + '\n');
    }
    return result;
}
export async function verifyAgentInstallation(root, agent) {
    if (!['codex', 'claude', 'cursor'].includes(agent))
        throw new Error(`Unsupported agent: ${agent}`);
    const missing = [], modified = [];
    let skillsFound = 0;
    const expected = await walk(join(packageRoot, 'skills'));
    for (const file of expected) {
        const dest = join(root, skillRoot(agent), relative(join(packageRoot, 'skills'), file));
        const relativeDest = relative(root, dest).split(sep).join('/');
        if (!await exists(dest)) {
            missing.push(relativeDest);
            continue;
        }
        if ((await readFile(dest, 'utf8')) !== (await readFile(file, 'utf8')))
            modified.push(relativeDest);
        else
            skillsFound++;
    }
    const rule = join(root, RULES[agent].path);
    if (!await exists(rule))
        missing.push(RULES[agent].path);
    return { ok: !missing.length && !modified.length, missing, modified, skillsFound };
}
export async function uninstallAgent(root, agent, options = {}) {
    if (!['codex', 'claude', 'cursor'].includes(agent))
        throw new Error('Unsupported agent');
    const manifest = join(root, '.ai-engineering/install-manifests', `${agent}.json`);
    const actions = [], conflicts = [], skipped = [];
    if (!await exists(manifest))
        return { actions, conflicts, skipped: ['No tracked installed files'] };
    const owned = JSON.parse(await readFile(manifest, 'utf8'));
    for (const item of owned.files) {
        const dest = resolve(root, item.path);
        if (!dest.startsWith(resolve(root) + sep))
            throw new Error('Unsafe manifest path');
        if (!await exists(dest)) {
            skipped.push(item.path);
            continue;
        }
        // Never delete user modifications; ownership by our manifest is not permission to override content.
        if (sha256(await readFile(dest)) !== item.sha256) {
            conflicts.push(item.path);
            continue;
        }
        actions.push(item.path);
        if (!options.dryRun) {
            const { unlink } = await import('node:fs/promises');
            await unlink(dest);
        }
    }
    if (!options.dryRun) {
        // A future uninstall can still inspect skipped/edited files; protect them from removal.
        const remaining = owned.files.filter(x => conflicts.includes(x.path));
        if (remaining.length)
            await writeFile(manifest, JSON.stringify({ files: remaining }, null, 2));
        else {
            const { rm } = await import('node:fs/promises');
            await rm(manifest, { force: true });
        }
    }
    return { actions, conflicts, skipped };
}
