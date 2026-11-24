/* W3：别名共享缓存——聚合行式 / 同 key 幂等 / 换 key 重拉 / 失败兜底 / 反查。
   模块级缓存跨用例存活：每个用例用不同 key 天然隔离，互不影响。 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({ api: { aliases: vi.fn() } }));

import { api } from '../api';
import { ensureAliases, aliasEntries, aliasesOf } from '../composables/useAliases';

const mockAliases = vi.mocked(api.aliases);

beforeEach(() => { mockAliases.mockReset(); });

describe('useAliases', () => {
  it('聚合同名别名的多行指向，过滤 . 开头系统别名', async () => {
    mockAliases.mockResolvedValue([
      { alias: 'logs', index: 'logs-2026.08.01' },
      { alias: 'logs', index: 'logs-2026.08.02' },
      { alias: '.system', index: '.ds-x' },
    ]);
    await ensureAliases('c-a');
    expect(aliasEntries('c-a')).toEqual([{ name: 'logs', to: ['logs-2026.08.01', 'logs-2026.08.02'] }]);
  });

  it('同 key 重复 ensure 不重拉（幂等）', async () => {
    mockAliases.mockResolvedValue([{ alias: 'a1', index: 'i1' }]);
    await ensureAliases('c-b');
    await ensureAliases('c-b');
    expect(mockAliases).toHaveBeenCalledTimes(1);
  });

  it('换 key 触发重拉（集群切换失效语义）', async () => {
    mockAliases.mockResolvedValue([{ alias: 'a2', index: 'i2' }]);
    await ensureAliases('c-c');
    await ensureAliases('c-c2');
    expect(mockAliases).toHaveBeenCalledTimes(2);
  });

  it('拉取失败兜底为空清单且不抛错（别名拿不到不阻塞索引补全）', async () => {
    mockAliases.mockRejectedValue(new Error('boom'));
    await ensureAliases('c-d');
    expect(aliasEntries('c-d')).toEqual([]);
  });

  it('aliasesOf 反查索引的别名；key 不匹配返回空（防串集群）', async () => {
    mockAliases.mockResolvedValue([
      { alias: 'logs', index: 'logs-1' },
      { alias: 'logs-ro', index: 'logs-1' },
      { alias: 'other', index: 'other-1' },
    ]);
    await ensureAliases('c-e');
    expect(aliasesOf('logs-1', 'c-e')).toEqual(['logs', 'logs-ro']);
    expect(aliasesOf('logs-1', 'someone-else')).toEqual([]);
  });

  it('持续失败不形成重试风暴（防回归：只发起一次请求，重试交还外部触发）', async () => {
    mockAliases.mockRejectedValue(new Error('down'));
    await ensureAliases('c-storm');
    await new Promise(r => setTimeout(r, 50));
    expect(mockAliases).toHaveBeenCalledTimes(1);
  });
});
