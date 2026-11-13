/**
 * 242 批 v4：剪贴板架构层管线锁定。
 * 背景（用户两轮实报）：v2「toast 已复制但 Ctrl+V 空」——http+iframe 下
 * execCommand('copy') 复制的是宿主空选区却返回 true（假成功）。
 * v4 架构：L1 Clipboard API（secure context）→ L2 copy 事件劫持（execCommand 仅
 * 触发器，ClipboardEvent.clipboardData.setData 权威写入，与选区无关）→
 * L3 焦点门（hasFocus=false 直接 false，不派发事件）。
 * 额外锁定：execCommand 后 pendingCopy 回滚——绝不劫持用户手动 Ctrl+C。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../utils/format';
import { copyViaIntercept, installClipboardInterceptor } from '../utils/clipboard';

function withClipboard(cl: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: cl, configurable: true });
}
const realExec = (document as any).execCommand;
const realHasFocus = (document as any).hasFocus;
function stubHasFocus(ret: boolean) { (document as any).hasFocus = () => ret; }
function stubExec(fn: () => boolean) {
  const spy = vi.fn(fn);
  (document as any).execCommand = spy;
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error 测试后清理桩
  delete navigator.clipboard;
  (document as any).execCommand = realExec;
  (document as any).hasFocus = realHasFocus;
});

/** 安装真拦截器并让 execCommand('copy') 同步派发真实 copy 事件（可携带我们的 setData） */
function stubExecDispatchRealCopyEvent() {
  (document as any).execCommand = vi.fn(() => {
    // 真浏览器语义：execCommand 同步派发 copy 事件（ClipboardEvent 构造可带 clipboardData）
    const dt = new DataTransfer();
    const ev = new ClipboardEvent('copy', { clipboardData: dt, cancelable: true, bubbles: true });
    document.dispatchEvent(ev);
    // 派发后把拦截器写入的内容回吐——供断言「权威写入」真的发生
    (globalThis as any).__copied = dt.getData('text/plain');
    return true;
  });
}

describe('copyText v4（架构层剪贴板管线）', () => {
  it('L1：Clipboard API 可用 → writeText，不碰 execCommand', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    withClipboard({ writeText });
    stubHasFocus(true);
    stubExec(() => true);
    expect(await copyText('hello')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('L2：API 拒绝 → copy 事件劫持权威写入（选区无关）', async () => {
    withClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowed')) });
    stubHasFocus(true);
    stubExecDispatchRealCopyEvent();
    /* 不选区、不 focus textarea——旧实现此场景复制的是空选区（假成功），v4 依赖 setData 权威写值 */
    expect(await copyViaIntercept('AUTHORITATIVE_242')).toBe(true);
    expect((globalThis as any).__copied).toBe('AUTHORITATIVE_242');
  });

  it('L2→L1 全链：copyText 走到劫持层同样权威写入', async () => {
    withClipboard(undefined); // http 非安全上下文形态
    stubHasFocus(true);
    stubExecDispatchRealCopyEvent();
    vi.spyOn(window, 'getSelection');
    expect(await copyText('VIA_COPYTEXT')).toBe(true);
    expect((globalThis as any).__copied).toBe('VIA_COPYTEXT');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('L3：document 无系统焦点 → 焦点门拦截，execCommand 都不会被调用', async () => {
    withClipboard(undefined);
    stubHasFocus(false);
    const execSpy = stubExec(() => true);
    expect(await copyText('x')).toBe(false);
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('事件未派发（execCommand 返回 false）→ pendingCopy 回滚返回 false，不劫持后续手动复制', async () => {
    installClipboardInterceptor();
    withClipboard(undefined);
    stubHasFocus(true);
    stubExec(() => false); // 无焦点浏览器形态：命令失败，copy 事件不派发
    expect(await copyViaIntercept('NEVER_LANDS')).toBe(false);
    /* 手动 Ctrl+C 模拟：copy 事件必须直通（default 未被 prevent、内容不被劫持改写） */
    const dt = new DataTransfer();
    const ev = new ClipboardEvent('copy', { clipboardData: dt, cancelable: true, bubbles: true });
    document.dispatchEvent(ev);
    expect(dt.getData('text/plain')).toBe(''); // 无 pending → 不写入
  });
});
