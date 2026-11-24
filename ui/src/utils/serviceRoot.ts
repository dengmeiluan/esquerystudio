/**
 * Service root for the MCP endpoint on a console page.
 *
 * The console is always served under an `esquerystudio` segment (standalone:
 * `/esquerystudio/index.html`; host: `/quotehub/esquerystudio.html`). The MCP
 * endpoint lives at the service root, not inside that static segment:
 * standalone -> origin, host -> origin + context-path.
 */
export function serviceRootFromLocation(origin: string, pathname: string): string {
  let ctx = pathname.replace(/\/esquerystudio(?:\.html|\/.*)?$/, '');
  if (ctx === pathname) {
    ctx = pathname.replace(/\/[^/]*$/, '');
  }
  if (ctx.endsWith('/')) {
    ctx = ctx.slice(0, -1);
  }
  return origin + ctx;
}
