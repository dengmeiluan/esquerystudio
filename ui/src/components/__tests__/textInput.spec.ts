/* TextInput 统一文本输入件看守。范式同 emptyState.spec：项目无 @vue/test-utils，
 * createApp 手工 mount。核心契约：v-model 语义、attrs 透传到真实 input
 * （迁移期测试选择器零漂移的关键）、enter/esc 事件、清空钮状态机、状态/尺寸档。 */
import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import TextInput from '../TextInput.vue';

type TextInputProps = InstanceType<typeof TextInput>['$props'];

function render(props: TextInputProps, slots: Record<string, () => unknown> = {}, on: Record<string, unknown> = {}): HTMLElement {
  const host = document.createElement('div');
  createApp({ render: () => h(TextInput, { ...props, ...on }, slots) }).mount(host);
  return host.firstElementChild as HTMLElement;
}

function typeInto(input: HTMLInputElement, v: string) {
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(input: HTMLInputElement, key: string) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('TextInput', () => {
  it('v-model：input 事件回写 update:modelValue', () => {
    let got = '';
    const root = render({ modelValue: '' }, {}, { 'onUpdate:modelValue': (v: string) => { got = v; } });
    typeInto(root.querySelector('input') as HTMLInputElement, 'orders-v2');
    expect(got).toBe('orders-v2');
  });

  it('attrs 透传到真实 input（data-test 选择器零漂移）', () => {
    const host = document.createElement('div');
    createApp({ render: () => h(TextInput, { modelValue: 'x', 'data-test': 'xm-batch-srcprefix' }) }).mount(host);
    expect(host.querySelector('input[data-test="xm-batch-srcprefix"]')).not.toBeNull();
  });

  it('enter/esc 按键透发', () => {
    let enter = 0, esc = 0;
    const root = render({ modelValue: 'x' }, {}, { onEnter: () => { enter++; }, onEsc: () => { esc++; } });
    const input = root.querySelector('input') as HTMLInputElement;
    press(input, 'Enter');
    press(input, 'Escape');
    expect(enter).toBe(1);
    expect(esc).toBe(1);
  });

  it('清空钮状态机：无值不渲染，有值出现，点击清空并回焦输入框', () => {
    let got = 'orders';
    /* 焦点断言需要真实文档流：游离 host 上 happy-dom 不维护 activeElement */
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      createApp({ render: () => h(TextInput, { modelValue: 'orders', clearable: true, 'onUpdate:modelValue': (v: string) => { got = v; } }) }).mount(host);
      const root = host.firstElementChild as HTMLElement;
      expect(root.querySelector('.ti-clear')).not.toBeNull();
      (root.querySelector('.ti-clear') as HTMLButtonElement).click();
      expect(got).toBe('');
      expect(document.activeElement).toBe(root.querySelector('input'));
    } finally {
      host.remove();
    }
  });

  it('无值/禁用时不出清空钮', () => {
    expect(render({ modelValue: '', clearable: true }).querySelector('.ti-clear')).toBeNull();
    expect(render({ modelValue: 'x', clearable: true, disabled: true }).querySelector('.ti-clear')).toBeNull();
  });

  it('清空钮与后缀槽并存：转流内（ti-inflow）恒占位防叠放，可见性随值切换', () => {
    const root = render({ modelValue: '', clearable: true }, { suffix: () => h('span', {}, '条/秒') });
    const clear = root.querySelector('.ti-clear') as HTMLElement;
    expect(clear, '后缀在场时清空钮恒在 DOM（流内占位防宽度跳动）').not.toBeNull();
    expect(clear.classList.contains('ti-inflow'), '转流内布局，不再绝对右置叠后缀').toBe(true);
    expect(clear.style.display, '无值时隐藏但占位').toBe('none');
    const filled = render({ modelValue: 'x', clearable: true }, { suffix: () => h('span', {}, '条/秒') });
    expect((filled.querySelector('.ti-clear') as HTMLElement).style.display).toBe('');
    /* 无后缀时维持绝对定位形态（存量调用点零漂移） */
    const noSuffix = render({ modelValue: 'x', clearable: true });
    expect(noSuffix.querySelector('.ti-clear')!.classList.contains('ti-inflow')).toBe(false);
  });

  it('disabled 落到真实 input', () => {
    expect((render({ modelValue: 'x', disabled: true }).querySelector('input') as HTMLInputElement).disabled).toBe(true);
  });

  it('status/size 档位类落根容器', () => {
    expect(render({ modelValue: 'x', status: 'warn' }).classList.contains('ti-warn')).toBe(true);
    expect(render({ modelValue: 'x', status: 'err' }).classList.contains('ti-err')).toBe(true);
    expect(render({ modelValue: 'x', size: 'sm' }).classList.contains('ti-sm')).toBe(true);
  });

  it('宿主皮肤类 inputClass 落到真实 input（迁移期视觉零变化）', () => {
    const input = render({ modelValue: 'x', inputClass: 'inp mono xm-idx-inp' }).querySelector('input') as HTMLInputElement;
    expect(input.classList.contains('inp')).toBe(true);
    expect(input.classList.contains('mono')).toBe(true);
    expect(input.classList.contains('xm-idx-inp')).toBe(true);
  });

  it('prefix/suffix 插槽渲染在输入框两侧', () => {
    const root = render({ modelValue: 'x' }, {
      prefix: () => h('span', {}, '源'),
      suffix: () => h('span', {}, '条/秒'),
    });
    expect(root.querySelector('.ti-affix')!.textContent).toContain('源');
    expect(root.querySelectorAll('.ti-affix').length).toBe(2);
    expect(root.textContent).toContain('条/秒');
  });

  it('maxlength 透传（长文本场景防溢出）', () => {
    expect((render({ modelValue: 'x', maxlength: 40 }).querySelector('input') as HTMLInputElement).getAttribute('maxlength')).toBe('40');
  });

  it('type/spellcheck/autocomplete 缺省值在场；宿主 attrs 同名可覆盖（v-bind 后置，后绑定胜）', () => {
    /* 缺省档：普通文本框（autocomplete=off 防误填充、spellcheck 关） */
    const plain = render({ modelValue: 'x' }).querySelector('input') as HTMLInputElement;
    expect(plain.getAttribute('type')).toBe('text');
    expect(plain.getAttribute('autocomplete')).toBe('off');
    expect(plain.getAttribute('spellcheck')).toBe('false');
    /* 覆盖档：凭据语义（LoginOverlay 用户名 autocomplete=username 与密码管理器配对）直达真实 input；
       autocomplete 非 declared prop（走 $attrs），入参按 attrs 形态传 */
    const host = document.createElement('div');
    createApp({ render: () => h(TextInput, { modelValue: 'x', autocomplete: 'username' } as any) }).mount(host);
    expect((host.querySelector('input') as HTMLInputElement).getAttribute('autocomplete')).toBe('username');
  });
});
