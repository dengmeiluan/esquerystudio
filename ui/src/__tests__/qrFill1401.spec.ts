/**
 * 一千四百零一批：结果表「填满档」（用户实报：默认可视表格特别窄，下面还有那么多空间）。
 *
 * 实测（1440×1000，Lucene）：结果面板 790px 高，QRT 表卡只有 235px——`.fs` 在面板里是
 * `flex: 0 1 auto` 内容高，`max-height:100%` 只封顶不撑高，行少时整张表塌在顶部。
 * 修复：QRT 新增 opt-in `fill`，三档高度链（FS 根 → .qrt → .qrt-wrap）逐级吸收余高，
 * 工具行/状态栏/分页行保持自然高。缺省 false，其他宿主零增量。
 *
 * 本 spec 锁：
 *  ① fill 为可选 prop + 缺省 false（零增量契约）；
 *  ② 三档 CSS 存在（FS 根吃余高 / .qrt 纵向 flex / wrap 唯一伸缩区）；
 *  ③ 挂载级：fill=true 时 `.qrt` 带 qrt-fill、FS 根带 qrt-fs-fill；缺省两者皆无；
 *  ④ Lucene 宿主开启 fill；负控：删掉 fill → 红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const LUCENE = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const host = document.createElement('div');
document.body.appendChild(host);
let apps: ReturnType<typeof createApp>[] = [];

function mountQrt(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  const el = document.createElement('div');
  host.appendChild(el);
  app.mount(el);
  apps.push(app);
}

beforeEach(() => { localStorage.clear(); host.innerHTML = ''; });
afterEach(() => { apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } }); apps = []; });

describe('1401 QRT 填满档', () => {
  it('① 可选 prop + 缺省 false', () => {
    expect(QRT).toMatch(/fill\?: boolean;/);
    expect(QRT).toMatch(/fill: false,/);
  });

  it('② 三档高度链 CSS 齐备', () => {
    expect(QRT).toMatch(/\.fs\.qrt-fs-fill \{ flex: 1 1 auto; min-height: 0; \}/);
    expect(QRT).toMatch(/\.qrt\.qrt-fill \{ display: flex; flex-direction: column; min-height: 0; \}/);
    expect(QRT).toMatch(/\.qrt\.qrt-fill > \.qrt-wrap-shell \{ flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; \}/);
    expect(QRT).toMatch(/\.qrt\.qrt-fill > \.qrt-wrap-shell > \.qrt-wrap \{ flex: 1 1 auto; min-height: 0; \}/);
  });

  it('③ 挂载级：fill 开则两处类名在场，关则皆无', async () => {
    mountQrt({ hits: [{ _id: 'a', _score: 1, _source: { t: 1 } }], total: 1, fill: true });
    await tick();
    expect(host.querySelector('.qrt.qrt-fill'), 'fill=true 根类').toBeTruthy();
    expect(host.querySelector('.fs.qrt-fs-fill'), 'fill=true FS 根类').toBeTruthy();
    apps.forEach(a => a.unmount()); apps = []; host.innerHTML = '';

    mountQrt({ hits: [{ _id: 'a', _score: 1, _source: { t: 1 } }], total: 1 });
    await tick();
    expect(host.querySelector('.qrt-fill'), '缺省零增量').toBeNull();
    expect(host.querySelector('.qrt-fs-fill')).toBeNull();
  });

  it('④ Lucene 宿主开启 fill；负控：删掉后必须判不合格', () => {
    const tag = LUCENE.match(/<QueryResultTable[\s\S]*?>/)?.[0] ?? '';
    expect(tag, '必须找到结果表标签').toContain(':hits="hits"');
    expect(tag).toMatch(/\sfill[\s>]/);
    const broken = tag.replace(/\sfill[\s>]/, ' ');
    expect(broken).not.toMatch(/\sfill[\s>]/);
  });
});
