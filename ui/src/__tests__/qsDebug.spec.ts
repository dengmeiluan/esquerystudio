import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { nodeParts } from '../utils/querySentence';
describe('debug', () => {
  it('file vs module', () => {
    // 从 spec 的 import.meta.url 推导 querySentence.ts 的实际加载路径
    const diskPath = join(__dirname, '..', 'utils', 'querySentence.ts');
    const disk = readFileSync(diskPath, 'utf-8');
    console.log('DISK_HAS_HUMAN:', disk.includes('human(v[k])'));
    const n: any = { id: 'x', type: 'leaf', op: 'range', field: 'f', value: { gte: 'now-30d/d' }, params: {}, raw: null };
    const parts = nodeParts(n);
    console.log('VAL:', JSON.stringify(parts.filter(p => p.kind === 'value').map(p => p.text)));
    expect(true).toBe(true);
  });
});
