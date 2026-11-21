import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { demoFetch } from '../platform/demoApi';

const root = join(__dirname, '..');

describe('static demo transport', () => {
  it('serves synthetic cluster data without a backend', async () => {
    const r = await demoFetch('/internal/es/index/cluster/indices');
    const body = await r.json();
    expect(body.map((x: any) => x.index)).toEqual(['research_report', 'bond_issuer']);
  });

  it('returns a real-shaped search response for the score explain page', async () => {
    const r = await demoFetch('/internal/es/index/cluster/search-raw?index=research_report', {
      method: 'POST',
      body: JSON.stringify({ size: 5, query: { match: { title: '研报' } }, explain: true }),
    });
    const body = await r.json();
    expect(body.hits.total.value).toBe(128);
    expect(body.hits.hits[0]._source.title).toContain('半导体');
    expect(body.hits.hits[0]._explanation.details.length).toBeGreaterThan(0);
  });

  it('keeps SQL columns and rows raw (arrays and booleans untouched)', async () => {
    const r = await demoFetch('/internal/es/index/cluster/sql/query', {
      method: 'POST',
      body: JSON.stringify({ query: 'SELECT * FROM research_report LIMIT 100' }),
    });
    const body = await r.json();
    expect(body.columns.map((c: any) => c.name)).toContain('title');
    expect(body.rows.length).toBe(5);
  });

  it('App.vue labels the demo and suppresses server login/setup gates', () => {
    const app = readFileSync(join(root, 'App.vue'), 'utf8');
    expect(app).toContain('演示模式 · 全部数据为合成数据，不连接真实 Elasticsearch');
    expect(app).toMatch(/<LoginOverlay v-if="!isBrowserMode && !isDemoMode" \/>/);
    expect(app).toMatch(/<SetupWizard v-if="!isBrowserMode && !isDemoMode" \/>/);
  });
});
