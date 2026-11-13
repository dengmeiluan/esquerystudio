/**
 * 540 批 W2（轨 2 重建迁移残面）：JsonArea readonly 通道 + Xmigrate pre→JsonArea 重估接线。
 *
 * 背景：538 批裁决「Xmigrate pre→JsonArea 不做」两理由——①JsonArea 无 readonly 通道；
 * ②Xmigrate 的 pre 是「随内容生长至 max-height 封顶」而 JsonArea 是定高模型，非确定解。
 * 补 ①（readonly prop 缺省 false=既有行为零感知），并重估 ②：
 * rows=min(内容行数,封顶行数) → height=rows*19+16 是纯内容函数（无 DOM 测量、无回写回路），
 * 「随内容生长至封顶」存在确定解，故 Xmigrate 源配置预览接线（拖拽落盘 cfgMaxH 通道随 pre 退役，
 * __tests__ 全量 grep 无 cfgMaxH/xm-cfg-pre/cfgPreview 既有锁——无锁备案）。
 * MonacoEditor 内层 readOnly 契约（含运行时 watch）既有，只做 JsonArea 薄透传。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

/* Monaco stub 捕获——同 jsonAreaMonaco 范式（happy-dom 必炸真 Monaco） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import JsonArea from '../components/JsonArea.vue';

const apps: ReturnType<typeof createApp>[] = [];

function mountArea(props: Record<string, any>, onUpdate?: (v: string) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const p: any = { ...props };
  if (onUpdate) p['onUpdate:modelValue'] = onUpdate;
  const app = createApp({ render: () => h(JsonArea, p) });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { app, host };
}

beforeEach(() => {
  apps.splice(0).forEach(a => a.unmount());
  document.body.innerHTML = '';
  monacoCaps.length = 0;
});

describe('540 批：JsonArea readonly 通道', () => {
  it('缺省零增量：readonly 缺省 false 透传 + 格式化/压缩/复制三钮在场 + 高度模型不变', async () => {
    const { host } = mountArea({ modelValue: '{"a":1}', rows: 4 });
    await nextTick();
    expect(monacoCaps[0].props.readonly, '缺省透传 false（MonacoEditor 侧与「未传」同值，既有 15 处消费方零感知）').toBe(false);
    expect(monacoCaps[0].props.height, 'readonly 通道不碰定高模型（4*19+16）').toBe('92px');
    const btns = Array.from(host.querySelectorAll<HTMLButtonElement>('.ja-btn')).map(b => b.textContent?.trim());
    expect(btns.filter(t => t?.includes('格式化')).length, '缺省格式化钮在场').toBe(1);
    expect(btns.filter(t => t?.includes('压缩')).length, '缺省压缩钮在场').toBe(1);
    expect(btns.filter(t => t?.includes('复制')).length, '缺省复制钮在场').toBe(1);
  });

  it('readonly 态编辑禁用：MonacoEditor 收 readonly=true（内层 readOnly+运行时 watch 契约既有）', async () => {
    mountArea({ modelValue: '{"a":1}', readonly: true });
    await nextTick();
    expect(monacoCaps[0].props.readonly).toBe(true);
  });

  it('readonly 态编辑动作退役：格式化/压缩隐藏，仅复制在场', async () => {
    const { host } = mountArea({ modelValue: '{"a":1}', readonly: true });
    await nextTick();
    const btns = Array.from(host.querySelectorAll<HTMLButtonElement>('.ja-btn'));
    expect(btns.length, 'readonly 态只留复制一钮').toBe(1);
    expect(btns[0]!.textContent?.includes('复制'), '在场的是复制钮').toBe(true);
  });

  it('readonly 态复制可用：点击走剪贴板且不回写 modelValue', async () => {
    const writeFn = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeFn }, configurable: true });
    const got: string[] = [];
    const { host } = mountArea({ modelValue: '{"a":1}', readonly: true }, v => got.push(v));
    await nextTick();
    (host.querySelector<HTMLButtonElement>('.ja-btn')!).click();
    expect(writeFn).toHaveBeenCalledWith('{"a":1}');
    expect(got, 'readonly 态无编辑路径，零回写').toEqual([]);
  });
});

/* ── Xmigrate 源配置预览 pre→JsonArea readonly 接线（静态契约备案：无既有锁，本 spec 即锁） ── */
const XM_SRC = join(__dirname, '../views/XmigrateView.vue');

describe('540 批：Xmigrate 源配置预览 pre→JsonArea readonly 接线', () => {
  const xm = readFileSync(XM_SRC, 'utf-8');

  it('pre 高亮通道退役：json-view/xm-cfg-pre/v-html 配置预览形态不回流', () => {
    expect(xm, 'xm-cfg-pre 裸 pre 形态不回流').not.toContain('xm-cfg-pre');
    expect(xm, '配置预览 v-html 高亮通道退役（Monaco 自带高亮/校验）').not.toContain('cfgMappingHtml');
    expect(xm).not.toContain('cfgSettingsHtml');
  });

  it('JsonArea readonly 接线在场：readonly prop + 行数封顶高度模型（纯内容函数）', () => {
    expect(xm.match(/<JsonArea /g)?.length, 'mapping/settings 两路接线').toBe(2);
    expect(xm, 'readonly 通道（编辑禁用的锚）').toContain(' readonly ');
    expect(xm, '封顶行数常量在场（≈原 cfgMaxH 默认 200px：10*19+16=206px）').toMatch(/XM_CFG_CAP_ROWS = 10/);
    /* 五百五十二批同步更新（击穿者：552 轨2 刀⑥——封顶 10 改 useTierCycle 三档 10/20/40 落盘键
       xm.cfgRows，默认档 10=原封顶值）：Math.min 尾参随档位化改档值 ref（cfgCapRows.value），
       锁意图=行数=min(内容行数,档值) 纯内容函数——无 DOM 测量、无回写回路
       （红线：高度棘轮/循环扩大不触）零回退 */
    expect(xm, '行数=min(内容行数,档值)——无 DOM 测量、无回写回路（红线：高度棘轮/循环扩大不触）')
      .toMatch(/Math\.min\([^)]*split\('\\n'\)\.length[^)]*cfgCapRows\.value\)/);
  });

  it('cfgMaxH 拖拽落盘通道随 pre 退役（saveCfgH/usePref 预览稿不回流）', () => {
    expect(xm, 'saveCfgH 随 pre 退役').not.toContain('saveCfgH');
    expect(xm, "xm.cfgMaxH 偏好稿退役（无既有消费方，无锁备案）").not.toContain('xm.cfgMaxH');
    expect(xm, '@pointerup 拖拽落盘锚不回流').not.toContain('@pointerup="saveCfgH"');
  });
});
