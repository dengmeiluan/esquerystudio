/* RemoteSourceFields 统一件行为契约（两页远程源表单收编）：
   ① hostRaw 模式拆/拼——conn.host 单串（RA 口径）拆成 scheme/host/port 三段编辑、拼回恒等，
      任何输入 format(parse(x)) === x（容错输入原样保留，不改用户原文）；
   ② conn 对象编辑回传（Xmigrate 口径）——编辑任一字段 emit 完整新对象，父草稿引用替换触发持久化；
   ③ 密码不回显明文口径——type="text" + .pw-mask（CSS -webkit-text-security 圆点遮罩）
      + autocomplete="off"，组件不得改回 type="password"（口径：内存流转、CSS 遮罩）；
   ④ 检查钮 testable 门控 + testBusy 态 + host 框 Enter 触发 test（DOM 锚点：
      .xm-conn 容器 / placeholder^="host" / 「连接检查」文案，rebuildThreeState 依赖）。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import RemoteSourceFields, { parseHostRaw, formatHostRaw } from '../RemoteSourceFields.vue';

const CONN = { scheme: 'http' as const, host: '', port: 9200, username: '', password: '' };

function mount(props: Record<string, any>, handlers: Record<string, (v?: any) => void> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(RemoteSourceFields, {
      conn: { ...CONN, ...props.conn },
      ...props,
      ...Object.fromEntries(Object.entries(handlers).map(([k, v]) => ['on' + k[0].toUpperCase() + k.slice(1), v])),
    } as any),
  });
  app.mount(host);
  return { host, app };
}

function setInput(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('hostRaw 拆/拼纯函数（往返恒等）', () => {
  it('标准形态恒等：scheme+host+port / 无 scheme / 无 port / 全缺', () => {
    for (const s of ['https://h:9200', 'http://h', 'h:9200', 'h']) {
      const v = parseHostRaw(s);
      expect(formatHostRaw(v), s + ' 往返必须恒等').toBe(s);
    }
  });
  it('拆解正确：scheme/host/port 各就位', () => {
    expect(parseHostRaw('https://h:9200')).toEqual({ scheme: 'https', host: 'h', port: 9200 });
    expect(parseHostRaw('h:9200').scheme).toBe('');
    expect(parseHostRaw('https://h').port).toBe('');
  });
  it('容错：畸形/IPv6 串原样落 host 段，拼回不改用户输入', () => {
    for (const s of ['h:', 'https://[::1]:9200', 'a:b:c']) {
      expect(formatHostRaw(parseHostRaw(s)), s + ' 容错恒等').toBe(s);
    }
  });
  it('host 清空 → 拼回空串（关掉远程源语义）', () => {
    expect(formatHostRaw({ scheme: 'https', host: '', port: 9200 })).toBe('');
  });
});

describe('hostRaw 模式（RA 远程源）', () => {
  it('conn.host 单串拆成三段渲染：seg 选中态 + host 框 + port 框', () => {
    const { host } = mount({ hostRaw: true, conn: { ...CONN, host: 'https://remote-host:9200' } });
    expect(host.querySelector('.xm-conn'), '容器锚点 .xm-conn 必须在').toBeTruthy();
    const segBtns = host.querySelectorAll('.seg button');
    expect(segBtns[1]!.classList.contains('on'), 'https 段选中').toBe(true);
    expect(segBtns[0]!.classList.contains('on')).toBe(false);
    const hostInp = host.querySelector<HTMLInputElement>('.xm-conn input[placeholder^="host"]')!;
    expect(hostInp.value, 'host 段不含 scheme:port').toBe('remote-host');
    expect((host.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('9200');
  });

  it('编辑 host 段 → update:conn 拼回完整串（scheme/port 保留）', async () => {
    let got: any = null;
    const { host } = mount({ hostRaw: true, conn: { ...CONN, host: 'https://h:9200' } }, { 'update:conn': (v: any) => { got = v; } });
    setInput(host.querySelector<HTMLInputElement>('.xm-conn input[placeholder^="host"]')!, 'h2');
    await nextTick();
    expect(got?.host).toBe('https://h2:9200');
  });

  it('seg 切 scheme → 拼回串随动；编辑 port → 拼回串随动（受控父回写，RA computed set 同款）', async () => {
    const got: string[] = [];
    /* 组件是受控范式：emit 后父立即回写 props（RA 的 raRemoteConn set / Xmigrate 的 conn 赋值），
       连续编辑才能从最新视图出发——此用例以响应式 state 还原真实父回路 */
    const { reactive } = await import('vue');
    const state = reactive({ conn: { ...CONN, host: 'https://h:9200' } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(RemoteSourceFields, {
        hostRaw: true,
        conn: state.conn,
        'onUpdate:conn': (v: any) => { state.conn = v; got.push(v.host); },
      } as any),
    });
    app.mount(host);
    (host.querySelectorAll('.seg button')[0] as HTMLElement).click();
    await nextTick();
    expect(got[0]).toBe('http://h:9200');
    setInput(host.querySelector<HTMLInputElement>('input[type="number"]')!, '');
    await nextTick();
    expect(got[1]).toBe('http://h');
    app.unmount();
  });
});

