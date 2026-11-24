/* TextInput v-model 修饰符看守（.trim）。
 * 背景：v-model.trim 经编译后以 modelModifiers 传入组件。统一件未声明该 prop 时，
 * 它随 $attrs 落到真实 input（DOM 上出 modelmodifiers="[object Object]"），且显示值
 * 直接绑模型——回写值被剪掉首尾空白后，重渲染会把刚敲入的空格从输入框里吃掉。
 * 锁定：trim 回写值去首尾空白；非 trim 原样回写；输入过程不改 DOM 显示（词间空格
 * 保留）；失焦/模型被外部改写后显示收敛到模型值；modelModifiers 不漏到 DOM。
 * 挂具范式同 textInput.spec（createApp 手工 mount，项目无 @vue/test-utils）。 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import TextInput from '../TextInput.vue';

async function settle(n = 4) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function nativeSet(el: HTMLInputElement, tx: string) {
  const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  st.call(el, tx);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 宿主以 ref 持值回接（等价 v-model 的赋值回环）；mods 即 v-model 修饰符（v-model.trim → { trim: true }） */
function mountHost(mods?: Record<string, boolean>) {
  const val = ref('');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(TextInput, {
      modelValue: val.value,
      'onUpdate:modelValue': (v: string) => { val.value = v; },
      ...(mods ? { modelModifiers: mods } : {}),
    }),
  });
  app.mount(host);
  const input = () => host.querySelector('input') as HTMLInputElement;
  return { app, host, val, input };
}

describe('TextInput · v-model 修饰符（modelModifiers）', () => {
  it('.trim 回写：首尾空白剪除后回写模型', async () => {
    const m = mountHost({ trim: true });
    nativeSet(m.input(), '  bob  ');
    await settle();
    expect(m.val.value, '模型拿到去空白后的值').toBe('bob');
    m.app.unmount();
    m.host.remove();
  });

  it('非 trim 不动：回写原样（首尾空白保留）', async () => {
    const m = mountHost();
    nativeSet(m.input(), '  bob  ');
    await settle();
    expect(m.val.value, '无修饰符时回写值一字不改').toBe('  bob  ');
    expect(m.input().value, '显示与模型一致').toBe('  bob  ');
    m.app.unmount();
    m.host.remove();
  });

  it('.trim 输入过程不改 DOM 显示：空格不被吃掉，词间空格可继续输入', async () => {
    const m = mountHost({ trim: true });
    nativeSet(m.input(), 'a');
    await settle();
    nativeSet(m.input(), 'a ');
    await settle();
    expect(m.val.value, '模型值去尾部空白').toBe('a');
    expect(m.input().value, '输入框保留刚敲入的空格（原生 v-model.trim 同样不动 DOM）').toBe('a ');
    nativeSet(m.input(), 'a b');
    await settle();
    expect(m.input().value, '词间空格可输入').toBe('a b');
    expect(m.val.value).toBe('a b');
    /* 只有空白：模型为空串，输入框原样显示 */
    nativeSet(m.input(), '   ');
    await settle();
    expect(m.val.value).toBe('');
    expect(m.input().value).toBe('   ');
    m.app.unmount();
    m.host.remove();
  });

  it('.trim 失焦后显示收敛到模型值（去空白后的值）', async () => {
    const m = mountHost({ trim: true });
    nativeSet(m.input(), '  a b  ');
    await settle();
    expect(m.input().value).toBe('  a b  ');
    m.input().dispatchEvent(new FocusEvent('blur'));
    await settle();
    expect(m.input().value, '失焦后输入框显示模型值').toBe('a b');
    m.app.unmount();
    m.host.remove();
  });

  it('.trim 模型被外部改写（清空/回填）：显示跟随模型，不残留旧输入', async () => {
    const m = mountHost({ trim: true });
    nativeSet(m.input(), 'old value ');
    await settle();
    m.val.value = '';
    await settle();
    expect(m.input().value, '外部清空后输入框同步清空').toBe('');
    nativeSet(m.input(), 'x ');
    await settle();
    m.val.value = 'filled';
    await settle();
    expect(m.input().value, '外部回填后输入框同步回填').toBe('filled');
    m.app.unmount();
    m.host.remove();
  });

  it('modelModifiers 不经 $attrs 漏到真实 input', async () => {
    const m = mountHost({ trim: true });
    await settle();
    expect(m.input().hasAttribute('modelmodifiers'), 'DOM 上不得出现 modelmodifiers="[object Object]"').toBe(false);
    expect(m.host.querySelector('[modelmodifiers]'), '根容器上同样不带').toBeNull();
    m.app.unmount();
    m.host.remove();
  });
});
