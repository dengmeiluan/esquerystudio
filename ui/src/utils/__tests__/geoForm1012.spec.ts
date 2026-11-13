/* 1012 批：geo 坐标形态判定纯函数行为锁——
   geo_point 视图（对象/半成品/非数值退化）、bbox corners/edges/混合退化、越界判定 */
import { describe, it, expect } from 'vitest';
import { geoPointView, bboxView, latOutOfRange, lonOutOfRange } from '../geoForm';

describe('1012 geoPointView', () => {
  it('对象数值形态 → 视图（半成品允许键缺席）', () => {
    expect(geoPointView({ lat: 40, lon: -70 })).toEqual({ lat: 40, lon: -70 });
    expect(geoPointView({ lat: 40 })).toEqual({ lat: 40 });
    expect(geoPointView({})).toEqual({});
  });
  it.each([
    ['串坐标（合法 ES 但保真优先）', '40,-70'],
    ['geohash', 'u17'],
    ['数组 [lon,lat]', [-70, 40]],
    ['非对象', 42],
    ['未知键', { lat: 40, bogus: 1 }],
    ['串值键', { lat: '40' }],
  ])('%s → null 退化', (_n, v) => {
    expect(geoPointView(v)).toBeNull();
  });
});

describe('1012 bboxView', () => {
  it('corners 形态（含空对象骨架与单角半成品）', () => {
    expect(bboxView({ top_left: { lat: 42, lon: -72 }, bottom_right: { lat: 40, lon: -74 } }))
      .toEqual({ mode: 'corners', corners: { tl: { lat: 42, lon: -72 }, br: { lat: 40, lon: -74 } } });
    expect(bboxView({})).toEqual({ mode: 'corners', corners: { tl: {}, br: {} } });
    expect(bboxView({ top_left: { lat: 42 } })).toEqual({ mode: 'corners', corners: { tl: { lat: 42 }, br: {} } });
  });
  it('edges 平铺形态（≥1 边键且纯数值）', () => {
    expect(bboxView({ top: 40, left: -74, right: -72, bottom: 39 }))
      .toEqual({ mode: 'edges', edges: { top: 40, left: -74, right: -72, bottom: 39 } });
    expect(bboxView({ top: 40 })).toEqual({ mode: 'edges', edges: { top: 40 } });
  });
  it.each([
    ['混合 corners+edges', { top: 40, top_left: { lat: 1 } }],
    ['角值串坐标', { top_left: '40,-72' }],
    ['角值非对象', { top_left: 40 }],
    ['边值非数值', { top: '40' }],
    ['非对象', 'box'],
  ])('%s → null 退化', (_n, v) => {
    expect(bboxView(v)).toBeNull();
  });
});

describe('1012 越界判定', () => {
  it('lat -90~90 / lon -180~180', () => {
    expect(latOutOfRange(120)).toBe(true);
    expect(latOutOfRange(-91)).toBe(true);
    expect(latOutOfRange(90)).toBe(false);
    expect(lonOutOfRange(181)).toBe(true);
    expect(lonOutOfRange(-180)).toBe(false);
  });
});
