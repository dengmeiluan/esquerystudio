/**
 * 跨集群迁移的权限目标必须绑定“源连接”，不能沿用顶栏目标：
 * 页面门按 X-Es-Target 裁决 xmigrate 写键，源≠顶栏时授权用户会被 PAGE_DENIED。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const api = readFileSync(join(__dirname, '../api.ts'), 'utf-8');
const view = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

describe('973 xmigrate 请求目标=源连接', () => {
  it('API 层提供按源覆盖的 target init，并接到写/读端点', () => {
    expect(api).toContain('const xbTargetInit =');
    expect(api).toContain("start: (req: any, target?: string) => post('/start', req, XB, xbTargetInit(target))");
    expect(api).toContain("preflight: (req: any, target?: string) => post('/preflight', req, XB, xbTargetInit(target))");
    expect(api).toContain("abort: (jobId: string, target?: string) => post(`/abort?${q({ jobId })}`, undefined, XB, xbTargetInit(target))");
    expect(api).toContain('xbTargetInit(connId)');
  });
  it('视图发起/预检/作业列表/中止都显式传源连接', () => {
    expect(view).toContain('api.xb.start(req, srcConnId.value || undefined)');
    expect(view).toContain("api.xb.preflight({ sourceIndex: form.value.sourceIndex, destIndex: form.value.destIndex }, srcConnId.value || undefined)");
    expect(view).toContain('api.xb.jobs(30, srcConnId.value || undefined)');
    expect(view).toContain('api.xb.abort(jobId, job.srcConnId || undefined)');
  });
});
