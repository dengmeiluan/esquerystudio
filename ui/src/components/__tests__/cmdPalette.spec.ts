/* R93-83 接线看守：CmdPalette.vue 真的把 aliasForTitle 接进了 rows 计算——
 * 抽模块（utils/cmdAlias.ts）后，若有人删了 import 或换回内联查表却忘了去前缀，
 * 纯函数单测照过（模块本身没问题），但导航项的拼音搜索在界面上会静默失效。
 *
 * 故本文件 mount 真 CmdPalette，喂一个「只经别名才进 haystack」的拼音串，
 * 断言对应导航项出现在渲染结果里。判据落在**行为**（rows 渲染出该 title），
 * 不落在字面 '前往：'。
 *
 * 范式同 hotkeys/adhocDiffWiring：项目无 @vue/test-utils，用 createApp 手工 mount。 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CmdPalette from '../CmdPalette.vue';

let app: VueApp | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = '';
  app = null;
  host = null;
});

async function mountPalette(): Promise<{
  setQuery: (q: string) => Promise<string[]>;
}> {
  host = document.createElement('div');
  document.body.appendChild(host);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();

  app = createApp({ render: () => h(CmdPalette, { show: true }) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();

  /* CmdPalette 用 <teleport to="body"> 渲染，面板 DOM 在 document.body 而非 host。
     故选择器在 document.body 上查（host 只是挂载点，面板内容被 teleport 挪走了）。 */
  const root = () => document.body;
  const setQuery = async (q: string): Promise<string[]> => {
    const inp = root().querySelector('.pal-input') as HTMLInputElement | null;
    expect(inp, '面板渲染后应能在 body 上找到 .pal-input').toBeTruthy();
    inp!.value = q;
    inp!.dispatchEvent(new Event('input'));
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    return [...root().querySelectorAll('.pal-item-title')].map(el => (el.textContent || '').trim());
  };
  return { setQuery };
}

describe('R93 CmdPalette 接线：aliasForTitle 真接到 rows（导航项拼音可搜）', () => {
  /* 'gl' 是「概览」的拼音首字母，只经别名进 haystack（导航 title 是中文 '前往：概览'、
     sub/cat 也都不含拉丁字母 'gl'）。能搜到 '前往：概览' 即证明 aliasForTitle 被调用且去前缀生效。 */
  it('搜拼音 "gl" → 「前往：概览」出现在结果里（别名链接通）', async () => {
    const { setQuery } = await mountPalette();
    const titles = await setQuery('gl');
    expect(titles).toContain('前往：概览');
  });

  /* 另一条导航项 + 一个改名后的孤儿（落到导航名）各取一个拼音首字母，覆盖面比单条宽。
     'tp' = 拓扑（导航裸名键），'llq' = 数据浏览器（孤儿改名后落到导航名）。 */
  it('搜拼音 "tp" → 「前往：拓扑」出现；搜 "llq" → 「前往：数据浏览器」出现', async () => {
    const { setQuery } = await mountPalette();
    expect((await setQuery('tp')).some(t => t === '前往：拓扑')).toBe(true);
    expect((await setQuery('llq')).some(t => t === '前往：数据浏览器')).toBe(true);
  });

  /* 动作类孤儿不依赖去前缀，但同样要能搜到——证明改名后的动作键也通。
     '打开搜索沙盒' 的别名含 'sssh'。 */
  it('搜动作类孤儿的拼音 "sssh" → 「打开搜索沙盒」出现（改名后动作键也通）', async () => {
    const { setQuery } = await mountPalette();
    expect((await setQuery('sssh')).some(t => t === '打开搜索沙盒')).toBe(true);
  });

  /* 反向自检：一个绝不在任何 haystack 里的乱码串，结果应为空（证明 setQuery 真触发了过滤，
     上面三条 contain 不是「setQuery 没生效、rows 永远是全量」的假绿）。 */
  it('自检：搜一串绝无匹配的乱码 → 结果为空（证明过滤真的生效，上面不是假绿）', async () => {
    const { setQuery } = await mountPalette();
    const titles = await setQuery('zzzzqzzzz');
    expect(titles).toEqual([]);
  });
});
