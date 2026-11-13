import { beforeEach, describe, expect, it } from 'vitest';
import { dbClear } from '../platform/browserStore';
import { drift, driftKeys, resetBaseline } from '../platform/browserDrift';

let settings = { 'index.number_of_shards': '1', 'index.refresh_interval': '1s' };
let mapping: any = { properties: { id: { type: 'keyword' } } };

const host: any = async (path: string) => {
  if (path.startsWith('/_cat/indices')) return [{ index: 'orders' }, { index: '.security' }];
  if (path.endsWith('/_mapping')) return { orders: { mappings: mapping } };
  if (path.includes('/_settings')) return { orders: { settings } };
  return {};
};

describe('browser config drift baseline', () => {
  beforeEach(async () => { await dbClear('meta'); settings = { 'index.number_of_shards': '1', 'index.refresh_interval': '1s' }; mapping = { properties: { id: { type: 'keyword' } } }; });

  it('首次检测采集本机基线，之后只报告真实变化', async () => {
    const keys = await driftKeys(host);
    expect(keys.map(k => k.indexKey)).toEqual(['orders']);
    const first = await drift(host, 'orders');
    expect(first).toMatchObject({ liveExists: true, baselineCreated: true });
    expect(first.settingsDiff.clean).toBe(true);
    expect(first.mappingEqual).toBe(true);

    settings = { ...settings, 'index.refresh_interval': '5s' };
    mapping = { properties: { id: { type: 'keyword' }, amount: { type: 'double' } } };
    const next = await drift(host, 'orders');
    expect(next.baselineCreated).toBe(false);
    expect(next.settingsDiff.different).toEqual([{ key: 'refresh_interval', code: '1s', live: '5s' }]);
    expect(next.mappingEqual).toBe(false);
  });

  it('重采基线后恢复 clean', async () => {
    await drift(host, 'orders');
    settings = { ...settings, 'index.refresh_interval': '5s' };
    expect((await drift(host, 'orders')).settingsDiff.clean).toBe(false);
    await resetBaseline('orders');
    const again = await drift(host, 'orders');
    expect(again.settingsDiff.clean).toBe(true);
    expect(again.baselineCreated).toBe(true);
  });
});
