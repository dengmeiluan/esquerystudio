/**
 * 直方图「无时间字段」标注的悬浮释义单源——HistogramSection 与 DslQueryView
 * 两处同款文案共用，长文本悬浮统一走 Tip 组件 long 档承载。
 */
export const DATE_FIELD_SNIFF_HINT =
  '当前索引 mapping 无 date 字段：执行后将尝试从结果值形态嗅探（epoch 毫秒/秒/ISO 串）；均不匹配则不生成直方图';
