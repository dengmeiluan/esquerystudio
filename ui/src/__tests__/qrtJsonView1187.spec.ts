/**
 * 1187：rows 型结果表自出 JSON 档（SQL / 日志通道与查询工作台能力对齐）。
 *
 * 现场：同一张结果表，在查询工作台有「表格 / JSON / Tree / 卡片」视图档，
 * 在 SQL 控制台只有表格——因为 JSON 档的数据源 `jsonHtml` 只能由宿主传
 * （DQ/IH 的 markHtmlAll 链），SQL 这类 cols×rows 通道没有文档可高亮，就整档消失。
 * 用户问的「为什么三个入口表格能力不一样」，这是一处真因。
 *
 * 修法：宿主没给 jsonHtml 时，QRT 自己按「行对象（键=可见列）」生成并高亮；
 * 仍然尊重宿主给的那份（DQ/IH 链路零变化）。
 *
 * 锁：① 有 cols/rows 就出 JSON 档、内容为行对象数组；
 *     ② 宿主显式传入时以宿主为准；
 *     ③ 空结果不出档（不留一个点开是空白的视图）；
 *     ④ SQL 控制台确实打开了视图档并落了档位记忆键。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mountQrt(props: Record<string, any>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(QueryResultTable as any, props) });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] });
  app.use(createPinia());
  app.use(router);
  await router.push('/');
  await router.isReady();
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}
const jsonBtn = () => [...host.querySelectorAll('.qrt-view-seg button')].find(b => (b.textContent || '').trim() === 'JSON') as HTMLButtonElement | undefined;
const pre = () => host.querySelector('pre.json-view') as HTMLElement | null;

afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1187 rows 型内核的 JSON 档', () => {
  it('有 cols/rows 就出 JSON 档，内容为行对象（键=列名；单文档档导航切行）', async () => {
    await mountQrt({ cols: ['title', 'status'], rows: [['甲', 'ACTIVE'], ['乙', 'CLOSED']], viewSeg: true });
    const btn = jsonBtn();
    expect(btn, 'JSON 档必须出现').toBeTruthy();
    btn!.click();
    for (let i = 0; i < 6; i++) await nextTick();
    const text = pre()?.textContent || '';
    expect(text).toContain('"title"');
    expect(text).toContain('"甲"');
    expect(text).toContain('"status"');
    expect(text).toContain('"ACTIVE"');
    expect(text).not.toContain('仅显示前');
    /* 大结果集性能护栏：JSON 档逐文档渲染，导航游标切到第 2 行才出现 CLOSED */
    const sel = host.querySelector('.ah-docnav-sel') as HTMLSelectElement;
    expect(sel, '文档导航条在场').toBeTruthy();
    sel.value = '1';
    sel.dispatchEvent(new Event('change'));
    for (let i = 0; i < 6; i++) await nextTick();
    const text2 = pre()?.textContent || '';
    expect(text2).toContain('"CLOSED"');
    expect(text2).not.toContain('"甲"');
  });

  it('宿主显式传入 jsonHtml 时以宿主为准（DQ/IH 链路零变化）', async () => {
    await mountQrt({
      cols: ['a'], rows: [['x']], viewSeg: true,
      jsonHtml: '<span class="j-key">HOST-SIDE</span>',
    });
    await new Promise(r => setTimeout(r, 20));
    jsonBtn()!.click();
    for (let i = 0; i < 6; i++) await nextTick();
    expect(pre()!.innerHTML).toContain('HOST-SIDE');
  });

  it('负控：空结果不出 JSON 档（点开一片空白的档位等于挖坑）', async () => {
    await mountQrt({ cols: ['a'], rows: [], viewSeg: true });
    expect(jsonBtn()).toBeFalsy();
  });

  it('SQL 控制台已接线：view-seg 打开 + 档位落下记忆键', () => {
    const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
    expect(src).toMatch(/view-seg/);
    expect(src).toContain('view-pref-key="esquerystudio.pref.sqlResultView"');
  });
});
