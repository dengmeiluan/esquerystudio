import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
async function mount(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

describe('SQL array fields keep raw values', () => {
  beforeEach(() => {
    apps.forEach(a => { try { a.unmount(); } catch { /* unmounted */ } });
    apps.length = 0;
    host.innerHTML = '';
    localStorage.clear();
  });

  it('数组值 JSON 展示；SQL 全列 semRawCols 阻止 long/boolean 被按值改成 410.0s/0%/100%', async () => {
    const cols = ['vel1CodeArray', 'international', 'isShowSentiment'];
    const fieldTypes = { vel1CodeArray: 'long', international: 'boolean', isShowSentiment: 'boolean' };
    await mount({ cols, rows: [[[410000, 270000], 0, 1]], fieldTypes, semOn: true, semRawCols: cols });
    const cells = [...host.querySelectorAll('tbody td.qrt-cell')] as HTMLElement[];
    expect(cells[0].textContent?.trim(), '数组必须保留 JSON 形态').toBe('[410000,270000]');
    expect(cells[1].textContent?.trim(), 'boolean/数值列不得被推断成百分比').toBe('0');
    expect(cells[2].textContent?.trim()).toBe('1');
    expect(cells.map(c => c.textContent).join('|')).not.toContain('410.0s');
    expect(cells.map(c => c.textContent).join('|')).not.toContain('%');
  });

  it('SqlConsoleView pass all result columns into semRawCols and defaults to strict SQL', () => {
    const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(src).toContain('const sqlSemRawCols = computed<string[]>(() => cols.value.map(c => c.name));');
    expect(src).toContain("const lenient = usePref('sql.lenient', false);");
  });
});