describe('conn 对象编辑回传（Xmigrate 手动模式）', () => {
  it('编辑 host/username → emit 完整新对象（原字段保留）', async () => {
    const got: any[] = [];
    const { host } = mount({ conn: { ...CONN, username: 'elastic' } }, { 'update:conn': (v: any) => got.push(v) });
    setInput(host.querySelector<HTMLInputElement>('.xm-conn input[placeholder^="host"]')!, 'old-es:9200');
    await nextTick();
    expect(got[0]).toEqual({ scheme: 'http', host: 'old-es:9200', port: 9200, username: 'elastic', password: '' });
    setInput(host.querySelectorAll<HTMLInputElement>('.xm-conn input')[3]!, 'pwd1');
    await nextTick();
    expect(got[1]?.password).toBe('pwd1');
    expect(got[1]?.username).toBe('elastic');
  });

  it('port 数字化（v-model.number 口径）：数字进对象，清空保持空串', async () => {
    const got: any[] = [];
    const { host } = mount({ conn: { ...CONN } }, { 'update:conn': (v: any) => got.push(v) });
    setInput(host.querySelector<HTMLInputElement>('input[type="number"]')!, '9201');
    await nextTick();
    expect(got[0]?.port).toBe(9201);
    setInput(host.querySelector<HTMLInputElement>('input[type="number"]')!, '');
    await nextTick();
    expect(got[1]?.port).toBe('');
  });
});

describe('密码不回显明文口径 + 检查钮', () => {
  it('密码框 type=text + pw-mask 遮罩 + autocomplete=off（CSS 圆点遮罩口径，不得改 type=password）', () => {
    const { host } = mount({ conn: { ...CONN } });
    const pwd = host.querySelector<HTMLInputElement>('.xm-conn input.pw-mask')!;
    expect(pwd).toBeTruthy();
    expect(pwd.getAttribute('type')).toBe('text');
    expect(pwd.getAttribute('autocomplete')).toBe('off');
  });

  it('testable 缺省不渲染检查钮；true 渲染「连接检查」；testBusy 文案与 disabled', async () => {
    const { host } = mount({ conn: { ...CONN } });
    expect(host.querySelectorAll('.xm-conn button.btn').length).toBe(0);

    let tested = 0;
    const w2 = mount({ conn: { ...CONN }, testable: true }, { test: () => { tested++; } });
    const btn = Array.from(w2.host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.includes('连接检查'));
    expect(btn, '「连接检查」文案锚点必须在').toBeTruthy();
    btn!.click();
    await nextTick();
    expect(tested).toBe(1);
    w2.app.unmount();

    const w3 = mount({ conn: { ...CONN }, testable: true, testBusy: true });
    const busy = Array.from(w3.host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.includes('检查中…'));
    expect(busy, 'busy 态文案「检查中…」').toBeTruthy();
    expect(busy!.disabled, 'busy 态必须 disabled').toBe(true);
    w3.app.unmount();
  });

  it('host 框 Enter → emit test（原 @keydown.enter="check" 语义）', async () => {
    let tested = 0;
    const { host } = mount({ conn: { ...CONN }, testable: true }, { test: () => { tested++; } });
    host.querySelector<HTMLInputElement>('.xm-conn input[placeholder^="host"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(tested).toBe(1);
  });
});
