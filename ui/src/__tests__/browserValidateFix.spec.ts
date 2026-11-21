/* 浏览器模式校验 dry-run 的「一键移除」fix 提取看守。
 *
 * 服务端 parseEsError 对 unknown setting [index.xxx] 产出 {action:REMOVE_SETTING,
 * key}；浏览器端 dry-run catch 此前整条透出不解析——两端口径对齐：消息含
 * unknown setting [index.xxx] 时同样带 fix，键名剥 index. 前缀。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { browserFetch } from '../platform/browserApi';
import { __resetBrowserProfilesForTests, upsertProfile, setActiveProfile } from '../platform/browserProfiles';

beforeEach(() => {
  __resetBrowserProfilesForTests();
  /* 数据面档案：dry-run 临时索引的 PUT/DELETE 走 esDirect→profile()，须有激活档案 */
  const p = upsertProfile({ name: 'qa', url: 'http://es-qa:9200', username: '', password: '' });
  if (p) setActiveProfile((p as any).id);
  vi.stubGlobal('fetch', async (input: any, init?: any) => {
    /* 临时索引试建 PUT → ES 原生拒绝 unknown setting；DELETE 清理走 200 */
    if (String(input).includes('PUT') || (init?.method || 'GET') === 'PUT') {
      return new Response(JSON.stringify({
        error: {
          root_cause: [{ type: 'illegal_argument_exception', reason: 'unknown setting [index.replication.type]' }],
          type: 'illegal_argument_exception',
          reason: 'unknown setting [index.replication.type]',
        },
        status: 400,
      }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('浏览器模式 dry-run unknown setting → fix 提取', () => {
  it('消息含 unknown setting [index.xxx] → issue 带 REMOVE_SETTING fix（键剥前缀）', async () => {
    const resp = await browserFetch('/internal/es/index/config-lab/validate', {
      method: 'POST',
      body: JSON.stringify({
        settings: '{"index":{"replication.type":"segment","number_of_shards":"1"}}',
        mapping: '{"properties":{"t":{"type":"keyword"}}}',
        dryRun: true,
      }),
    });
    expect(resp.status).toBe(200);
    const data: any = await resp.json();
    expect(data.dryRunExecuted).toBe(true);
    expect(data.dryRunPassed).toBe(false);
    const hit = (data.issues || []).find((i: any) => String(i.message || '').includes('unknown setting'));
    expect(hit, '应产出 unknown setting 错误条').toBeTruthy();
    expect(hit.fix).toEqual({ action: 'REMOVE_SETTING', key: 'replication.type' });
  });

  it('非 unknown setting 错误 → 不带 fix（字段缺省，不冒充）', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      error: { type: 'mapper_parsing_exception', reason: 'Failed to parse mapping' },
      status: 400,
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    const resp = await browserFetch('/internal/es/index/config-lab/validate', {
      method: 'POST',
      body: JSON.stringify({
        settings: '{"index":{"number_of_shards":"1"}}',
        mapping: '{"properties":{"t":{"type":"keyword"}}}',
        dryRun: true,
      }),
    });
    const data: any = await resp.json();
    const dry = (data.issues || []).filter((i: any) => i.layer === 'DRYRUN');
    expect(dry.length).toBeGreaterThan(0);
    for (const i of dry) {
      expect(i.fix, '非 unknown setting 不得携带 fix').toBeUndefined();
    }
  });
});
