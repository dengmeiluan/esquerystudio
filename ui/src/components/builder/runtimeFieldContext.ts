/* 1069 续：运行时字段「无 script」的跨字段位提示上下文。
   只在检索参数面板内 provide（RootExtrasPane 持有 tree），FieldSelect 注入后对当前值做
   一致性提示——排序/高亮/折叠/聚合/建议等所有字段位自动获得同一套诚实语义，
   不靠逐处透传 prop，也不做成全局单例（切页不串味）。 */
import type { ComputedRef, InjectionKey } from 'vue';

export interface RuntimeFieldContext {
  /** 当前树里「只有 type、缺 script」的运行时字段名集合 */
  noScript: ComputedRef<ReadonlySet<string>>;
  /** 打开该运行时字段的字段体编辑（type/script） */
  edit(name: string): void;
}

export const RUNTIME_FIELD_CTX: InjectionKey<RuntimeFieldContext> = Symbol('runtime-field-ctx');
