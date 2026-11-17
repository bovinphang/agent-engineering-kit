import { posix } from 'node:path';
const unique = (arr) => new Set(arr).size === arr.length;
const ids = (text, expr) => [...text.matchAll(expr)].map(x => x[0]);
export function validateSpec(markdown) {
    const errors = [];
    // FR ids can appear in references and ACs; only count heading declarations as requirements.
    const declared = [...markdown.matchAll(/^#{1,6}\s+(FR-\d{3})\b/gm)].map(x => x[1]);
    if (declared.length === 0)
        errors.push('Spec must declare at least one FR-001 heading');
    if (!unique(declared))
        errors.push('Duplicate FR declaration');
    for (const fr of declared) {
        const ac = [...markdown.matchAll(new RegExp(`^AC-${fr}-\\d{2}:\\s*\\S+`, 'gm'))];
        if (ac.length === 0)
            errors.push(`${fr} missing measurable AC-${fr}-NN`);
    }
    const acDeclarations = [...markdown.matchAll(/^(AC-FR-\d{3}-\d{2}):\s*(.+)$/gm)];
    if (acDeclarations.some(x => !x[2]?.trim()))
        errors.push('Empty AC description');
    const declaredAc = acDeclarations.map(x => x[1]);
    if (!unique(declaredAc))
        errors.push('Duplicate AC declaration');
    for (const ac of declaredAc) {
        const parent = ac.match(/^AC-(FR-\d{3})-/)?.[1];
        if (parent && !declared.includes(parent))
            errors.push(`${ac} references an undeclared FR`);
    }
    return { ok: errors.length === 0, errors };
}
export function validateContracts(tasks, specMarkdown) {
    const errors = [];
    if (!tasks.length)
        return { ok: false, errors: ['No task contract found'] };
    const idsList = tasks.map(x => x.id);
    if (!unique(idsList))
        errors.push('Duplicate task id');
    const spec = validateSpec(specMarkdown);
    errors.push(...spec.errors);
    const frs = [...specMarkdown.matchAll(/^#{1,6}\s+(FR-\d{3})\b/gm)].map(x => x[1]);
    const acs = [...specMarkdown.matchAll(/^(AC-FR-\d{3}-\d{2}):/gm)].map(x => x[1]);
    const map = new Map(tasks.map(x => [x.id, x]));
    for (const task of tasks) {
        if (!/^TASK-[A-Z0-9-]+$/i.test(task.id ?? ''))
            errors.push(`Invalid task id: ${task.id}`);
        if (task.schema_version !== '1.0')
            errors.push(`${task.id}: unsupported contract version`);
        if (!task.name?.trim())
            errors.push(`${task.id}: missing name`);
        if (!Array.isArray(task.requirements) || !task.requirements.length)
            errors.push(`${task.id}: missing requirement mapping`);
        for (const fr of (task.requirements ?? []))
            if (!frs.includes(fr))
                errors.push(`${task.id}: unknown ${fr}`);
        if (!Array.isArray(task.acceptance_criteria) || !task.acceptance_criteria.length)
            errors.push(`${task.id}: missing AC mapping`);
        for (const ac of (task.acceptance_criteria ?? []))
            if (!acs.includes(ac))
                errors.push(`${task.id}: unknown ${ac}`);
        for (const dep of (task.depends_on ?? []))
            if (!map.has(dep))
                errors.push(`${task.id}: unknown dependency ${dep}`);
        if (!Array.isArray(task.allowed_paths) || !task.allowed_paths.length)
            errors.push(`${task.id}: missing allowed_paths`);
        for (const pattern of task.allowed_paths ?? []) {
            if (!pattern || pattern.startsWith('/') || pattern.includes('\\') || pattern.split('/').includes('..'))
                errors.push(`${task.id}: unsafe path ${pattern}`);
        }
        const cmds = task.verification?.commands;
        if (!Array.isArray(cmds) || !cmds.length || cmds.some(x => !Array.isArray(x) || !x.length || x.some(y => typeof y !== 'string' || !y.trim())))
            errors.push(`${task.id}: missing executable verification commands`);
        if (!task.implementer?.id || !task.implementer?.context_id)
            errors.push(`${task.id}: missing implementer identity and context`);
    }
    for (const ac of acs)
        if (!tasks.some(t => (t.acceptance_criteria ?? []).includes(ac)))
            errors.push(`AC ${ac} not covered by any task`);
    for (const fr of frs)
        if (!tasks.some(t => (t.requirements ?? []).includes(fr)))
            errors.push(`FR ${fr} not covered by any task`);
    const seen = new Set(), active = new Set();
    const visit = (id) => { if (active.has(id)) {
        errors.push(`Task dependency cycle at ${id}`);
        return;
    } if (seen.has(id))
        return; active.add(id); for (const dep of map.get(id)?.depends_on ?? [])
        if (map.has(dep))
            visit(dep); active.delete(id); seen.add(id); };
    for (const id of idsList)
        visit(id);
    return { ok: errors.length === 0, errors };
}
function normalized(input) {
    const path = input.replaceAll('\\', '/');
    if (!path || path[0] === '/' || /^[a-z]:/i.test(path) || path.includes('\0'))
        return null;
    const pieces = path.split('/');
    if (pieces.includes('..') || pieces.includes('.'))
        return null; // Reject traversal before normalization.
    return posix.normalize(path);
}
function matches(pattern, path) {
    const p = normalized(pattern);
    if (!p)
        return false;
    const regex = '^' + p.split(/(\*\*|\*)/g).map(s => s === '**' ? '.*' : s === '*' ? '[^/]*' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$';
    return new RegExp(regex).test(path);
}
export function auditPaths(task, changed) {
    return changed.filter(path => {
        const n = normalized(path);
        if (!n)
            return true;
        return !(task.allowed_paths ?? []).some(p => matches(p, n)) || (task.forbidden_paths ?? []).some(p => matches(p, n));
    });
}
