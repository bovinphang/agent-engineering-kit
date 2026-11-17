import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
export const pathOf = (root, ...parts) => join(resolve(root), ...parts);
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
export async function writeAtomic(path, data) {
    await mkdir(dirname(path), { recursive: true });
    const tmp = path + '.tmp-' + randomUUID();
    try {
        await writeFile(tmp, data, { flag: 'wx', mode: 0o600 });
        await rename(tmp, path);
    }
    finally {
        await rm(tmp, { force: true });
    }
}
export async function withLock(root, work) {
    const lock = pathOf(root, '.ai-engineering/.lock');
    await mkdir(dirname(lock), { recursive: true });
    for (let i = 0; i < 50; i++) {
        try {
            const file = await open(lock, 'wx', 0o600);
            try {
                return await work();
            }
            finally {
                await file.close();
                await rm(lock, { force: true });
            }
        }
        catch (err) {
            if (err.code !== 'EEXIST')
                throw err;
            if (i === 49)
                throw new Error('Workflow is locked by another process; remove stale lock only after verifying it is not running');
            await sleep(40);
        }
    }
    throw new Error('Cannot acquire lock');
}
export async function exists(path) { try {
    await stat(path);
    return true;
}
catch {
    return false;
} }
export async function readTextOrEmpty(path) { try {
    return await readFile(path, 'utf8');
}
catch (err) {
    if (err.code === 'ENOENT')
        return '';
    throw err;
} }
export function assertWithin(root, relativePath) {
    const base = resolve(root);
    const full = resolve(base, relativePath);
    if (full === base || relative(base, full).startsWith('..' + sep) || relative(base, full) === '..' || relative(base, full).startsWith(sep))
        throw new Error(`Unsafe target path: ${relativePath}`);
    return full;
}
export async function listJsonFiles(dir) { try {
    return (await readdir(dir)).filter(n => n.endsWith('.json')).sort().map(n => join(dir, n));
}
catch (err) {
    if (err.code === 'ENOENT')
        return [];
    throw err;
} }
export const now = () => new Date().toISOString();
