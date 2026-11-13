<template>
  <component :is="inline ? 'section' : NModal" v-bind="shellProps" @update:show="onShellShow">
    <div class="mcp-panel mcp-console" :class="{ 'mcp-inline': inline }">
      <header class="mcp-console-head">
        <div class="mcp-console-title">
          <span class="mcp-eyebrow">MCP / CONTROL PLANE</span>
          <h2>MCP 接入管理</h2>
          <p class="mcp-head-sub">把客户端、传输、身份与连接权限放在同一张图上：签发范围 = 端点实际执行范围。</p>
        </div>
        <div class="mcp-console-status">
          <span class="mcp-mode-pill">
            <span class="mcp-live-dot" :class="{ browser: !serverMode }" aria-hidden="true" />
            {{ isBrowserMode ? '页面内桥' : isDemoMode ? '演示只读' : '服务端在线' }}
          </span>
          <button v-if="serverMode && canCreate" type="button" class="btn primary xs mcp-head-cta" @click="openCreateKey">签发密钥</button>
          <button type="button" class="btn ghost xs mcp-head-cta" @click="tab = 'clients'">客户端接入</button>
          <button type="button" class="mcp-endpoint-chip" @click="copyProtocolValue(endpoint)">
            <em>{{ isBrowserMode ? 'PAGE' : 'HTTP' }}</em><code>{{ isBrowserMode ? 'window.ESQueryStudioMCP' : endpoint }}</code>
          </button>
          <button type="button" class="btn ghost xs mcp-strip-check" data-test="mcp-protocol-check"
            :disabled="checking || !canProbe"
            :title="isDemoMode ? '演示站没有可连接的 MCP 端点' : (!canProbe ? '先签发一把 key，或在体检卡里选择凭证' : '真实调用 initialize / tools/list / resources/list / prompts/list')"
            @click="runProtocolCheck">
            {{ checking ? '自检中…' : '协议自检' }}
          </button>
          <button v-if="!inline" type="button" class="mcp-shell-close" aria-label="关闭" @click="emit('update:show', false)">×</button>
        </div>
      </header>

      <div class="mcp-signal-bar" :class="{ busy: checking || onboardingTesting || running }" aria-label="MCP 权限链路">
        <button type="button" class="mcp-signal-node" :class="{ live: tab === 'clients' }" @click="tab = 'clients'">
          <span class="mcp-eyebrow">CLIENT</span>
          <strong>{{ traceClient }}</strong>
          <small>{{ traceClientSub }}</small>
        </button>
        <span class="mcp-signal-arrow" aria-hidden="true">→</span>
        <button type="button" class="mcp-signal-node" :class="{ live: tab === 'access' }" @click="tab = 'access'">
          <span class="mcp-eyebrow">TRANSPORT</span>
          <strong>{{ traceTransport }}</strong>
          <small>{{ traceTransportSub }}</small>
        </button>
        <span class="mcp-signal-arrow" aria-hidden="true">→</span>
        <button type="button" class="mcp-signal-node" :class="{ live: tab === 'keys' }" @click="tab = 'keys'">
          <span class="mcp-eyebrow">AUTH</span>
          <strong>{{ traceAuth }}</strong>
          <small>{{ traceAuthSub }}</small>
        </button>
        <span class="mcp-signal-arrow" aria-hidden="true">→</span>
        <button type="button" class="mcp-signal-node" @click="tab = 'keys'">
          <span class="mcp-eyebrow">SCOPE</span>
          <strong>{{ traceScope }}</strong>
          <small>{{ traceScopeSub }}</small>
        </button>
        <span class="mcp-signal-arrow" aria-hidden="true">→</span>
        <button type="button" class="mcp-signal-node mcp-signal-audit" @click="tab = 'audit'">
          <span class="mcp-eyebrow">AUDIT</span>
          <b>{{ traceAudit }}</b>
          <small>{{ traceAuditSub }}</small>
        </button>
      </div>
      <div v-if="protocolCheck" class="mcp-check-result mcp-check-strip" :class="{ bad: !protocolCheck.ok }" role="status">
        <template v-if="protocolCheck.ok">
          通过 · {{ protocolCheck.ms }} ms · 协议 <code>{{ protocolCheck.protocol }}</code>
          <span v-if="protocolCheck.supported">（支持 {{ protocolCheck.supported }}）</span> ·
          {{ protocolCheck.tools }} 工具 / {{ protocolCheck.resources }} 资源 / {{ protocolCheck.templates }} 模板 / {{ protocolCheck.prompts }} 提示词 / {{ protocolCheck.completions }} 补全
        </template>
        <template v-else>失败 · {{ protocolCheck.message }}</template>
      </div>
      <div v-if="copyNotice" class="mcp-copy-notice" role="status">{{ copyNotice }}</div>

      <div class="mcp-console-body mcp-console-body-stacked">
        <nav class="mcp-rail mcp-tabs" role="tablist" aria-label="MCP 接入视图" @keydown="onTabKeydown">
          <button type="button" class="mcp-rail-item" :class="{ active: tab === 'access' }" role="tab"
            :aria-selected="tab === 'access'" @click="tab = 'access'">
            <span class="mcp-rail-index">01</span><span class="mcp-rail-label">接入总览</span><em>{{ isBrowserMode ? '页面桥' : 'HTTP / SSE' }}</em>
          </button>
          <button type="button" class="mcp-rail-item" data-test="mcp-tools-tab" :class="{ active: tab === 'tools' }" role="tab"
            :aria-selected="tab === 'tools'" @click="tab = 'tools'">
            <span class="mcp-rail-index">02</span><span class="mcp-rail-label">工具目录</span><em>{{ Object.keys(MCP_GROUP_ACTIONS).length }} 组</em>
          </button>
          <button type="button" class="mcp-rail-item" data-test="mcp-clients-tab" :class="{ active: tab === 'clients' }" role="tab"
            :aria-selected="tab === 'clients'" @click="tab = 'clients'">
            <span class="mcp-rail-index">03</span><span class="mcp-rail-label">客户端<span class="mcp-label-extra">接入</span></span><em>{{ onboardingClientCount }} 家</em>
          </button>
          <button type="button" class="mcp-rail-item" data-test="mcp-keys-tab" :class="{ active: tab === 'keys' }" role="tab"
            :aria-selected="tab === 'keys'" @click="openKeys">
            <span class="mcp-rail-index">04</span><span class="mcp-rail-label">密钥</span><em>{{ keys.length }} 把</em>
          </button>
          <button type="button" class="mcp-rail-item" data-test="mcp-audit-tab" :class="{ active: tab === 'audit' }" role="tab"
            :aria-selected="tab === 'audit'" @click="openAudit">
            <span class="mcp-rail-index">05</span><span class="mcp-rail-label">调用审计</span><em>{{ auditCalls.length }} 条</em>
          </button>
          <div class="mcp-tabs-meta">
            <span>15 组 · 130 动作</span><span>10 资源 · 5 提示词</span>
          </div>
        </nav>
        <section class="mcp-stage">
          <header class="mcp-stage-head">
            <div>
              <span class="mcp-eyebrow">{{ stageInfo.eyebrow }}</span>
              <h3>{{ stageInfo.title }}</h3>
              <p>{{ stageInfo.desc }}</p>
            </div>
          </header>
          <div class="mcp-stage-scroll">
            <template v-if="tab === 'access'">
              <div class="mcp-access-top">
                <section class="mcp-card mcp-mode-matrix">
                  <div class="mcp-card-head-row">
                    <div>
                      <h3>三种接入面 · 同一份工具契约</h3>
                      <p class="mcp-hint">服务端 / 页面内桥 / 本地 Node 共用 130 个工具、10 个资源（含 1 个 MCP App）与 5 个提示词；差异只在传输、身份与留档字段。</p>
                    </div>
                    <span class="mcp-contract-badge">CONTRACT v{{ protocolCheck?.protocol || '2026-07-28' }}</span>
                  </div>
                  <div class="mcp-mode-table-wrap">
                    <table class="mcp-mode-table">
                      <thead>
                        <tr><th>接入面</th><th>入口</th><th>身份 / 权限</th><th>调用留档</th><th>适用与边界</th></tr>
                      </thead>
                      <tbody>
                        <tr :class="{ active: serverMode }">
                          <td data-label="接入面"><b>服务端</b><span v-if="serverMode" class="mcp-mode-tag">当前</span></td>
                          <td data-label="入口"><code>POST /mcp</code><small>Streamable HTTP · SSE 兼容</small></td>
                          <td data-label="身份 / 权限">Bearer key / service token<small>按 key 的连接 read / write 执行</small></td>
                          <td data-label="调用留档">IP · UA · HTTP · requestId<small>默认保留 30 天（最低 7 天）</small></td>
                          <td data-label="适用与边界">跨机器 Agent；需要部署与鉴权<small>宿主 Security 需放行 /mcp</small></td>
                        </tr>
                        <tr :class="{ active: isBrowserMode }">
                          <td data-label="接入面"><b>浏览器内桥</b><span v-if="isBrowserMode" class="mcp-mode-tag">当前</span></td>
                          <td data-label="入口"><code>window.ESQueryStudioMCP</code><small>页面内 JSON-RPC，无端口</small></td>
                          <td data-label="身份 / 权限">当前浏览器连接档案<small>走 ES 原生账号权限</small></td>
                          <td data-label="调用留档">origin · UA · transport<small>localStorage 保留 30 天</small></td>
                          <td data-label="适用与边界">页面内 Agent / 插件自动化<small>外部进程不能直连标签页</small></td>
                        </tr>
                        <tr>
                          <td data-label="接入面"><b>本地 Node</b></td>
                          <td data-label="入口"><code>esquerystudio-mcp --config</code><small>stdio，本地直连 ES</small></td>
                          <td data-label="身份 / 权限">本机连接配置<small>写工具需 --allow-write</small></td>
                          <td data-label="调用留档">pid · host · transport<small>无网络 IP，如实标注</small></td>
                          <td data-label="适用与边界">桌面 IDE / 无 Spring Boot<small>连接凭据留在本机</small></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
                <aside class="mcp-card mcp-ready-card mcp-doctor">
                  <div class="mcp-card-head-row">
                    <div>
                      <span class="mcp-eyebrow">CONNECTION DOCTOR</span>
                      <h3>连接体检</h3>
                    </div>
                    <span class="mcp-ready-count">{{ readyCount }}/4</span>
                  </div>
                  <div v-if="serverMode && activeKeyOptions.length" class="mcp-doctor-keyline">
                    <span class="mcp-field-label">体检凭证</span>
                    <n-select v-model:value="probeKeyId" :options="activeKeyOptions" size="small" filterable clearable
                      class="mcp-filter-select mcp-doctor-key-select" placeholder="自动使用唯一活跃 key"
                      aria-label="选择体检密钥" @update:value="onProbeKeyChange" />
                  </div>
                  <div class="mcp-doctor-status" :class="protocolCheck ? (protocolCheck.ok ? 'ok' : 'bad') : ''">
                    <span class="mcp-live-dot" :class="{ browser: protocolCheck && !protocolCheck.ok }" aria-hidden="true" />
                    <div>
                      <b>{{ protocolStatusText }}</b>
                      <small>{{ protocolCheck ? protocolCheck.ms + ' ms · ' + (protocolCheck.server?.name || 'MCP') + ' ' + (protocolCheck.server?.version || '') : '真实调用 initialize / tools/list / server/discover' }}</small>
                    </div>
                  </div>
                  <div v-if="protocolCheck?.ok" class="mcp-doctor-readout" aria-label="体检读数">
                    <div><span>协议</span><b>{{ protocolCheck.protocol || '—' }}</b></div>
                    <div><span>工具</span><b>{{ protocolCheck.tools ?? '—' }}</b></div>
                    <div><span>资源</span><b>{{ (protocolCheck.resources || 0) + (protocolCheck.templates || 0) }}</b></div>
                    <div><span>提示词</span><b>{{ protocolCheck.prompts ?? '—' }}</b></div>
                  </div>
                  <ol class="mcp-ready-list">
                    <li :class="{ done: !!protocolCheck?.ok }"><span>01</span><div><b>端点可发现</b><small>{{ protocolCheck?.ok ? '协议自检已通过' : '运行 initialize / tools/list' }}</small></div><button type="button" class="mcp-link-btn" @click="runProtocolCheck">{{ checking ? '…' : '自检' }}</button></li>
                    <li :class="{ done: !!activeKeyCount }"><span>02</span><div><b>凭证已签发</b><small>{{ activeKeyCount ? activeKeyCount + ' 把活跃 key' : (serverMode ? '还没有活跃 key' : '本模式不签发 HTTP key') }}</small></div><button type="button" class="mcp-link-btn" @click="openKeys">{{ serverMode ? '去签发' : '看边界' }}</button></li>
                    <li :class="{ done: onboardingCopied }"><span>03</span><div><b>客户端配置已复制</b><small>{{ onboardingCopied ? '已复制，粘贴到客户端' : '选客户端并复制官方配置' }}</small></div><button type="button" class="mcp-link-btn" @click="tab = 'clients'">去接入</button></li>
                    <li :class="{ done: auditCalls.length > 0 }"><span>04</span><div><b>首次调用有留档</b><small>{{ auditCalls.length ? '最近 ' + auditCalls.length + ' 条' : '调用后按 IP / requestId 核对' }}</small></div><button type="button" class="mcp-link-btn" @click="openAudit">看审计</button></li>
                  </ol>
                  <div class="mcp-ready-actions">
                    <button type="button" class="btn primary sm" :disabled="checking || isDemoMode" @click="runProtocolCheck">{{ checking ? '体检中…' : '运行体检' }}</button>
                    <button v-if="protocolCheck" type="button" class="btn ghost sm" @click="copyDoctorReport">复制报告</button>
                    <button v-if="serverMode" type="button" class="btn ghost sm" @click="openCreateKey">签发密钥</button>
                  </div>
                  <p v-if="protocolCheck && !protocolCheck.ok" class="mcp-error mcp-doctor-error" role="alert">{{ protocolCheck.message }}</p>
                </aside>
              </div>

              <details class="mcp-protocol-baseline">
                <summary>
                  <span class="mcp-eyebrow">PROTOCOL BASELINE</span>
                  <b>5 个协议版本 · 4 种传输 · 核心方法全覆盖</b>
                  <span>{{ protocolCheck?.protocol || '2026-07-28' }}</span>
                </summary>
                <div class="mcp-protocol-matrix">
                  <div><span>版本</span><code>2026-07-28</code><em>兼容 2025-11-25 / 2025-06-18 / 2025-03-26 / 2024-11-05</em></div>
                  <div><span>传输</span><code>Streamable HTTP · SSE 兼容 · 页面内桥 · 本地 stdio</code></div>
                  <div><span>核心方法</span><code>server/discover · initialize · tools · resources · prompts · completion</code></div>
                  <div><span>扩展边界</span><em>Tasks 已支持（客户端显式 opt-in）；Apps 已声明并提供 ui:// 资源与 action 工具绑定；MRTR 已支持（高危写操作 elicitation 二次确认）；subscriptions/listen 不声明；roots / sampling / logging 为 2026 已废弃/移除能力</em></div>
                </div>
              </details>

              <section class="mcp-card mcp-access-commands">
                <div class="mcp-card-head-row">
                  <h3>30 秒验证</h3>
                  <span class="mcp-hint">发版后不需要改配置；先 probe，再让客户端接入。</span>
                </div>
                <div class="mcp-cmd-row">
                  <span class="mcp-cmd-label">curl</span>
                  <code>{{ curlSnippet }}</code>
                  <button type="button" class="mcp-link-btn" @click="copyProtocolValue(curlSnippet)">复制</button>
                </div>
                <div class="mcp-cmd-row">
                  <span class="mcp-cmd-label">probe</span>
                  <code>{{ probeCommand }}</code>
                  <button type="button" class="mcp-link-btn" @click="copyProbeCommand">复制</button>
                </div>
                <div class="mcp-cmd-row">
                  <span class="mcp-cmd-label">browser</span>
                  <code>await window.ESQueryStudioMCP.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })</code>
                  <button type="button" class="mcp-link-btn" @click="copyProtocolValue(browserSnippet)">复制</button>
                </div>
              </section>
            </template>
            <template v-else-if="tab === 'tools'">
              <div class="mcp-tools-layout">
          <section class="mcp-card mcp-tool-registry">
            <h3>工具清单（客户端 {{ MCP_GROUP_ACTIONS ? Object.keys(MCP_GROUP_ACTIONS).length : 15 }} 组 · 细粒度 {{ tools.length }}）</h3>
            <p class="mcp-hint">客户端 <code>tools/list</code> 返回 15 个 action 型工具；下方 130 个细粒度名保留给兼容调试与旧客户端。</p>
            <div class="mcp-tool-view-toggle" role="group" aria-label="工具视图">
              <button type="button" class="mcp-client-chip" :class="{ active: catalogView === 'groups' }"
                :aria-pressed="catalogView === 'groups'" @click="catalogView = 'groups'">分组视图（15）</button>
              <button type="button" class="mcp-client-chip" :class="{ active: catalogView === 'legacy' }"
                :aria-pressed="catalogView === 'legacy'" @click="catalogView = 'legacy'">细粒度兼容（130）</button>
            </div>
            <div class="mcp-tool-filters">
              <input v-model="toolQuery" class="mcp-filter" placeholder="搜索工具名 / 说明" aria-label="搜索 MCP 工具" />
              <n-select v-if="catalogView === 'legacy'" v-model:value="toolGroup" :options="toolGroupOptions" size="small" class="mcp-filter-select" aria-label="工具分类" />
              <n-select v-model:value="toolKindFilter" :options="toolKindOptions" size="small" class="mcp-filter-select mcp-kind-filter" aria-label="工具权限类型" />
            </div>
            <div v-if="catalogView === 'groups'" class="mcp-action-catalog">
              <section v-for="group in filteredActionCatalog" :key="group.name"
                class="mcp-tool-pick-group mcp-action-group" :class="{ open: catalogGroupExpanded(group.name) }">
                <button type="button" class="mcp-action-group-head" :aria-expanded="catalogGroupExpanded(group.name)"
                  @click="toggleCatalogGroup(group.name)">
                  <span class="mcp-action-chevron" aria-hidden="true">›</span>
                  <span>{{ group.name }}</span>
                  <em>{{ group.actions.length }} action</em>
                </button>
                <template v-if="catalogGroupExpanded(group.name)">
                  <p class="mcp-hint mcp-action-desc">{{ group.description }}</p>
                  <div class="mcp-tool-pick-items">
                    <button v-for="action in group.actions" :key="action.action" type="button" class="mcp-tool-action"
                      @click="selectTool(action.legacy)">
                      <code>{{ action.action }}</code>
                      <span class="mcp-muted">{{ action.legacy }}</span>
                    </button>
                  </div>
                </template>
              </section>
              <p v-if="!filteredActionCatalog.length" class="mcp-empty">没有匹配的 action。</p>
            </div>
            <div v-else class="mcp-tools">
              <template v-for="group in filteredToolGroups" :key="group.id">
                <div class="mcp-tool-group"><span>{{ group.label }}</span><em>{{ group.tools.length }}</em></div>
                <button v-for="tool in group.tools" :key="tool.name" type="button" class="mcp-tool"
                  :class="{ active: selected === tool.name }" @click="selectTool(tool.name)">
                  <code>{{ tool.name }}</code>
                  <span class="mcp-tool-line"><span class="mcp-kind" :class="toolKindClass(tool.name)">{{ toolKind(tool.name) }}</span><span v-if="isDestructive(tool.name)" class="mcp-kind destroy">破坏性</span><span v-if="serverMode && MCP_ADMIN_ONLY_TOOLS.includes(tool.name)" class="mcp-kind admin">仅 ADMIN</span>{{ tool.description }}</span>
                </button>
              </template>
              <p v-if="!filteredToolGroups.length" class="mcp-empty">没有匹配的工具；清空搜索或切换分类。</p>
            </div>
            <button type="button" class="btn ghost xs mcp-copy" @click="copyTools">复制工具 JSON</button>
            <button type="button" class="btn ghost xs mcp-copy" @click="copyProtocolCatalog">复制协议清单</button>
            <label v-if="isBrowserMode" class="mcp-check mcp-write-toggle">
              <input v-model="browserWrite" type="checkbox" @change="toggleBrowserWrite" />
              允许页面内写工具
              <span class="mcp-muted">默认关闭；打开后 Agent 可用当前 ES 账号执行写入</span>
            </label>
            <button v-if="isBrowserMode" type="button" class="btn ghost xs mcp-copy" @click="exportLocalConfig">
              导出 Node MCP 配置
            </button>
            <p v-if="isBrowserMode" class="mcp-hint">导出文件含本机连接凭据，仅用于本机 Node MCP；保存到受限目录。</p>
          </section>
        <section class="mcp-card mcp-play">
          <div class="mcp-play-head">
            <div>
              <h3>工具试跑</h3>
              <p class="mcp-play-sub">按工具 schema 填参，直接走真实 MCP 端点；凭证只驻留在本页内存。</p>
              <label class="mcp-check mcp-play-group-toggle">
                <input v-model="trialAsGroup" type="checkbox" />
                以 action 组调用（客户端视图）
                <span v-if="trialAsGroup && groupCallForLegacy" class="mcp-muted">
                  → {{ groupCallForLegacy.group }} / {{ groupCallForLegacy.action }}
                </span>
              </label>
            </div>
            <div v-if="!isBrowserMode && !isDemoMode" class="mcp-play-auth"
              :class="{ ready: credentialState === 'valid', invalid: credentialState === 'invalid' }">
              <span class="mcp-auth-dot" aria-hidden="true"></span>
              <input v-model="serverToken" type="password" class="mcp-filter" autocomplete="new-password" name="esq-mcp-service-token" spellcheck="false"
                placeholder="服务端 MCP key / service token" aria-label="服务端 MCP 凭证" />
              <em>{{ credentialLabel }}</em>
              <button v-if="serverToken.trim() && credentialState !== 'valid'" type="button"
                class="mcp-link-btn mcp-cred-check" :disabled="credentialState === 'checking'"
                @click="validateServerToken">{{ credentialState === 'checking' ? '验证中…' : '验证' }}</button>
            </div>
          </div>
          <div v-if="serverMode && activeKeyOptions.length" class="mcp-play-keyline">
            <span class="mcp-field-label">试跑身份</span>
            <n-select v-model:value="trialKeyId" :options="activeKeyOptions" size="small" filterable clearable
              class="mcp-filter-select mcp-trial-key-select" placeholder="从已签发 key 带入"
              aria-label="选择试跑密钥" @update:value="onTrialKeyChange" />
            <span v-if="trialKeyScope" class="mcp-scope-chip" :class="{ write: trialKeyWrite }">{{ trialKeyScope }}</span>
            <span class="mcp-muted">{{ trialKeyScope ? '按该 key 的真实权限执行' : '也可以直接填 service token' }}</span>
          </div>
          <p v-if="!isBrowserMode && !isDemoMode && credentialHint" class="mcp-cred-error">{{ credentialHint }}</p>
          <div class="mcp-play-row">
            <n-select v-model:value="selected" :options="toolPickerOptions" filterable size="small"
              class="mcp-tool-select" placeholder="选择 MCP 工具" aria-label="选择 MCP 工具" />
            <span v-if="selectedTool" class="mcp-tool-kind" :class="MCP_WRITE_TOOLS.includes(selected) ? 'write' : 'read'">
              {{ MCP_WRITE_TOOLS.includes(selected) ? '写' : '只读' }}
            </span>
            <span v-if="selectedTool && MCP_ADMIN_ONLY_TOOLS.includes(selected)" class="mcp-tool-kind admin">仅 ADMIN</span>
            <button type="button" class="mcp-link-btn mcp-json-toggle" @click="toggleToolJson">
              {{ toolJsonMode ? '表单模式' : 'JSON 模式' }}
            </button>
          </div>
          <p v-if="selectedTool" class="mcp-tool-desc">{{ selectedTool.description }}</p>
          <div class="mcp-play-grid">
            <div class="mcp-play-form">
              <template v-if="toolJsonMode">
                <textarea v-model="argsText" class="mcp-args" spellcheck="false" aria-label="MCP 工具参数 JSON"></textarea>
                <p v-if="toolJsonModeError || toolJsonModeErrorText" class="mcp-field-error">{{ toolJsonModeError || toolJsonModeErrorText }}</p>
              </template>
              <template v-else>
                <p v-if="!orderedToolFields.length" class="mcp-empty mcp-no-args">该工具不需要参数，直接运行即可。</p>
                <div v-else class="mcp-fields">
                  <label v-for="field in orderedToolFields" :key="field.key" class="mcp-field"
                    :class="{ required: field.required, invalid: !!toolFieldErrors[field.key] }">
                    <span class="mcp-field-head">
                      <b>{{ field.key }}</b>
                      <em v-if="field.required">必填</em>
                      <code>{{ field.type }}</code>
                      <span v-if="field.description" class="mcp-field-desc">{{ field.description }}</span>
                    </span>
                    <n-select v-if="field.enum.length" v-model:value="toolArgs[field.key]" :options="enumOptions(field.enum)"
                      size="small" class="mcp-field-select" :aria-label="field.key" />
                    <textarea v-else-if="field.type === 'object' || field.type === 'array'"
                      v-model="toolDrafts[field.key]" class="mcp-field-input mcp-field-json" spellcheck="false"
                      :aria-label="field.key" :placeholder="field.placeholder"></textarea>
                    <span v-else-if="field.type === 'boolean'" class="mcp-field-check">
                      <input :checked="toolArgs[field.key] === true" type="checkbox" :aria-label="field.key"
                        @change="setToolBoolean(field.key, $event)" />
                      <span>启用</span>
                    </span>
                    <input v-else v-model="toolArgs[field.key]" class="mcp-field-input"
                      :type="field.type === 'integer' || field.type === 'number' ? 'number' : 'text'"
                      :aria-label="field.key" :placeholder="field.placeholder" />
                    <span v-if="toolFieldErrors[field.key]" class="mcp-field-error">{{ toolFieldErrors[field.key] }}</span>
                  </label>
                </div>
              </template>
              <div class="mcp-play-actions">
                <button type="button" class="btn primary sm"
                  :disabled="!toolCanRun" :title="toolRunBlockedReason" @click="runTool">
                  {{ running ? '执行中…' : '运行工具' }}
                </button>
                <button type="button" class="btn ghost xs" @click="resetToolArgs">清空</button>
                <span class="mcp-muted">{{ toolRequiredFilled }}/{{ requiredKeys.length }} 必填
                  <template v-if="orderedToolFields.length"> · {{ orderedToolFields.length }} 参数</template>
                </span>
              </div>
            </div>
            <div class="mcp-play-result">
              <div class="mcp-result-head">
                <span>响应</span>
                <span v-if="toolResultMeta" class="mcp-result-status" :class="toolResultMeta.ok ? 'ok' : 'fail'">
                  {{ toolResultMeta.ok ? '成功' : '失败' }}<template v-if="toolResultMeta.ms != null"> · {{ toolResultMeta.ms }}ms</template>
                </span>
                <button v-if="resultText" type="button" class="mcp-link-btn mcp-result-copy" @click="copyResult">
                  {{ resultCopied ? '已复制' : '复制' }}
                </button>
              </div>
              <pre v-if="resultText" class="mcp-result mcp-result-play">{{ resultText }}</pre>
              <p v-else class="mcp-empty mcp-result-empty">运行后在右侧查看响应。</p>
            </div>
          </div>
        </section>

              </div>
        <section class="mcp-card mcp-protocol">
          <div class="mcp-protocol-head">
            <h3>资源与提示词</h3>
            <span class="mcp-muted">{{ MCP_STATIC_RESOURCES.length + MCP_RESOURCE_TEMPLATES.length + 1 }} 个资源（含 1 个 MCP App）· {{ MCP_PROMPTS.length }} 个引导提示词</span>
            <span v-if="!isBrowserMode" class="mcp-muted">SSE 兼容：<code>{{ sseEndpoint }}</code></span>
          </div>
          <div class="mcp-protocol-grid">
            <div class="mcp-protocol-col">
              <span class="mcp-field-label">只读资源（resources/list）</span>
              <button v-for="r in resourceCatalog" :key="r.uri" type="button" class="mcp-resource"
                :title="r.app ? '读取 MCP Apps HTML 资源' : (r.template ? '填写模板参数并读取' : '读取资源')" @click="openResource(r)">
                <code>{{ r.uri }}</code>
                <span>{{ selectedResource?.uri === r.uri ? '正在读取' : r.title }}</span>
                <em>{{ r.template ? '模板' : (r.app ? 'App' : '可读') }}</em>
              </button>
            </div>
            <div class="mcp-protocol-col">
              <span class="mcp-field-label">引导提示词（prompts/list）</span>
              <button v-for="p in MCP_PROMPTS" :key="p.name" type="button" class="mcp-resource"
                :title="'生成提示词：' + p.description" @click="openPrompt(p)">
                <code>{{ p.name }}</code>
                <span>{{ selectedPrompt?.name === p.name ? '正在填写参数' : p.title }}</span>
                <em>{{ p.arguments.filter(a => a.required).length }} 必填</em>
              </button>
            </div>
          </div>
          <datalist id="mcp-connection-choices">
            <option v-for="choice in connectionChoices" :key="choice.id" :value="choice.id">{{ choice.name }}</option>
          </datalist>
          <datalist id="mcp-index-choices">
            <option v-for="index in indexChoices" :key="index" :value="index" />
          </datalist>
          <div v-if="selectedResource" class="mcp-prompt-play">
            <div class="mcp-prompt-play-head">
              <strong>{{ selectedResource.title }}</strong>
              <span class="mcp-muted"><code>{{ selectedResource.uri }}</code></span>
              <button type="button" class="mcp-link-btn" @click="closeResource">收起</button>
            </div>
            <div v-if="resourceFields.length" class="mcp-prompt-form">
              <label v-for="field in resourceFields" :key="field">
                <span>{{ field }} <b>*</b></span>
                <input v-model="resourceArgs[field]" class="mcp-filter" :list="field === 'connection' ? 'mcp-connection-choices' : (['index', 'source', 'target'].includes(field) ? 'mcp-index-choices' : undefined)" :placeholder="'填写 ' + field" />
              </label>
            </div>
            <div class="mcp-prompt-actions">
              <button type="button" class="btn primary sm"
                :disabled="resourceRunning || resourceMissing.length > 0 || (!isBrowserMode && !serverToken.trim())"
                @click="runResource">
                {{ resourceRunning ? '读取中…' : '读取资源' }}
              </button>
              <span v-if="resourceMissing.length" class="mcp-muted">缺少：{{ resourceMissing.join(', ') }}</span>
              <span v-else-if="!isBrowserMode && !serverToken.trim()" class="mcp-muted">先填入服务端 key</span>
              <button v-if="resourceResult" type="button" class="btn ghost xs" @click="copyResourceResult">
                {{ resourceCopied ? '已复制' : '复制结果' }}
              </button>
            </div>
            <div v-if="resourceError" class="mcp-error">{{ resourceError }}</div>
            <pre v-if="resourceResult" class="mcp-result mcp-prompt-result">{{ resourceResult }}</pre>
          </div>
          <div v-if="selectedPrompt" class="mcp-prompt-play">
            <div class="mcp-prompt-play-head">
              <strong>{{ selectedPrompt.title }}</strong>
              <span class="mcp-muted">{{ selectedPrompt.description }}</span>
              <button type="button" class="mcp-link-btn" @click="closePrompt">收起</button>
            </div>
            <div class="mcp-prompt-form">
              <label v-for="arg in selectedPrompt.arguments" :key="arg.name">
                <span>{{ arg.name }}<b v-if="arg.required"> *</b></span>
                <input v-model="promptArgs[arg.name]" class="mcp-filter" :list="arg.name === 'connection' ? 'mcp-connection-choices' : (['index', 'source', 'target'].includes(arg.name) ? 'mcp-index-choices' : undefined)" :placeholder="arg.description" />
              </label>
            </div>
            <div class="mcp-prompt-actions">
              <button type="button" class="btn primary sm"
                :disabled="promptRunning || promptMissing.length > 0 || (!isBrowserMode && !serverToken.trim())"
                @click="runPrompt">
                {{ promptRunning ? '生成中…' : '生成提示词' }}
              </button>
              <span v-if="promptMissing.length" class="mcp-muted">缺少必填：{{ promptMissing.join(', ') }}</span>
              <span v-else-if="!isBrowserMode && !serverToken.trim()" class="mcp-muted">先填入服务端 key</span>
              <button v-if="promptResult" type="button" class="btn ghost xs" @click="copyPromptResult">
                {{ promptCopied ? '已复制' : '复制提示词' }}
              </button>
            </div>
            <div v-if="promptError" class="mcp-error">{{ promptError }}</div>
            <pre v-if="promptResult" class="mcp-result mcp-prompt-result">{{ promptResult }}</pre>
          </div>
          <p class="mcp-hint">资源只受连接 read 权限约束；<code>resources/read</code> 按一次请求计量（列出资源与提示词不计）。提示词是可直接交给模型的取证步骤；点击提示词可填写参数并真实调用 <code>prompts/get</code>。浏览器模式只读当前激活连接，切换连接请用顶栏目标选择器。</p>
        </section>


            </template>


      <template v-else-if="tab === 'clients'">
        <div v-if="clientKeyNotice" class="mcp-key-notice" role="status">{{ clientKeyNotice }}</div>
        <p v-if="!serverMode" class="mcp-hint mcp-clients-boundary">浏览器/演示模式没有可被外部进程连接的 HTTP 端点；下列服务端客户端配置仅供参考，页面内 Agent 请直接使用 <code>window.ESQueryStudioMCP</code>。</p>
        <section class="mcp-card mcp-onboard">
          <div class="mcp-onboard-head">
            <h3>客户端接入配置</h3>
            <span class="mcp-muted">{{ onboardingClientCount }} 个客户端 · {{ onboardingClients.length }} 种接入配置</span>
          </div>
          <div class="mcp-onboard-steps" aria-label="客户端接入步骤">
            <div class="mcp-onboard-step done">
              <span>1</span>
              <div><b>选择客户端</b><small>{{ onboardingClientLabel }}</small></div>
            </div>
            <div class="mcp-onboard-step" :class="{ done: !serverMode || clientKeyReady }">
              <span>2</span>
              <div><b>带入密钥</b><small>{{ !serverMode ? '页面桥使用当前连接身份' : clientKeyReady ? '完整 key 已带入' : '选择一把可复制的 key' }}</small></div>
            </div>
            <div class="mcp-onboard-step" :class="{ done: onboardingCopied || onboardingTest?.ok }">
              <span>3</span>
              <div><b>复制并验证</b><small>{{ onboardingTest?.ok ? '端点测试通过' : onboardingCopied ? '配置已复制' : '复制配置或测试端点' }}</small></div>
            </div>
          </div>
          <div class="mcp-client-workbench">
            <aside class="mcp-client-picker">
              <div class="mcp-client-toolbar">
                <input v-model="clientQuery" class="mcp-filter" placeholder="搜索客户端 / CLI / 配置方式" aria-label="搜索 MCP 客户端" @keydown.esc.prevent="clientQuery = ''" />
                <span class="mcp-muted">{{ visibleOnboardingClients.length }} / {{ onboardingClients.length }}</span>
              </div>
              <div class="mcp-client-matrix mcp-client-chips" role="group" aria-label="选择 MCP 客户端">
                <button v-for="client in visibleOnboardingClients" :key="client.id" type="button"
                  class="mcp-client-chip mcp-client-tile" :class="{ active: onboardingClient === client.id }"
                  :aria-pressed="onboardingClient === client.id" @click="onboardingClient = client.id">
                  <span class="mcp-client-tile-mark" aria-hidden="true">{{ client.label.slice(0, 1) }}</span>
                  <span class="mcp-client-tile-copy"><b>{{ client.label }}</b><small>{{ onboardingKind(client.id) }}</small></span>
                  <em v-if="onboardingClient === client.id">已选</em>
                </button>
              </div>
            </aside>

            <div class="mcp-client-detail">
              <div class="mcp-client-detail-head">
                <div>
                  <span class="mcp-eyebrow">SELECTED CLIENT</span>
                  <h3>{{ onboardingClientLabel }}</h3>
                </div>
                <span class="mcp-contract-badge">{{ onboardingKind(onboardingClient) }}</span>
              </div>
              <p class="mcp-client-note">{{ onboardingClientNote }}</p>
              <div v-if="serverMode" class="mcp-client-keyline">
                <span class="mcp-field-label">接入 key</span>
                <n-select v-model:value="clientKeyId" :options="clientKeyOptions" size="small" filterable clearable
                  class="mcp-client-key-select" placeholder="选择 key 以带入完整配置" aria-label="选择接入 key"
                  @update:value="onClientKeyChange" />
                <span v-if="clientKeyScope" class="mcp-scope-chip" :class="{ write: clientKeyWrite }">{{ clientKeyScope }}</span>
                <span v-if="clientKeyReady" class="mcp-key-ready">完整 key 已带入</span>
                <button v-else-if="clientKeySelected" type="button" class="btn primary xs" @click="generateClientKey">轮换并带入</button>
                <span v-else class="mcp-muted">也可以从密钥页点「接入配置」直接带入。</span>
              </div>
              <div class="mcp-transport-toggle" role="group" aria-label="MCP 传输方式">
                <button type="button" class="mcp-client-chip" :class="{ active: onboardingTransport === 'http' }"
                  :aria-pressed="onboardingTransport === 'http'" @click="onboardingTransport = 'http'">Streamable HTTP</button>
                <button type="button" class="mcp-client-chip" :class="{ active: onboardingTransport === 'sse' }"
                  :aria-pressed="onboardingTransport === 'sse'" @click="onboardingTransport = 'sse'">SSE 兼容</button>
                <span class="mcp-muted">{{ onboardingTransport === 'sse' ? '旧客户端只支持 SSE 时使用 /mcp/sse' : '推荐；新客户端默认 Streamable HTTP' }}</span>
              </div>
              <div class="mcp-transport-toggle mcp-surface-toggle" role="group" aria-label="客户端工具面">
                <button type="button" class="mcp-client-chip" :class="{ active: onboardingSurface === 'compact' }"
                  :aria-pressed="onboardingSurface === 'compact'" @click="onboardingSurface = 'compact'">精简工具面（推荐 GUI）</button>
                <button type="button" class="mcp-client-chip" :class="{ active: onboardingSurface === 'full' }"
                  :aria-pressed="onboardingSurface === 'full'" @click="onboardingSurface = 'full'">完整工具面</button>
                <span class="mcp-muted">精简：<code>15 组工具 · 0 资源 · 0 prompts</code>，CodeBuddy / WorkBuddy 保留全部工具，只去掉资源/prompts 列表；完整面另含 10 资源 + 5 prompts。</span>
              </div>
              <label v-if="!['local', 'stdio', 'browser', 'deepseek-harness'].includes(onboardingClient)" class="mcp-check mcp-onboarding-local">
                <input v-model="onboardingLocal" type="checkbox" />
                通过本地 Node 直连（stdio，不经服务端 /mcp）
              </label>
              <div class="mcp-client-head">
                <button type="button" class="btn primary sm" @click="copyOnboardingConfig">{{ onboardingCopied ? '已复制' : '复制配置' }}</button>
                <button type="button" class="btn ghost sm" :disabled="onboardingTesting" @click="testOnboarding">{{ onboardingTesting ? '测试中…' : '测试配置' }}</button>
                <button type="button" class="btn ghost sm" @click="downloadOnboardingConfig">下载配置</button>
                <button v-if="onboardingInstallCommand" type="button" class="btn ghost sm" @click="copyOnboardingInstall">{{ installCopied ? '已复制' : '复制安装命令' }}</button>
                <button type="button" class="btn ghost sm" @click="copyDetectCommand">{{ detectCopied ? '已复制' : '复制检测命令' }}</button>
              </div>
              <div v-if="onboardingTest" class="mcp-client-test" :class="{ bad: !onboardingTest.ok }" role="status">
                <b>{{ onboardingTest.ok ? '配置可用' : '配置未通过' }}</b>
                <span v-if="onboardingTest.ok">{{ onboardingTest.protocol }} · {{ onboardingTest.serverName }} {{ onboardingTest.serverVersion }} · {{ onboardingTest.tools }} 工具 · {{ onboardingTest.ms }}ms</span>
                <span v-else>{{ onboardingTest.message }}</span>
                <small v-if="onboardingTest.ok && onboardingTest.note">{{ onboardingTest.note }}</small>
              </div>
              <pre class="mcp-code mcp-client-code">{{ onboardingConfig }}</pre>
              <p class="mcp-hint">CLI 客户端可在仓库内执行 <code>node mcp/esquerystudio-mcp-cli.mjs install --client &lt;id&gt;</code> 自动写入配置，<code>install --client &lt;id&gt; --local</code> 则把本地 Node 直连桥写入 Agent 的 stdio 配置；<code>detect</code> 识别本机已装客户端。HTTP / stdio 需把占位符换成面板签发的 key；本地 Node 可先 <code>cd mcp && npm install -g .</code>，浏览器模式使用页面内桥。</p>
              <div class="mcp-troubleshoot">
                <div class="mcp-troubleshoot-head">
                  <b>客户端连不上？先核对三件事</b>
                  <button type="button" class="btn ghost xs" @click="copyAndFlash(onboardingUrl, '完整端点已复制')">复制完整端点</button>
                </div>
                <ol>
                  <li><code class="mcp-troubleshoot-url">{{ onboardingUrl }}</code> 必须带宿主 context-path（例如 <code>/quotehub/mcp</code>）。报 <code>Unexpected token '&lt;'</code> 说明请求打到了网页或 404，不是 MCP 端点。</li>
                  <li>报 <code>401 / MCP_KEY_REVOKED</code>：key 已撤销或已轮换，旧 key 立即失效；回「密钥」页轮换后复制新 key。列表里的前缀不是完整 key。</li>
                  <li>WorkBuddy 写 <code>~/.workbuddy/mcp.json</code> 的 <code>mcpServers</code>，<code>type</code> 用 <code>http</code>；只支持 SSE 时把地址换成 <code>{{ sseEndpoint }}</code>。</li>
                </ol>
              </div>
              <div class="mcp-dbx-note">
                <span class="mcp-eyebrow">DBX · MCP SERVER, NOT CLIENT</span>
                <p>DBX 0.6+ 把自己的数据库连接作为 MCP server 暴露给 AI 客户端，<b>不消费外部 MCP server</b>；它不能直接接入本端点。若同一个 Agent 要同时用 DBX 与本面板，请在 Agent 配置里并列注册两个 server；DBX 侧可用 <code>dbx agent setup</code> 安装官方 Agent Skill。</p>
              </div>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="tab === 'audit'">
        <div class="mcp-audit-kpis">
          <div><span class="mcp-eyebrow">CALLS</span><b>{{ auditCalls.length }}</b><em>持久化留档 · 保留 {{ auditRetentionDays }} 天</em></div>
          <div><span class="mcp-eyebrow">FAILED</span><b :class="{ warn: auditFailedCount > 0 }">{{ auditFailedCount }}</b><em>失败次数</em></div>
          <div><span class="mcp-eyebrow">SUCCESS</span><b>{{ auditSuccessRate == null ? '—' : auditSuccessRate + '%' }}</b><em>成功率</em></div>
          <div><span class="mcp-eyebrow">IPS</span><b>{{ auditIpCount }}</b><em>来源地址</em></div>
          <div><span class="mcp-eyebrow">LAST</span><b>{{ auditCalls[0] ? fmtTime(auditCalls[0].at) : '—' }}</b><em>最近调用</em></div>
        </div>
        <div class="mcp-audit-toolbar">
          <input v-model="auditQuery" class="mcp-filter" placeholder="搜索工具 / method / IP / requestId" aria-label="搜索审计记录" />
          <n-select v-model:value="auditKey" :options="auditKeyOptions" size="small" class="mcp-filter-select mcp-audit-key-filter" aria-label="筛选审计密钥" />
          <n-select v-model:value="auditWindow" :options="auditWindowOptions" size="small" class="mcp-filter-select mcp-audit-window-filter" aria-label="筛选审计时间" />
          <n-select v-model:value="auditStatus" :options="auditStatusOptions" size="small" class="mcp-filter-select" aria-label="筛选审计状态" />
          <n-select v-model:value="auditTransport" :options="auditTransportOptions" size="small" class="mcp-filter-select" aria-label="筛选传输来源" />
          <button type="button" class="mcp-live-toggle" :class="{ on: auditLive }" :aria-pressed="auditLive" @click="toggleAuditLive">
            <span class="mcp-live-dot" :class="{ browser: !auditLive }" aria-hidden="true" />
            {{ auditLive ? '实时中' : '实时' }}
          </button>
          <button type="button" class="btn ghost sm" :disabled="auditLoading" @click="loadAuditCalls">
            {{ auditLoading ? '刷新中…' : '刷新' }}
          </button>
          <button type="button" class="btn ghost sm" :disabled="!filteredAuditCalls.length" @click="exportAuditCsv">导出 CSV</button>
          <span v-if="auditQuery.trim() || auditKey !== 'all' || auditWindow !== 'all'" class="mcp-audit-filter">
            筛选：<code>{{ auditQuery || (auditKey !== 'all' ? auditKey : auditWindow) }}</code>
            <button type="button" class="mcp-link-btn" @click="auditQuery = ''; auditKey = 'all'; auditWindow = 'all'">清空</button>
          </span>
        </div>
        <p v-if="auditErr" class="mcp-error mcp-audit-error" role="alert">{{ auditErr }}</p>
        <p class="mcp-audit-scroll-hint">左右滑动表格可查看全部 9 列。</p>
        <div class="mcp-audit-table-wrap">
          <table class="mcp-audit-table">
            <thead><tr><th>时间</th><th>KEY</th><th>方法 / 工具</th><th>状态</th><th>来源</th><th>IP / 主机</th><th>UA / HTTP</th><th>耗时</th><th>requestId</th></tr></thead>
            <tbody>
              <template v-for="(call, index) in filteredAuditCalls" :key="index">
                <tr class="mcp-audit-row" :class="{ open: auditDetailIndex === index }" tabindex="0" role="button"
                  :aria-expanded="auditDetailIndex === index"
                  @click="toggleAuditDetail(index)" @keydown.enter.prevent="toggleAuditDetail(index)" @keydown.space.prevent="toggleAuditDetail(index)">
                  <td class="v-num">{{ fmtTime(call.at) }}</td>
                  <td><strong class="mcp-audit-key">{{ call.keyName || '—' }}</strong><span class="mcp-muted">{{ call.keyPrefix || '' }}</span></td>
                  <td><code>{{ call.method || call.tool }}</code><span v-if="call.tool && call.tool !== call.method" class="mcp-audit-tool">{{ call.tool }}</span></td>
                  <td><span class="mcp-state" :class="call.ok === false ? 'revoked' : 'active'">{{ call.ok === false ? '失败' : '成功' }}</span></td>
                  <td><span class="mcp-transport" :class="'t-' + (call.transport || (call.origin ? 'browser' : call.pid ? 'stdio' : 'http'))">{{ call.transport || (call.origin ? 'browser' : call.pid ? 'stdio' : 'http') }}</span></td>
                  <td><code>{{ call.ip || call.host || '—' }}</code><span v-if="call.remoteIp" class="mcp-muted"> / {{ call.remoteIp }}</span></td>
                  <td><span class="mcp-audit-ua">{{ call.ua || '—' }}</span><span class="mcp-muted">{{ call.http || '' }}</span></td>
                  <td class="v-num">{{ call.ms != null ? call.ms + 'ms' : '—' }}</td>
                  <td><button v-if="call.requestId" type="button" class="mcp-link-btn mcp-audit-rid" @click.stop="copyProtocolValue(call.requestId)">{{ copiedValue === call.requestId ? '已复制' : call.requestId }}</button><span v-else>—</span></td>
                </tr>
                <tr v-if="auditDetailIndex === index" class="mcp-audit-detail-row">
                  <td colspan="9">
                    <div class="mcp-audit-detail">
                      <div><span>requestId</span><code>{{ call.requestId || '—' }}</code></div>
                      <div><span>transport</span><code>{{ call.transport || (call.origin ? 'browser' : call.pid ? 'stdio' : 'http') }}</code></div>
                      <div><span>origin</span><code>{{ call.origin || '—' }}</code></div>
                      <div><span>HTTP</span><code>{{ call.http || '—' }}</code></div>
                      <div><span>UA</span><code>{{ call.ua || '—' }}</code></div>
                      <div><span>主机</span><code>{{ call.host || call.remoteIp || '—' }}{{ call.pid ? ' · pid ' + call.pid : '' }}</code></div>
                      <div class="mcp-audit-detail-actions">
                        <button type="button" class="btn ghost xs" @click.stop="copyAuditBundle(call)">复制排障包</button>
                        <button v-if="call.keyPrefix" type="button" class="btn ghost xs" @click.stop="openKeyForAudit(call)">定位密钥</button>
                        <button type="button" class="btn ghost xs" @click.stop="copyAuditCall(call)">复制整条 JSON</button>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <p v-if="!filteredAuditCalls.length" class="mcp-empty">
            <template v-if="auditQuery.trim()">没有匹配「{{ auditQuery }}」的调用记录；该 key 可能还没有实际调用。</template>
            <template v-else>没有调用记录。先到工具目录试跑一次，或让 Agent 连接后发起调用。</template>
            <button v-if="!auditCalls.length" type="button" class="btn ghost xs" @click="tab = 'tools'">去工具目录</button>
          </p>
        </div>
        <p class="mcp-hint">服务端每次调用独立留档，默认保留 30 天（最低 7 天）；浏览器桥 localStorage 保留 30 天；本地 Node 追加 `~/.esquerystudio/mcp-audit.jsonl`，以 origin / pid·host 替代网络 IP，不伪造远端地址。</p>
      </template>

      <template v-else>
        <div v-if="!serverMode" class="mcp-card mcp-boundary">
          <h3>API key 只在服务端模式生效</h3>
          <p class="mcp-hint">浏览器标签页没有可被外部进程连接的 TCP 端点，页面内 Agent 直接调用 <code>window.ESQueryStudioMCP</code>，走当前浏览器连接档案和 ES 原生账号权限，不需要签发 HTTP key。</p>
          <p class="mcp-hint">演示站不生成真实密钥，也不连接任何 Elasticsearch。需要密钥、频率限制和用量记录时，请部署服务端模式。</p>
        </div>

        <template v-else>
          <div class="mcp-key-head">
            <div>
              <h3>MCP 密钥</h3>
              <p class="mcp-hint mcp-key-copy-hint">key 绑定签发登录人与角色；完整明文仅签发/轮换时显示一次；AES-256-GCM 密文保存，owner/ADMIN 可随时复制；旧 key 首次复制会提示轮换。</p>
            </div>
            <div class="mcp-key-actions">
              <button v-if="keys.length" type="button" class="btn ghost sm" @click="exportUsageCsv"
                title="导出当前筛选结果为 CSV">导出用量</button>
              <button v-if="keys.length" type="button" class="btn ghost sm" @click="exportDailyLedgerCsv"
                title="按日展开当前筛选 key 的每日请求数">导出日账</button>
              <button type="button" class="btn ghost sm" :disabled="keyLoading" @click="loadKeys">
                {{ keyLoading ? '刷新中…' : '刷新' }}
              </button>
              <button v-if="canCreate" type="button" class="btn primary sm" data-test="mcp-create-key"
                @click="toggleCreate">
                {{ showCreate ? '收起' : '签发密钥' }}
              </button>
            </div>
          </div>

          <div class="mcp-kpis">
            <span>共 <b>{{ keys.length }}</b> 把</span>
            <span>启用 <b>{{ totals.active }}</b></span>
            <span>今日请求 <b>{{ totals.today }}</b></span>
            <span>本月请求 <b>{{ totals.month }}</b></span>
            <span v-if="nearQuota">即将耗尽 <b class="warn">{{ nearQuota }}</b></span>
            <span v-if="keyMeta.caller">当前身份 <b>{{ keyMeta.caller.username }} · {{ keyMeta.caller.role }}</b></span>
          </div>

          <div v-if="keys.length" class="mcp-billing">
            <div class="mcp-billing-head">
              <span class="mcp-field-label">近 7 天用量账本</span>
              <span class="mcp-muted">合计 {{ billingTotal }} 次 · UTC 日 · 当前筛选 {{ filteredKeys.length }} 把 key</span>
            </div>
            <div class="mcp-billing-days">
              <div v-for="day in billingDays" :key="day.key" class="mcp-billing-day"
                :title="day.key + ' · ' + day.total + ' 次 / ' + day.keys + ' 把 key'">
                <b>{{ day.total }}</b>
                <span class="mcp-billing-bar"><i :class="{ zero: !day.total }" :style="{ height: day.height + '%' }" /></span>
                <em>{{ day.label }}</em>
              </div>
            </div>
          </div>

          <div v-if="keys.length" class="mcp-key-filters">
            <input v-model="keyQuery" class="mcp-filter" placeholder="搜索名称 / 前缀 / 归属" aria-label="搜索 MCP 密钥" />
            <n-select v-model:value="keyStatus" :options="keyStatusOptions" size="small" class="mcp-filter-select" aria-label="筛选 MCP 密钥状态" />
            <n-select v-model:value="keyRoleFilter" :options="keyRoleOptions" size="small" class="mcp-filter-select" aria-label="筛选 MCP 密钥角色" />
            <n-select v-model:value="keySort" :options="keySortOptions" size="small" class="mcp-filter-select" aria-label="排序 MCP 密钥" />
          </div>

          <div v-if="keyErr" class="mcp-error">{{ keyErr }}</div>

          <section v-if="showCreate" ref="createSectionRef" class="mcp-create">
            <h3>{{ editingId ? '编辑 key' : '签发新 key' }}</h3>
            <div v-if="!editingId" class="mcp-presets">
              <span class="mcp-field-label">快速预设</span>
              <button type="button" class="btn ghost xs" @click="applyPreset('readonly')">只读分析</button>
              <button type="button" class="btn ghost xs" @click="applyPreset('qa-write')">QA/UAT 可写</button>
              <button type="button" class="btn ghost xs" @click="applyPreset('bulk')">批量写入</button>
            </div>
            <div class="mcp-issue-ledger" aria-label="签发结果预览">
              <div><span>身份</span><b>{{ form.owner.trim() || auth.me?.username || '本人' }}</b><em>key 角色 {{ form.role }}</em></div>
              <div><span>连接</span><b>{{ form.connections.length }} 个</b><em>{{ form.connections.map(id => connectionLabel(id)).join(' · ') || '未选择' }}</em></div>
              <div :class="{ warn: form.writeConnections.length > 0 }"><span>写权限</span><b>{{ form.writeConnections.length }} 个连接</b><em>{{ form.writeConnections.map(id => connectionLabel(id)).join(' · ') || '全部只读' }}</em></div>
              <div :class="{ warn: form.allowedTools.length > 80 }"><span>工具面</span><b>{{ form.allowedTools.length }} 个</b><em>{{ form.allowedTools.length > 80 ? '超过 80 个客户端上限' : '客户端一次可加载' }}</em></div>
            </div>
            <div class="mcp-form-grid">
              <label class="mcp-field"><span>名称</span>
                <input v-model="form.name" maxlength="80" placeholder="例如 ci-agent / analyst-readonly" />
              </label>
              <label v-if="viewerIsAdmin && !editingId" class="mcp-field"><span>归属用户</span>
                <input v-model="form.owner" list="mcp-owner-options" placeholder="留空=自己" />
                <datalist id="mcp-owner-options">
                  <option v-for="u in ownerOptions" :key="u.username" :value="u.username">{{ u.role }}</option>
                </datalist>
                <span v-if="ownerRoleWarning" class="mcp-hint mcp-role-warning">{{ ownerRoleWarning }}</span>
                <span v-else-if="ownerScopeHint" class="mcp-hint" :class="{ 'mcp-role-warning': !!ownerScopeError }">{{ ownerScopeHint }}</span>
                <span v-else-if="ownerRoleHint" class="mcp-hint">{{ ownerRoleHint }}</span>
              </label>
              <label v-if="viewerIsAdmin && !editingId" class="mcp-field"><span>角色</span>
                <n-select v-model:value="form.role" :options="roleSelectOptions" size="small" class="mcp-field-select" />
              </label>
              <label class="mcp-field"><span>每分钟请求</span>
                <input v-model.number="form.requestsPerMinute" type="number" min="1" :max="limits.maxRequestsPerMinute" />
              </label>
              <label class="mcp-field"><span>每日配额</span>
                <input v-model.number="form.dailyQuota" type="number" min="1" :max="limits.maxDailyQuota" />
              </label>
              <label class="mcp-field"><span>每月配额</span>
                <input v-model.number="form.monthlyQuota" type="number" min="1" :max="limits.maxMonthlyQuota" />
              </label>
              <label class="mcp-field"><span>有效期（天，0=不过期）</span>
                <input v-model.number="form.expiresInDays" type="number" min="0" :max="limits.maxExpiresInDays" />
              </label>
            </div>
            <p v-if="form.role === 'ADMIN'" class="mcp-hint mcp-role-warning">ADMIN 角色的 key 拥有全部连接写权限与系统管理工具；请仅在必要时签发。</p>
            <div v-if="availableConnections.length" class="mcp-scope-grid mcp-perm-matrix">
              <div class="mcp-perm-title">
                <span class="mcp-field-label">连接集合 / 写权限连接</span>
                <span class="mcp-muted">先勾连接=可读；再勾写=该连接 read + write；未勾写一律只读。</span>
              </div>
              <div class="mcp-perm-head" aria-hidden="true"><span>连接</span><span>读</span><span>写</span></div>
              <p v-if="delegatedOwnerSelected && ownerScopeLoading" class="mcp-hint">正在读取目标用户的实际角色、连接与写工具范围…</p>
              <label v-for="c in availableConnections" :key="c.id" class="mcp-perm-row"
                :class="{ on: form.connections.includes(c.id), readonly: !c.write, blocked: c.write && !canWriteConnection(c) }"
                :title="writeBlockReason(c)">
                <span class="mcp-perm-conn">
                  <input v-model="form.connections" type="checkbox" :value="c.id" :aria-label="'连接 ' + c.name" />
                  <span>{{ c.name }}</span><code>{{ c.id }}</code>
                </span>
                <span class="mcp-perm-cell"><em :class="{ on: form.connections.includes(c.id) }">{{ form.connections.includes(c.id) ? 'R' : '—' }}</em></span>
                <span class="mcp-perm-cell">
                  <template v-if="c.write && form.connections.includes(c.id) && canWriteConnection(c)">
                    <input v-model="form.writeConnections" type="checkbox" :value="c.id"
                      :aria-label="'写权限 ' + c.name" />
                    <em>可写</em>
                  </template>
                  <em v-else class="mcp-perm-na">{{ !form.connections.includes(c.id) ? '先勾读' : c.write ? '缺页面写权' : '只读' }}</em>
                </span>
              </label>
              <p class="mcp-hint">写选项只出现在当前身份真正可写、且覆盖已选写工具的连接上；后端按同一组页面写权复核。宿主连接与远程连接逐行独立。</p>
            </div>
            <div class="mcp-tool-picks">
              <div class="mcp-tool-picks-head">
                <span class="mcp-field-label">可用工具</span>
                <span class="mcp-muted">已选 {{ form.allowedTools.length }} / {{ selectableTools.length }}</span>
                <button type="button" class="mcp-link-btn mcp-key-group-all" @click="toggleAllKeyGroups">
                  {{ openKeyGroups.length ? '收起全部' : '展开全部' }}
                </button>
                <input v-model="toolPickQuery" class="mcp-filter" placeholder="筛选工具" aria-label="筛选可用工具" />
              </div>
              <div class="mcp-tool-packs" aria-label="工具包">
                <button v-for="pack in toolPackOptions" :key="pack.id" type="button" class="mcp-tool-pack"
                  :class="{ active: form.allowedTools.length === pack.tools.length && pack.tools.every(tool => form.allowedTools.includes(tool)) }"
                  :title="pack.description" @click="applyToolPack(pack.id)">
                  {{ pack.label }} <em>{{ pack.tools.length }}</em>
                </button>
                <span class="mcp-muted">工具包只改变本 key 可调用的工具，不改变连接读写权限。</span>
              </div>
              <p v-if="toolBudgetWarning" class="mcp-tool-budget" role="status">
                已选 {{ form.allowedTools.length }} 个工具，超过 WorkBuddy 等客户端的 80 个加载上限；建议改用「核心查询」包，或按域拆成多把 key。
              </p>
              <div v-if="!showLegacyTools" class="mcp-action-groups">
                <section v-for="group in actionGroups" :key="group.name"
                  class="mcp-tool-pick-group mcp-key-group" :class="{ open: keyGroupExpanded(group.name) }">
                  <header class="mcp-key-group-head">
                    <button type="button" class="mcp-key-group-toggle" :aria-expanded="keyGroupExpanded(group.name)"
                      @click="toggleKeyGroup(group.name)">
                      <span class="mcp-action-chevron" aria-hidden="true">›</span>
                      <span>{{ group.name }}</span>
                      <em>{{ group.selectedCount }} / {{ group.actions.length }} action</em>
                    </button>
                    <button type="button" class="mcp-link-btn" @click="toggleActionGroup(group)">
                      {{ actionGroupSelected(group) ? '清空' : '全选' }}
                    </button>
                  </header>
                  <template v-if="keyGroupExpanded(group.name)">
                    <p class="mcp-hint mcp-action-desc">{{ group.description }}</p>
                    <div class="mcp-tool-pick-items">
                      <label v-for="action in group.actions" :key="action.action" class="mcp-check">
                        <input v-model="form.allowedTools" type="checkbox" :value="action.legacy" />
                        <code>{{ action.action }}</code>
                        <span class="mcp-muted">{{ action.legacy }}</span>
                      </label>
                    </div>
                  </template>
                </section>
                <p v-if="!actionGroups.length" class="mcp-empty">没有匹配的可用 action。</p>
              </div>
              <label class="mcp-check mcp-legacy-toggle">
                <input v-model="showLegacyTools" type="checkbox" />
                显示 130 个兼容细粒度工具（高级/排障）
              </label>
              <div v-if="showLegacyTools" class="mcp-tool-pick-groups">
                <section v-for="group in selectableGroups" :key="group.id" class="mcp-tool-pick-group">
                  <header>
                    <span>{{ group.label }}</span><em>{{ group.tools.length }}</em>
                    <button type="button" class="mcp-link-btn" @click="toggleToolGroup(group)">
                      {{ groupSelected(group) ? '清空' : '全选' }}
                    </button>
                  </header>
                  <div class="mcp-tool-pick-items">
                    <label v-for="tool in group.tools" :key="tool" class="mcp-check">
                      <input v-model="form.allowedTools" type="checkbox" :value="tool" />
                      <code>{{ tool }}</code>
                      <span v-if="adminOnlyTools.includes(tool)" class="mcp-kind admin">仅 ADMIN</span>
                    </label>
                  </div>
                </section>
                <p v-if="!selectableGroups.length" class="mcp-empty">没有匹配的可用工具。</p>
              </div>
            </div>
            <p v-if="uncoveredWriteTools.length" class="mcp-tool-budget" role="status">
              已选写工具 {{ uncoveredWriteTools.join('、') }} 还没有勾选任何可写连接；请补勾对应连接，或取消这些写工具。
            </p>
            <p class="mcp-hint">当前角色的上限：{{ limits.maxRequestsPerMinute }} 次/分钟，日配额 {{ limits.maxDailyQuota }}，月配额 {{ limits.maxMonthlyQuota }}。</p>
            <div class="mcp-form-actions">
              <button type="button" class="btn primary sm"
                :disabled="creating || !form.name.trim() || !form.allowedTools.length || !form.connections.length || !form.permissions.length || !!ownerRoleWarning || !!uncoveredWriteTools.length || (delegatedOwnerSelected && (!ownerScope || ownerScopeLoading || !ownerScope.roleResolved))"
                @click="createKey">
                {{ creating ? (editingId ? '保存中…' : '创建中…') : (editingId ? '保存修改' : '创建 key') }}
              </button>
            </div>
          </section>

          <div v-if="!keys.length && !keyLoading && !showCreate" class="mcp-key-zero">
            <div class="mcp-zero-main">
              <span class="mcp-eyebrow">FIRST KEY / 最小权限</span>
              <h3>先签发一把 key，再把权限边界写清楚</h3>
              <p>key 绑定登录人、角色、连接读写与工具白名单。选一个用途开始；预设只组合已有权限，不会扩大你的实际授权。</p>
              <div class="mcp-zero-presets">
                <button v-for="preset in keyPresetCards" :key="preset.id" type="button" class="mcp-zero-preset"
                  :class="{ disabled: preset.disabled }" :disabled="preset.disabled" :title="preset.reason || ''"
                  @click="startKeyPreset(preset.id)">
                  <span class="mcp-zero-preset-top"><b>{{ preset.label }}</b><em>{{ preset.disabled ? '无写授权' : '按此签发' }}</em></span>
                  <span class="mcp-zero-preset-scope">{{ preset.scope }}</span>
                  <span class="mcp-zero-preset-tools">{{ preset.tools }}</span>
                  <small>{{ preset.note }}</small>
                </button>
              </div>
              <div class="mcp-zero-actions">
                <button v-if="canCreate" type="button" class="btn primary sm" @click="toggleCreate">自定义签发</button>
                <button type="button" class="btn ghost sm" @click="tab = 'clients'">先看客户端接入</button>
                <span v-if="!canCreate" class="mcp-muted">{{ createBlockedReason }}</span>
              </div>
            </div>
            <aside class="mcp-zero-model">
              <span class="mcp-eyebrow">PERMISSION MODEL</span>
              <h4>四层边界，逐层收窄</h4>
              <ol>
                <li><span>01</span><div><b>连接</b><small>未勾选的连接对这把 key 不可见</small></div></li>
                <li><span>02</span><div><b>读 / 写</b><small>逐连接授予；生产只读，QA/UAT 可写</small></div></li>
                <li><span>03</span><div><b>工具白名单</b><small>只暴露该 key 需要的 action</small></div></li>
                <li><span>04</span><div><b>调用审计</b><small>每次调用按 key / IP / requestId 留档 {{ auditRetentionDays }} 天</small></div></li>
              </ol>
            </aside>
          </div>

          <template v-else>
            <div class="mcp-key-workspace">
              <div class="mcp-key-ledger">
                <div v-if="filteredKeys.length" class="mcp-key-roster">
                  <article v-for="k in filteredKeys" :key="k.id" class="mcp-key-card" :class="statusClass(k)" :data-key-id="k.id"
                    tabindex="0" :aria-label="'查看密钥 ' + k.name" @click="selectKeyRow(k)"
                    @keydown.enter.prevent="selectKeyRow(k)" @keydown.space.prevent="selectKeyRow(k)">
                    <header class="mcp-key-card-head">
                      <div class="mcp-key-identity">
                        <span class="mcp-key-dot" aria-hidden="true"></span>
                        <div class="mcp-key-titlerow">
                          <strong>{{ k.name }}</strong>
                          <span class="mcp-key-state" :class="statusClass(k)">{{ statusText(k) }}</span>
                          <span class="mcp-key-role">{{ k.role }}</span>
                        </div>
                        <p class="mcp-key-owner">{{ k.owner }}<span>·</span>{{ scopeLabel(k) }}<span>·</span>{{ toolScopeLabel(k) }}</p>
                      </div>
                      <div class="mcp-key-card-actions">
                        <button type="button" class="mcp-prefix-copy"
                          :title="'复制前缀 ' + k.prefix + '（用于日志检索；完整 key 可点右侧「复制 key」取回）'"
                          @click="copyKeyPrefix(k)">
                          <code>{{ k.prefix }}</code>
                          <span>{{ copiedKeyId === k.id ? '已复制' : '前缀' }}</span>
                        </button>
                        <button type="button" class="btn ghost xs mcp-copy-key-btn" title="复制完整 key（服务端加密保存，可随时复制）" @click="copyKeyFull(k)">复制 key</button>
                        <button type="button" class="btn ghost xs" title="带入这把 key 并跳到客户端接入配置" @click="openClientConfigForKey(k)">接入配置</button>
                        <button type="button" class="btn ghost xs" title="跳到调用审计并只看这把 key" @click="openAuditForKey(k)">审计</button>
                        <n-dropdown v-if="keyMenuOptions(k).length" trigger="click" placement="bottom-end"
                          :options="keyMenuOptions(k)" @select="onKeyMenuAction($event, k)">
                          <button type="button" class="btn ghost xs mcp-key-more" aria-label="更多密钥操作">更多</button>
                        </n-dropdown>
                      </div>
                    </header>

                    <div class="mcp-key-scope-row" :title="scopeLabel(k)">
                      <span v-for="connId in (k.connections || ['host'])" :key="connId" class="mcp-scope-chip"
                        :class="{ write: (k.connectionPermissions?.[connId] || k.permissions || []).includes('write') }">
                        <em>{{ (k.connectionPermissions?.[connId] || k.permissions || []).includes('write') ? 'RW' : 'R' }}</em>{{ connectionLabel(connId) }}
                      </span>
                      <span class="mcp-scope-chip muted">{{ toolSummary(k) }}</span>
                    </div>

                    <div class="mcp-key-metrics">
                      <div class="mcp-key-metric">
                        <span>今日 <em>{{ k.todayCount }} / {{ k.dailyQuota }}</em><b :class="{ warn: usagePercent(k.todayCount, k.dailyQuota) >= 80 }">{{ usagePercent(k.todayCount, k.dailyQuota) }}%</b></span>
                        <div class="mcp-meter" :class="{ warn: usagePercent(k.todayCount, k.dailyQuota) >= 80 }"><i :style="{ width: usagePercent(k.todayCount, k.dailyQuota) + '%' }" /></div>
                      </div>
                      <div class="mcp-key-metric">
                        <span>本月 <em>{{ k.monthCount }} / {{ k.monthlyQuota }}</em><b :class="{ warn: usagePercent(k.monthCount, k.monthlyQuota) >= 80 }">{{ usagePercent(k.monthCount, k.monthlyQuota) }}%</b></span>
                        <div class="mcp-meter" :class="{ warn: usagePercent(k.monthCount, k.monthlyQuota) >= 80 }"><i :style="{ width: usagePercent(k.monthCount, k.monthlyQuota) + '%' }" /></div>
                      </div>
                    </div>

                    <footer class="mcp-key-foot">
                      <span><em>频率</em>{{ k.requestsPerMinute }}/min</span>
                      <span><em>最近使用</em>{{ k.lastUsedAt ? fmtTime(k.lastUsedAt) : '未使用' }}</span>
                      <span><em>有效期</em>{{ k.expiresAt ? fmtTime(k.expiresAt) : '长期' }}</span>
                      <span class="mcp-key-conns" :title="(k.connectionNames || k.connections || ['host']).join(' · ')">
                        <em>连接</em>{{ (k.connectionNames || k.connections || ['host']).join(' · ') }}
                      </span>
                      <span v-if="toolSummary(k)" class="mcp-key-tools"><em>工具</em>{{ toolSummary(k) }}</span>
                    </footer>
                  </article>
                </div>
                <div v-else class="mcp-empty">没有匹配的密钥；调整搜索或状态筛选。</div>
              </div>

              <aside v-if="inspectedKey" class="mcp-card mcp-key-inspector" :class="statusClass(inspectedKey)">
                <header class="mcp-key-inspector-head">
                  <div>
                    <span class="mcp-eyebrow">KEY INSPECTOR</span>
                    <h3>{{ inspectedKey.name }}</h3>
                    <p>{{ inspectedKey.owner }} · {{ inspectedKey.role }} · <code>{{ inspectedKey.prefix }}</code></p>
                  </div>
                  <div class="mcp-key-inspector-actions">
                    <button type="button" class="btn ghost xs" @click="copyKeyFull(inspectedKey)">复制 key</button>
                    <button type="button" class="btn ghost xs" @click="openClientConfigForKey(inspectedKey)">接入配置</button>
                    <button type="button" class="btn ghost xs" @click="openAuditForKey(inspectedKey)">审计</button>
                    <button v-if="canRevoke(inspectedKey)" type="button" class="btn ghost xs" @click="rotateKey(inspectedKey)">轮换</button>
                    <button v-if="canRevoke(inspectedKey)" type="button" class="btn ghost xs" @click="revokeKey(inspectedKey)">撤销</button>
                    <button type="button" class="btn ghost xs" @click="expandedKeyId = ''">收起</button>
                  </div>
                </header>
                                <div v-if="inspectedKey" class="mcp-key-detail">
                  <div class="mcp-key-inspector-tabs" role="tablist" aria-label="密钥详情">
                    <button v-for="t in inspectorTabs" :key="t.id" type="button" class="mcp-key-inspector-tab"
                      :class="{ active: inspectorTab === t.id }" role="tab" :aria-selected="inspectorTab === t.id"
                      @click="inspectorTab = t.id" @keydown="onInspectorTabKeydown">
                      {{ t.label }}<em v-if="t.badge">{{ t.badge }}</em>
                    </button>
                  </div>

                  <div v-show="inspectorTab === 'overview'" class="mcp-key-pane" role="tabpanel" aria-label="概览">
                    <div class="mcp-key-stat-grid">
                      <div class="mcp-key-stat"><b>{{ (inspectedKey.allowedTools || []).length }}</b><span>动作</span></div>
                      <div class="mcp-key-stat"><b>{{ keyToolGroups(inspectedKey).length }}</b><span>工具组</span></div>
                      <div class="mcp-key-stat"><b>{{ keyConnectionStats(inspectedKey).total }}</b><span>连接</span></div>
                      <div class="mcp-key-stat"><b>{{ keyConnectionStats(inspectedKey).write }}</b><span>可写连接</span></div>
                    </div>
                    <div class="mcp-detail-block">
                      <span class="mcp-field-label">近 14 天请求</span>
                      <div class="mcp-spark" role="img" aria-label="近 14 天每日请求数">
                        <span v-for="day in dailySeries(inspectedKey)" :key="day.key" :title="day.key + ' · ' + day.count + ' 次'">
                          <i :class="{ zero: !day.count }" :style="{ height: day.height + '%' }" />
                          <em>{{ day.label }}</em>
                        </span>
                      </div>
                      <p v-if="!Object.keys(inspectedKey.dailyCounts || {}).length" class="mcp-muted">暂无历史（新 key 从下一次请求开始累计）</p>
                    </div>
                    <div class="mcp-detail-block">
                      <span class="mcp-field-label">生命周期</span>
                      <p class="mcp-detail-line">创建 {{ fmtTime(inspectedKey.createdAt) }} · 到期 {{ inspectedKey.expiresAt ? fmtTime(inspectedKey.expiresAt) : '永不过期' }}</p>
                      <p class="mcp-detail-line">最近工具 {{ inspectedKey.lastTool || '—' }}</p>
                      <button type="button" class="mcp-link-btn mcp-clone-btn" @click="cloneKey(inspectedKey)">以此为模板签发</button>
                    </div>
                  </div>

                  <div v-show="inspectorTab === 'scope'" class="mcp-key-pane" role="tabpanel" aria-label="工具与连接范围">
                    <div class="mcp-detail-block">
                      <span class="mcp-field-label">工具范围
                        <em class="mcp-key-tool-meta">{{ (inspectedKey.allowedTools || []).length }} 动作 · {{ keyToolGroups(inspectedKey).length }} 组</em>
                      </span>
                      <div class="mcp-chip-list mcp-key-tool-groups">
                        <span v-for="group in keyToolGroups(inspectedKey)" :key="group.name" class="mcp-chip"
                          :title="group.name + '：' + group.count + ' 个动作' + (group.write ? '，其中写 ' + group.write : '')">
                          {{ group.name }} <b>{{ group.count }}</b><i v-if="group.write">写{{ group.write }}</i>
                        </span>
                      </div>
                      <details v-if="(inspectedKey.allowedTools || []).length" class="mcp-key-tool-all">
                        <summary>查看全部 {{ (inspectedKey.allowedTools || []).length }} 个动作</summary>
                        <div class="mcp-chip-list mcp-key-tool-all-list">
                          <span v-for="tool in (inspectedKey.allowedTools || [])" :key="tool" class="mcp-chip"
                            :class="{ danger: MCP_DESTRUCTIVE_TOOLS.includes(tool) }">{{ tool }}</span>
                        </div>
                      </details>
                    </div>
                    <div class="mcp-detail-block">
                      <span class="mcp-field-label">连接权限</span>
                      <div class="mcp-chip-list">
                        <span v-for="(perms, id) in (inspectedKey.connectionPermissions || {})" :key="id" class="mcp-chip">
                          {{ id }} · {{ (perms || []).join(' + ') }}
                        </span>
                        <span v-if="!Object.keys(inspectedKey.connectionPermissions || {}).length" class="mcp-muted">按全局权限</span>
                      </div>
                    </div>
                  </div>

                  <div v-show="inspectorTab === 'calls'" class="mcp-key-pane" role="tabpanel" aria-label="调用">
                    <div class="mcp-detail-block">
                      <span class="mcp-field-label">工具调用</span>
                      <div class="mcp-chip-list">
                        <span v-for="entry in sortedToolCounts(inspectedKey)" :key="entry[0]" class="mcp-chip">{{ entry[0] }} {{ entry[1] }}</span>
                        <span v-if="!sortedToolCounts(inspectedKey).length" class="mcp-muted">暂无调用</span>
                      </div>
                    </div>
                    <div class="mcp-detail-block">
                      <span class="mcp-field-label">最近调用</span>
                      <div class="mcp-chip-list">
                        <span v-for="(call, index) in (inspectedKey.recentCalls || []).slice(0, 10)" :key="index" class="mcp-chip"
                          :title="[call.method, call.requestId, call.ip, call.remoteIp, call.ua, call.http].filter(Boolean).join(' · ')">
                          {{ call.tool }} · {{ fmtTime(call.at) }}<template v-if="call.ip"> · {{ call.ip }}</template><template v-if="call.ok === false"> · 失败</template>
                        </span>
                        <span v-if="!(inspectedKey.recentCalls || []).length" class="mcp-muted">暂无记录</span>
                      </div>
                    </div>
                  </div>

                  <div v-show="inspectorTab === 'records'" class="mcp-key-pane" role="tabpanel" aria-label="管理记录">
                    <div class="mcp-detail-block">
                      <span class="mcp-field-label">管理记录</span>
                      <div class="mcp-chip-list">
                        <span v-for="(entry, index) in (inspectedKey.auditLog || []).slice(-8)" :key="index" class="mcp-chip">
                          {{ auditActionLabel(entry.action) }} · {{ entry.actor }} · {{ fmtTime(entry.at) }}
                        </span>
                        <span v-if="!(inspectedKey.auditLog || []).length" class="mcp-muted">暂无记录</span>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
              <aside v-else class="mcp-card mcp-key-inspector mcp-key-inspector-empty">
                <span class="mcp-eyebrow">KEY INSPECTOR</span>
                <h3>选择一把密钥</h3>
                <p class="mcp-hint">点击左侧「详情」查看工具白名单、逐连接读写、近 14 天请求与最近调用留档。</p>
              </aside>
            </div>
          </template>

          <p class="mcp-hint">限流按 key 固定 60 秒窗口；日/月配额按 UTC 重置。多实例部署时每个实例独立计数，严格全局配额请在网关或宿主侧按 key 维度实施。</p>
        </template>
      </template>
          </div>
        </section>
      </div>
    </div>

    <n-modal v-model:show="showSecretModal" preset="card" class="mcp-secret-modal"
      style="width: 660px; max-width: 94vw" :bordered="false"
      :mask-closable="false" :close-on-esc="false" :closable="false" :auto-focus="false">
      <div class="mcp-secret-dialog" role="dialog" aria-modal="true" aria-labelledby="mcp-secret-title">
        <div class="mcp-secret-top">
          <span class="mcp-secret-eyebrow">ONE-TIME SECRET · {{ newKey?.role || form.role }}</span>
          <h3 id="mcp-secret-title">密钥已生成</h3>
          <p>{{ newKey?.name || form.name }} · 完整 key 只显示这一次。关闭后服务端只保留哈希，无法再次查看。</p>
        </div>
        <div class="mcp-secret-warning" role="alert">
          <strong>先复制，再关闭</strong>
          <span v-if="rotatingSecret">轮换已让旧 key 立即失效，请把新 key 更新到所有客户端。</span>
          <span v-else>丢失后只能重新轮换一把新 key；已撤销的 key 会让客户端持续收到 401。</span>
        </div>
        <div class="mcp-secret-value-wrap">
          <code class="mcp-secret-value" tabindex="0" @focus="selectSecretText" @click="selectSecretText">{{ newSecret }}</code>
          <button ref="secretCopyBtn" type="button" class="btn primary sm mcp-secret-copy" @click="copySecret">
            {{ secretCopied ? '已复制' : '复制 key' }}
          </button>
        </div>
        <p v-if="secretCopyError" class="mcp-secret-error" role="alert">{{ secretCopyError }}</p>
        <div class="mcp-secret-actions">
          <button type="button" class="btn primary sm" @click="goClientsWithSecret">去客户端接入 →</button>
          <button type="button" class="btn ghost sm" @click="downloadSecret">下载 .env</button>
          <button type="button" class="btn ghost sm" @click="selectSecretText">全选 key</button>
          <span class="mcp-muted">HTTP 客户端把它放进 <code>Authorization: Bearer</code>；stdio 客户端放进 <code>ESQ_MCP_TOKEN</code>。</span>
        </div>
        <details class="mcp-secret-config">
          <summary>查看可直接粘贴的客户端配置</summary>
          <pre class="mcp-code">{{ httpClientConfig }}</pre>
          <pre class="mcp-code">{{ clientConfig }}</pre>
        </details>
        <div class="mcp-secret-footer">
          <button type="button" class="btn primary sm" @click="closeSecretModal">我已保存，关闭</button>
        </div>
      </div>
    </n-modal>
  </component>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { NDropdown, NModal, NSelect } from 'naive-ui';
import {
  MCP_DESTRUCTIVE_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES, MCP_STATIC_RESOURCES, MCP_APP_RESOURCE,
  MCP_TOOLS, MCP_TOOL_GROUPS, MCP_TOOL_PACKS, MCP_GROUP_ACTIONS, MCP_GROUP_DESCRIPTIONS, MCP_WRITE_TOOLS, MCP_ADMIN_ONLY_TOOLS,
  handleMcpRequest, isBrowserMcpWriteAllowed, mcpCallTool, setBrowserMcpWriteAllowed,
} from '../platform/browserMcp';
import { isBrowserMode } from '../platform/browserApi';
import { askConfirm } from '../composables/confirm';
import { isDemoMode } from '../platform/demoApi';
import { activeProfile, profiles } from '../platform/browserProfiles';
import { api } from '../api';
import { useAuthStore } from '../stores/auth';
import { roleRank } from '../utils/capability';
import { copyText, downloadText } from '../utils/format';

const props = withDefaults(defineProps<{ show: boolean; inline?: boolean }>(), { inline: false });
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();
const shellProps = computed(() => props.inline
  ? { class: 'mcp-page-shell' }
  : { show: props.show, preset: 'card', bordered: false, class: 'mcp-console-modal', style: 'width: 1180px; max-width: 96vw' });
function onShellShow(value: boolean) {
  emit('update:show', value);
}

const auth = useAuthStore();
const tools = MCP_TOOLS;
const selected = ref(tools[0]?.name || '');
const catalogView = ref<'groups' | 'legacy'>('groups');
const openCatalogGroups = ref<string[]>(['es_connections']);
const toolQuery = ref('');
const toolGroup = ref('all');
const toolKindFilter = ref<'all' | 'read' | 'write' | 'destructive' | 'admin'>('all');
const toolPickQuery = ref('');
const argsText = ref('{}');
const resultText = ref('');
const resultCopied = ref(false);
const running = ref(false);
const browserWrite = ref(isBrowserMcpWriteAllowed());
/* 服务端试跑凭证仅保存在组件内存：创建/轮换 key 后自动填入本次明文，绝不落 localStorage。 */
const serverToken = ref('');
/* 客户端配置只接受真正的 MCP 凭证；避免浏览器把站点登录密码自动填进 password 输入框后
   被当成 Bearer key 写进配置（线上实见 Authorization: Bearer 111111）。 */
const onboardingToken = computed(() => {
  const t = serverToken.value.trim();
  if (!t || /\s/.test(t)) return '';
  if (/^esq_mcp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16,}$/.test(t)) return t;
  return t.length >= 24 ? t : '';
});
/* 控制台静态入口在 /esquerystudio/ 下，MCP 端点固定在应用根路径 /mcp；
   ../mcp 同时兼容 server.servlet.context-path 前缀。 */
const endpoint = computed(() => new URL('../mcp', document.baseURI).toString());
const sseEndpoint = computed(() => new URL('../mcp/sse', document.baseURI).toString());
const serverMode = computed(() => !isBrowserMode && !isDemoMode);
const checking = ref(false);
const protocolCheck = ref<any>(null);
const canProbe = computed(() => isBrowserMode || isDemoMode
  || !!serverToken.value.trim() || activeKeyCount.value > 0);
const protocolStatusText = computed(() => {
  if (checking.value) return '检查中…';
  if (protocolCheck.value?.ok) return '通过';
  if (protocolCheck.value) return '未通过';
  return '未运行';
});
const copiedValue = ref('');
const copyNotice = ref('');
let copyNoticeTimer: ReturnType<typeof setTimeout> | null = null;
function flashCopyNotice(message: string) {
  copyNotice.value = message;
  if (copyNoticeTimer) clearTimeout(copyNoticeTimer);
  copyNoticeTimer = setTimeout(() => { copyNotice.value = ''; }, 2200);
}
async function copyAndFlash(text: string, okMessage: string): Promise<boolean> {
  const ok = await copyText(text);
  flashCopyNotice(ok ? okMessage : '复制失败：浏览器拒绝了剪贴板访问，请手动选中文本复制。');
  return ok;
}
const selectedResource = ref<any>(null);
const resourceArgs = reactive<Record<string, string>>({});
const resourceFields = computed<string[]>(() => {
  if (!selectedResource.value) return [];
  return [...String(selectedResource.value.uri).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]);
});
const resourceUri = computed(() => {
  if (!selectedResource.value) return '';
  return resourceFields.value.reduce(
    (uri, field) => uri.split('{' + field + '}').join(encodeURIComponent(String(resourceArgs[field] || '').trim())),
    selectedResource.value.uri as string,
  );
});
const resourceMissing = computed(() => resourceFields.value.filter(field => !String(resourceArgs[field] || '').trim()));
const resourceResult = ref('');
const resourceError = ref('');
const resourceRunning = ref(false);
const resourceCopied = ref(false);
const selectedPrompt = ref<any>(null);
const promptArgs = reactive<Record<string, string>>({});
const promptResult = ref('');
const promptError = ref('');
const promptRunning = ref(false);
const promptCopied = ref(false);
const promptMissing = computed(() => {
  if (!selectedPrompt.value) return [];
  return selectedPrompt.value.arguments
    .filter((arg: any) => arg.required && !String(promptArgs[arg.name] || '').trim())
    .map((arg: any) => arg.name);
});
const resourceCatalog = computed(() => [
  { uri: MCP_APP_RESOURCE.uri, title: MCP_APP_RESOURCE.title, description: MCP_APP_RESOURCE.description, template: false, app: true },
  ...MCP_STATIC_RESOURCES.map(r => ({ uri: r.uri, title: r.title, description: r.description, template: false, app: false })),
  ...MCP_RESOURCE_TEMPLATES.map(r => ({ uri: r.uriTemplate, title: r.title, description: r.description, template: true, app: false })),
]);

const tab = ref<'access' | 'tools' | 'clients' | 'keys' | 'audit'>('access');
/* tablist 键盘：←/→/Home/End；不拦截输入框内的方向键。 */
function onTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const target = event.target as HTMLElement;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  const nav = event.currentTarget as HTMLElement;
  const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>('.mcp-rail-item'));
  if (!buttons.length) return;
  const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
  let next = current;
  if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
  if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = buttons.length - 1;
  event.preventDefault();
  buttons[next].focus();
  buttons[next].click();
}
const stageInfo = computed(() => ({
  access: { eyebrow: '01 / CONNECT', title: '连接 MCP', desc: '确认端点、传输方式与鉴权；同一套工具可在服务端、浏览器和本地 Node 三种形态运行。' },
  tools: { eyebrow: '02 / TOOL REGISTRY', title: '工具目录', desc: '客户端只看到 15 个 action 型工具；需要排障时展开 130 个兼容动作，并直接试跑。' },
  clients: { eyebrow: '03 / ONBOARDING', title: '客户端接入', desc: '选一个 Agent，复制官方配置或安装命令；Streamable HTTP 与 SSE 都能直接落地。' },
  keys: { eyebrow: '04 / CREDENTIALS', title: '密钥', desc: '按登录人、角色、连接和工具白名单签发；写权限逐连接授予，撤销立即生效。' },
  audit: { eyebrow: '05 / CALL LEDGER', title: '调用审计', desc: '每次 MCP 调用留档方法、工具、IP、UA、HTTP 与 requestId；按失败或来源快速定位。' },
}[tab.value]));
const keys = ref<any[]>([]);
const keyQuery = ref('');
const keyStatus = ref('all');
const keyRoleFilter = ref('all');
const keySort = ref<'created' | 'lastUsed' | 'today' | 'name'>('created');
const expandedKeyId = ref('');
const keyMeta = ref<any>({ limits: {}, availableTools: [] });
const keyLoading = ref(false);
const keyErr = ref('');
const auditCalls = ref<any[]>([]);
const auditQuery = ref('');
const auditStatus = ref<'all' | 'ok' | 'failed'>('all');
const auditStatusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '成功', value: 'ok' },
  { label: '失败', value: 'failed' },
];
const auditTransport = ref<'all' | 'http' | 'sse' | 'browser' | 'stdio'>('all');
const auditTransportOptions = [
  { label: '全部来源', value: 'all' },
  { label: 'HTTP', value: 'http' },
  { label: 'SSE', value: 'sse' },
  { label: '浏览器桥', value: 'browser' },
  { label: 'stdio', value: 'stdio' },
];
const auditKey = ref('all');
const auditWindow = ref<'all' | '1h' | '24h' | '7d'>('all');
const auditWindowOptions = [
  { label: '全部时间', value: 'all' },
  { label: '最近 1 小时', value: '1h' },
  { label: '最近 24 小时', value: '24h' },
  { label: '最近 7 天', value: '7d' },
];
const auditKeyOptions = computed(() => {
  const map = new Map<string, string>();
  for (const call of auditCalls.value) {
    const prefix = String(call.keyPrefix || '');
    if (!prefix) continue;
    map.set(prefix, `${call.keyName || 'key'} · ${prefix}`);
  }
  return [{ label: '全部密钥', value: 'all' }, ...[...map.entries()].map(([value, label]) => ({ label, value }))];
});
const auditLive = ref(false);
let auditLiveTimer: ReturnType<typeof setInterval> | null = null;
function stopAuditLive() {
  auditLive.value = false;
  if (auditLiveTimer) {
    clearInterval(auditLiveTimer);
    auditLiveTimer = null;
  }
}
function toggleAuditLive() {
  if (auditLive.value) { stopAuditLive(); return; }
  auditLive.value = true;
  void loadAuditCalls();
  auditLiveTimer = setInterval(() => {
    if (tab.value === 'audit' && !auditLoading.value) void loadAuditCalls();
  }, 10000);
}
const auditDetailIndex = ref(-1);
function toggleAuditDetail(index: number) {
  auditDetailIndex.value = auditDetailIndex.value === index ? -1 : index;
}
async function copyAuditCall(call: any) {
  await copyAndFlash(JSON.stringify(call, null, 2), '调用记录已复制');
}
const filteredAuditCalls = computed(() => {
  const q = auditQuery.value.trim().toLowerCase();
  const windowMs = auditWindow.value === '1h' ? 3600000
    : auditWindow.value === '24h' ? 86400000
      : auditWindow.value === '7d' ? 604800000 : 0;
  const now = Date.now();
  return auditCalls.value.filter(call => {
    if (auditStatus.value === 'ok' && call.ok === false) return false;
    if (auditStatus.value === 'failed' && call.ok !== false) return false;
    if (auditKey.value !== 'all' && String(call.keyPrefix || '') !== auditKey.value) return false;
    if (windowMs && now - Number(call.at || 0) > windowMs) return false;
    if (auditTransport.value !== 'all') {
      const transport = String(call.transport || (call.remoteIp || call.ip ? 'http' : ''));
      if (transport !== auditTransport.value) return false;
    }
    if (!q) return true;
    return [call.method, call.tool, call.ip, call.remoteIp, call.requestId, call.ua, call.http, call.keyName, call.keyPrefix]
      .some(value => String(value || '').toLowerCase().includes(q));
  });
});
const auditFailedCount = computed(() => auditCalls.value.filter(call => call.ok === false).length);
const auditSuccessRate = computed<number | null>(() => {
  if (!auditCalls.value.length) return null;
  return Math.round((auditCalls.value.length - auditFailedCount.value) / auditCalls.value.length * 100);
});
const auditIpCount = computed(() => new Set(auditCalls.value.map(call => call.ip).filter(Boolean)).size);
function auditBundle(call: any) {
  return [
    `time: ${call.at ? new Date(Number(call.at)).toISOString() : '—'}`,
    `key: ${call.keyName || '—'} (${call.keyPrefix || '—'})`,
    `tool: ${call.tool || '—'} / method: ${call.method || '—'}`,
    `status: ${call.ok === false ? 'failed' : 'ok'}${call.ms != null ? ' · ' + call.ms + 'ms' : ''}`,
    `ip: ${call.ip || '—'} (remoteIp: ${call.remoteIp || '—'})`,
    `transport: ${call.transport || (call.origin ? 'browser' : call.pid ? 'stdio' : 'http')}`,
    `http: ${call.http || '—'}`,
    `ua: ${call.ua || '—'}`,
    `requestId: ${call.requestId || '—'}`,
  ].join('\n');
}
async function copyAuditBundle(call: any) {
  await copyAndFlash(auditBundle(call), '排障包已复制（时间 / key / IP / UA / requestId）');
}
function openKeyForAudit(call: any) {
  const key = keys.value.find((item: any) => item.prefix && item.prefix === call.keyPrefix);
  if (key) expandedKeyId.value = key.id;
  tab.value = 'keys';
}
const auditLoading = ref(false);
const auditErr = ref('');
const auditRetentionDays = ref(30);
async function loadAuditCalls() {
  if (isBrowserMode) {
    auditLoading.value = true;
    try {
      const payload = await handleMcpRequest({ jsonrpc: '2.0', id: Date.now(), method: 'server/discover', params: {} });
      const rows = payload?.result?.auditCalls || payload?.result?.recentCalls;
      auditCalls.value = Array.isArray(rows) ? rows : [];
      auditRetentionDays.value = Number(payload?.result?.auditRetentionDays) || 30;
    } catch {
      auditCalls.value = [];
    } finally {
      auditLoading.value = false;
    }
    return;
  }
  if (!serverMode.value) {
    auditCalls.value = [];
    return;
  }
  /* 持久化审计端点：一次调用一条，保留 30 天（最低 7 天）。旧后端无该端点时
     回落到 key.recentCalls（最近 100 条预览），不把整页台账清空。 */
  auditLoading.value = true;
  auditErr.value = '';
  try {
    let merged: any[] = [];
    try {
      const data = await api.mcpKeys.calls(undefined, 500);
      if (Array.isArray(data?.calls)) {
        merged = data.calls;
        auditRetentionDays.value = Number(data.retentionDays) || 30;
      }
    } catch {
      if (!keys.value.length) await loadKeys();
      for (const key of keys.value) {
        for (const call of (key.recentCalls || [])) {
          merged.push({ ...call, keyName: key.name, keyPrefix: key.prefix, owner: key.owner });
        }
      }
    }
    const seen = new Set<string>();
    auditCalls.value = merged
      .filter(call => {
        const id = [call.requestId, call.keyPrefix, call.tool, call.at].join('|');
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))
      .slice(0, 500);
  } catch (e: any) {
    auditErr.value = '调用留档加载失败：' + String(e?.message || e);
    auditCalls.value = [];
  } finally {
    auditLoading.value = false;
  }
}
const adminUsers = ref<any[]>([]);
const ownerOptions = computed(() => {
  const map = new Map<string, string>();
  for (const user of adminUsers.value) {
    const username = String(user.username || '');
    if (username) map.set(username, String(user.role || ''));
  }
  for (const key of keys.value) {
    const username = String(key.owner || '');
    if (username && !map.has(username)) map.set(username, String(key.role || ''));
  }
  return [...map.entries()].map(([username, role]) => ({ username, role }));
});
const ownerUser = computed(() => {
  const owner = form.owner.trim();
  return owner ? ownerOptions.value.find(item => item.username === owner) : null;
});
const ownerRoleHint = computed(() => (ownerUser.value ? `目标用户角色：${ownerUser.value.role}` : ''));
const ownerRoleWarning = computed(() => {
  if (!ownerUser.value) return '';
  return roleRank(form.role) > roleRank(ownerUser.value.role)
    ? `保存会被拒绝：key 角色 ${form.role} 高于目标用户的 ${ownerUser.value.role}`
    : '';
});
const keyTableWrap = ref<HTMLElement | null>(null);
const keyTableOverflow = ref(false);
function measureKeyTable() {
  const el = keyTableWrap.value;
  keyTableOverflow.value = !!el && el.scrollWidth > el.clientWidth + 1;
}
onMounted(() => {
  window.addEventListener('resize', measureKeyTable);
  /* 首屏即显示真实 key / 留档计数，不等用户点开标签；失败由各加载函数自身吞错。 */
  if (serverMode.value) void loadKeys();
  if (serverMode.value || isBrowserMode) void loadAuditCalls();
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', measureKeyTable);
  if (copiedKeyTimer) {
    clearTimeout(copiedKeyTimer);
    copiedKeyTimer = null;
  }
  stopAuditLive();
});
/* 换账号时清空上一身份记住的 scope / 明文 / 审计筛选，重新从当前身份加载。 */
watch(() => auth.me?.username, (next, prev) => {
  if (!prev || next === prev) return;
  keyLoadSeq += 1;
  keys.value = [];
  keyMeta.value = { limits: {}, availableTools: [] };
  expandedKeyId.value = '';
  keyQuery.value = '';
  keyStatus.value = 'all';
  keyRoleFilter.value = 'all';
  keySort.value = 'created';
  auditCalls.value = [];
  auditQuery.value = '';
  auditKey.value = 'all';
  auditWindow.value = 'all';
  auditStatus.value = 'all';
  auditTransport.value = 'all';
  serverToken.value = '';
  probeKeyId.value = null;
  trialKeyId.value = null;
  clientKeyId.value = null;
  showCreate.value = false;
  form.owner = '';
  form.name = '';
  ownerScope.value = null;
  if (serverMode.value) void loadKeys();
  if (serverMode.value || isBrowserMode) void loadAuditCalls();
});
const showCreate = ref(false);
const createSectionRef = ref<HTMLElement | null>(null);
/** 从卡片「编辑/克隆」打开表单时，表单在列表上方——滚回表单并聚焦名称，避免点了没反应。 */
function revealCreateForm() {
  nextTick(() => {
    createSectionRef.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    createSectionRef.value?.querySelector<HTMLInputElement>('input')?.focus();
  });
}
const editingId = ref('');
const creating = ref(false);
const newSecret = ref('');
const newKey = ref<any>(null);
const secretCopied = ref(false);
const secretCopyError = ref('');
const showSecretModal = ref(false);
const secretCopyBtn = ref<HTMLButtonElement | null>(null);
const rotatingSecret = ref(false);
watch(showSecretModal, visible => {
  if (visible) nextTick(() => secretCopyBtn.value?.focus());
});
const copiedKeyId = ref('');
let copiedKeyTimer: ReturnType<typeof setTimeout> | null = null;
const ALL_ROLES = ['VIEWER', 'OPERATOR', 'REBUILD_OP', 'CLUSTER_OP', 'AUDIT_OP', 'ADMIN'];
const roleOptions = computed(() => {
  const callerRole = String(keyMeta.value?.caller?.role || auth.me?.role || 'VIEWER');
  return ALL_ROLES.filter(role => roleRank(role) <= roleRank(callerRole));
});
const toolGroupOptions = computed(() => [
  { label: '全部分类', value: 'all' },
  ...MCP_TOOL_GROUPS.map(group => ({ label: group.label + '（' + group.tools.length + '）', value: group.id })),
]);
const toolKindOptions = computed(() => [
  { label: '全部权限', value: 'all' },
  { label: '只读', value: 'read' },
  { label: '写', value: 'write' },
  { label: '破坏性', value: 'destructive' },
  ...(serverMode.value ? [{ label: '仅 ADMIN', value: 'admin' }] : []),
]);
const keyStatusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '启用', value: 'active' },
  { label: '已撤销', value: 'revoked' },
  { label: '已过期', value: 'expired' },
];
const keyRoleOptions = computed(() => [
  { label: '全部角色', value: 'all' },
  ...ALL_ROLES.map(role => ({ label: role, value: role })),
]);
const keySortOptions = [
  { label: '最新创建', value: 'created' },
  { label: '最近使用', value: 'lastUsed' },
  { label: '今日用量', value: 'today' },
  { label: '名称', value: 'name' },
];
const roleSelectOptions = computed(() => roleOptions.value.map(role => ({ label: role, value: role })));
const toolPickerOptions = computed(() => MCP_TOOL_GROUPS
  .map(group => ({
    type: 'group',
    key: group.id,
    label: group.label + '（' + group.tools.length + '）',
    children: group.tools.map(name => {
      const tool = tools.find(item => item.name === name);
      return {
        label: name,
        value: name,
        disabled: !tool,
      };
    }),
  }))
  .filter(group => group.children.length));
/* 工具包按当前身份可签发的工具裁剪；核心包默认 32 个，确保 WorkBuddy 等客户端能一次加载完。 */
const toolPackOptions = computed(() => {
  const available = new Set(selectableTools.value);
  const writableUnion = new Set<string>();
  for (const conn of availableConnections.value) {
    for (const tool of connectionWritableTools(conn)) writableUnion.add(tool);
  }
  return MCP_TOOL_PACKS
    .map(pack => ({
      ...pack,
      tools: pack.tools.filter(tool => available.has(tool)
        && (!isWriteCapableTool(tool) || writableUnion.has(tool))),
    }))
    .filter(pack => pack.tools.length > 0);
});
const coreToolPack = computed(() => toolPackOptions.value.find(pack => pack.id === 'core') || toolPackOptions.value[0]);
const toolBudgetWarning = computed(() => form.allowedTools.length > 80);
function enumOptions(values: any[]) {
  return values.map(value => ({ label: String(value), value }));
}
const form = reactive({
  name: '', owner: '', role: 'VIEWER',
  requestsPerMinute: 60, dailyQuota: 5000, monthlyQuota: 100000, expiresInDays: 0,
  allowedTools: [] as string[],
  permissions: ['read'] as string[],
  connections: ['host'] as string[],
  writeConnections: [] as string[],
});

let ownerScopeTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => form.owner, (owner) => {
  if (!viewerIsAdmin.value) return;
  if (ownerScopeTimer) clearTimeout(ownerScopeTimer);
  ownerScope.value = null;
  ownerScopeError.value = '';
  const target = owner.trim();
  if (!target || target === auth.me?.username) {
    ownerScopeLoading.value = false;
    /* 清掉上一个代签目标的范围，回到本人可签发集合；避免表单“记得”别人的连接/工具。 */
    void nextTick(() => {
      const ids = availableConnections.value.map((c: any) => String(c.id));
      form.connections = form.connections.filter((id: string) => ids.includes(id));
      if (!form.connections.length && ids.length) {
        form.connections = viewerIsAdmin.value ? ids.slice(0, 1) : ids;
      }
      form.writeConnections = [];
      form.allowedTools = form.allowedTools.filter((tool: string) => selectableTools.value.includes(tool));
      if (!form.allowedTools.length) form.allowedTools = [...(coreToolPack.value?.tools || selectableTools.value)];
    });
    return;
  }
  ownerScopeLoading.value = true;
  ownerScopeTimer = setTimeout(async () => {
    try {
      const result = await api.mcpKeys.ownerScope(target);
      /* 防旧请求覆盖新目标：管理员快速切换归属用户时，只接受当前输入对应的响应。 */
      if (form.owner.trim() !== target) return;
      ownerScope.value = result;
      /* 目标角色是签发上限：默认按目标角色签发，允许下调但绝不预置更高角色。 */
      if (!editingId.value && ownerScope.value.roleResolved && ownerScope.value.role) {
        form.role = String(ownerScope.value.role);
      }
      /* 目标范围变化后，剔除已不在范围内的连接与工具选择，避免提交时才 403。 */
      const connIds = new Set((ownerScope.value.connections || []).map((c: any) => String(c.id)));
      form.connections = form.connections.filter((id: string) => connIds.has(id));
      form.writeConnections = form.writeConnections.filter((id: string) => connIds.has(id));
      const toolSet = new Set(ownerScope.value.availableTools || []);
      form.allowedTools = form.allowedTools.filter((tool: string) => toolSet.size === 0 || toolSet.has(tool));
      if (!form.allowedTools.length) {
        const targetTools = ownerScope.value.availableTools || [];
        const coreTools = (coreToolPack.value?.tools || []).filter((tool: string) => targetTools.includes(tool));
        form.allowedTools = coreTools.length ? coreTools : targetTools.slice(0, 1);
      }
      if (!form.connections.length && connIds.size) form.connections = [String((ownerScope.value.connections[0] || {}).id)];
    } catch (e: any) {
      if (form.owner.trim() === target) ownerScopeError.value = '目标用户范围读取失败：' + String(e?.message || e);
    } finally {
      if (form.owner.trim() === target) ownerScopeLoading.value = false;
    }
  }, 260);
});

watch(() => form.connections, (next) => {
  form.writeConnections = form.writeConnections.filter((id: string) => next.includes(id));
});
const selectedConnections = computed(() => availableConnections.value.filter(c => form.connections.includes(c.id)));
const hasWrite = computed(() => form.writeConnections.length > 0);
const hasRead = computed(() => selectedConnections.value.length > 0);

/* ADMIN 代签预览：选归属用户后读取目标用户真实角色/页面授权，避免「按 ADMIN 的范围签发」。 */
const ownerScope = ref<any>(null);
const ownerScopeLoading = ref(false);
const ownerScopeError = ref('');
const ownerScopeHint = computed(() => {
  if (!viewerIsAdmin.value || !form.owner.trim() || form.owner.trim() === auth.me?.username) return '';
  if (ownerScopeLoading.value) return '正在读取目标用户的真实权限范围…';
  if (ownerScopeError.value) return ownerScopeError.value;
  if (!ownerScope.value) return '';
  if (!ownerScope.value.roleResolved) return '目标用户角色不可解析：只能签发宿主只读 VIEWER key。';
  if (!ownerScope.value.pagesKnown) return '目标用户页面授权不可解析：按角色模型收窄，写权限至少需要 OPERATOR。';
  return `目标用户：${ownerScope.value.role} · 可签发连接 ${(ownerScope.value.connections || []).length} 个 · 页面授权已收窄`;
});

const limits = computed(() => {
  const scoped = delegatedOwnerSelected.value ? ownerScope.value?.limits : null;
  const base = keyMeta.value?.limits || {};
  return {
    maxRequestsPerMinute: scoped?.maxRequestsPerMinute ?? base.maxRequestsPerMinute ?? 120,
    maxDailyQuota: scoped?.maxDailyQuota ?? base.maxDailyQuota ?? 20000,
    maxMonthlyQuota: scoped?.maxMonthlyQuota ?? base.maxMonthlyQuota ?? 500000,
    maxExpiresInDays: scoped?.maxExpiresInDays ?? base.maxExpiresInDays ?? 90,
  };
});
const delegatedOwnerSelected = computed(() =>
  viewerIsAdmin.value && !!form.owner.trim() && form.owner.trim() !== auth.me?.username);
const availableTools = computed<string[]>(() => {
  if (delegatedOwnerSelected.value) {
    return Array.isArray(ownerScope.value?.availableTools) ? ownerScope.value.availableTools : [];
  }
  const list = keyMeta.value?.availableTools;
  return Array.isArray(list) && list.length ? list : tools.map(t => t.name);
});
const adminOnlyTools = computed<string[]>(() => {
  const list = keyMeta.value?.adminOnlyTools;
  return Array.isArray(list) ? list : [];
});
const availableConnections = computed<any[]>(() => {
  if (delegatedOwnerSelected.value) {
    return Array.isArray(ownerScope.value?.connections) ? ownerScope.value.connections : [];
  }
  const list = keyMeta.value?.availableConnections;
  return Array.isArray(list) && list.length ? list : [{ id: 'host', name: '宿主 / 控制集群' }];
});
/* 写权限所见即所得：后端返回每连接真正可写的工具（writeTools），
   前端按当前已选写工具实时判断，缺页面写权的连接不渲染可勾选控件。 */
function isWriteCapableTool(tool: string) {
  return MCP_WRITE_TOOLS.includes(tool) || tool === 'es_rest';
}
function connectionWritableTools(c: any): string[] {
  if (Array.isArray(c?.writeTools)) return c.writeTools.map(String);
  /* 兼容旧后端：没有 writeTools 时只能按连接级 write 粗略放行。 */
  return c?.write ? MCP_TOOLS.filter(tool => isWriteCapableTool(tool.name)).map(tool => tool.name) : [];
}
const selectedWriteTools = computed(() => form.allowedTools.filter(isWriteCapableTool));
function missingWriteToolsFor(c: any): string[] {
  const supported = new Set(connectionWritableTools(c));
  return selectedWriteTools.value.filter(tool => !supported.has(tool));
}
function writeBlockReason(c: any): string {
  if (!c?.write) return '当前身份在该连接没有写授权';
  const supported = connectionWritableTools(c);
  if (!supported.length) return '该连接没有可用写工具';
  const missing = missingWriteToolsFor(c);
  return missing.length ? `缺少工具 ${missing.join('、')} 的页面写权` : '';
}
function canWriteConnection(c: any): boolean {
  return !!c?.write && connectionWritableTools(c).length > 0 && missingWriteToolsFor(c).length === 0;
}
const writableConnectionCount = computed(() => availableConnections.value.filter(canWriteConnection).length);
const uncoveredWriteTools = computed(() => selectedWriteTools.value.filter(tool => !form.writeConnections.some(id => {
  const conn = availableConnections.value.find((c: any) => String(c.id) === String(id));
  return !!conn && connectionWritableTools(conn).includes(tool);
})));
const connectionChoices = computed(() => serverMode.value
  ? availableConnections.value.map((c: any) => ({ id: String(c.id), name: String(c.name || c.id) }))
  : profiles().map(profile => ({ id: profile.id, name: profile.name })));
const indexChoices = ref<string[]>([]);
const onboardingClient = ref<string>(isBrowserMode ? 'browser' : 'http');
const onboardingLocal = ref(false);
const onboardingTransport = ref<'http' | 'sse'>('http');
/* GUI 客户端默认精简面：保留 15 个 action 组，仅隐藏 resources/prompts；完整面仍可通过 ?surface=full 或开关恢复。 */
const onboardingSurface = ref<'compact' | 'full'>('compact');
function withSurface(url: string) {
  if (onboardingSurface.value !== 'compact') return url;
  return url + (url.includes('?') ? '&' : '?') + 'surface=compact';
}
const onboardingUrl = computed(() => withSurface(onboardingTransport.value === 'sse' ? sseEndpoint.value : endpoint.value));
const onboardingHttpType = computed(() => onboardingTransport.value === 'sse' ? 'sse' : 'http');
watch(onboardingClient, id => {
  if (['local', 'stdio', 'browser', 'deepseek-harness', 'dbx'].includes(id)) onboardingLocal.value = false;
});
const onboardingCopied = ref(false);
const installCopied = ref(false);
const detectCopied = ref(false);
const onboardingClients = [
  { id: 'http', label: '通用 HTTP' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codebuddy', label: 'CodeBuddy Code CLI' },
  { id: 'zcode', label: 'ZCode' },
  { id: 'trae', label: 'TRAE' },
  { id: 'vscode', label: 'VS Code' },
  { id: 'windsurf', label: 'Windsurf' },
  { id: 'codex', label: 'Codex' },
  { id: 'deepseek-harness', label: 'DeepSeek Harness' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'pi', label: 'Pi' },
  { id: 'cherry-studio', label: 'Cherry Studio' },
  { id: 'qoder', label: 'Qoder' },
  { id: 'workbuddy', label: 'WorkBuddy' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'dbx', label: 'DBX（MCP Server）' },
  { id: 'stdio', label: 'stdio 桥' },
  { id: 'local', label: '本地 Node' },
  ...(isBrowserMode ? [{ id: 'browser', label: '浏览器页面内桥' }] : []),
];
/* http / stdio / local / browser 是接入方式，不是客户端品牌；数量要如实分开报。 */
const onboardingClientCount = computed(() =>
  onboardingClients.filter((client) => !['http', 'stdio', 'local', 'browser', 'dbx'].includes(client.id)).length);
const clientQuery = ref('');
const visibleOnboardingClients = computed(() => {
  const q = clientQuery.value.trim().toLowerCase();
  if (!q) return onboardingClients;
  return onboardingClients.filter(client =>
    client.label.toLowerCase().includes(q) || client.id.includes(q)
    || onboardingKind(client.id).toLowerCase().includes(q)
    || String(onboardingNotes[client.id] || '').toLowerCase().includes(q));
});
function onboardingKind(id: string) {
  if (['dbx'].includes(id)) return 'MCP Server（非客户端）';
  if (['local'].includes(id)) return '本机直连 / stdio';
  if (['stdio'].includes(id)) return 'stdio 桥';
  if (['browser'].includes(id)) return '页面内桥';
  if (['claude-code', 'codebuddy', 'codex', 'deepseek-harness', 'opencode', 'qoder', 'zcode', 'trae'].includes(id)) return 'CLI 可写入';
  if (['cursor', 'vscode', 'windsurf', 'pi', 'antigravity'].includes(id)) return 'IDE / 配置文件';
  if (['cherry-studio', 'workbuddy'].includes(id)) return '桌面 GUI';
  return '通用远程 MCP';
}
const onboardingNotes: Record<string, string> = {
  http: '任何支持 Streamable HTTP 的客户端：把地址与 Bearer key 填入远程 MCP 配置。',
  'claude-code': '写入项目 .mcp.json 或 ~/.claude.json 的 mcpServers 段；也可用「复制安装命令」直接注册。',
  cursor: '写入 ~/.cursor/mcp.json 的 mcpServers 段。',
  codebuddy: '写入 ~/.codebuddy/.mcp.json 的 mcpServers 段（type=http）。',
  zcode: '写入 ~/.zcode/cli/config.json 的 mcp.servers 段（type=http）。',
  trae: '写入 .trae/mcp.json 的 mcpServers 段，或在设置 → MCP → 添加远程服务器粘贴配置。',
  vscode: '写入工作区 .vscode/mcp.json 的 servers 段。',
  windsurf: '写入 ~/.codeium/windsurf/mcp_config.json 的 mcpServers 段。',
  codex: '写入 ~/.codex/config.toml 的 [mcp_servers.esquerystudio] 段（TOML）；如需避免明文 key，可改用 bearer_token_env_var。',
  'deepseek-harness': '粘贴到 cordis.yml 的 MCP 客户端插件条目（transport: streamable-http）。',
  opencode: '写入 ~/.config/opencode/opencode.json 的 mcp.servers 段（type=remote）。',
  pi: '写入 ~/.pi/agent/mcp.json 的 mcpServers 段。',
  'cherry-studio': '在设置 → MCP 服务器中添加远程服务，粘贴配置。',
  qoder: '写入 ~/.qoder/settings.json 的 mcpServers 段（type=http）。',
  workbuddy: '写入 ~/.workbuddy/mcp.json 的 mcpServers 段（type=http）。若客户端只提供 SSE 选项，地址改用 /mcp/sse。',
  antigravity: '写入 ~/.gemini/config/mcp_config.json 的 mcpServers 段。',
  dbx: 'DBX 0.6+ 是 MCP Server（提供 DBX 数据库连接给 AI 客户端），不消费外部 MCP server；不能把本端点装进 DBX。要在同一个 Agent 里同时使用，请并列注册两个 server。',
  stdio: '供仅支持命令启动的客户端使用，桥接面板签发的 key。',
  local: '本地 Node MCP 直连 Elasticsearch，配置包含连接凭据。',
  browser: '仅当前页面内的 AI / Agent 可用，不暴露端口。',
};
const onboardingClientNote = computed(() => onboardingNotes[onboardingClient.value]
  || '在客户端「MCP / 集成」设置中添加远程 HTTP 服务，粘贴下方配置。');
function tomlString(value: any) { return JSON.stringify(String(value == null ? '' : value)); }
const onboardingInstallCommand = computed(() => {
  if (isBrowserMode || isDemoMode) return '';
  const id = onboardingClient.value;
  const token = onboardingToken.value || '<esq_mcp_key>';
  if (id === 'local') return 'node mcp/esquerystudio-mcp-cli.mjs install --client local --config ~/.esquerystudio/mcp.json';
  if (onboardingLocal.value && id === 'claude-code') {
    return `claude mcp add --transport stdio esquerystudio -- node mcp/esquerystudio-local-mcp.mjs --config ~/.esquerystudio/mcp.json`;
  }
  if (onboardingLocal.value && ['cursor', 'vscode', 'windsurf', 'opencode', 'qoder', 'trae', 'codebuddy', 'zcode', 'workbuddy', 'pi', 'antigravity'].includes(id)) {
    return `node mcp/esquerystudio-mcp-cli.mjs install --client ${id} --local --write`;
  }
  if (id === 'claude-code') {
    return `claude mcp add --transport ${onboardingTransport.value === 'sse' ? 'sse' : 'http'} esquerystudio ${onboardingUrl.value} --header "Authorization: Bearer ${token}"`;
  }
  if (['cursor', 'vscode', 'windsurf', 'opencode', 'qoder', 'trae', 'codebuddy', 'zcode', 'workbuddy', 'pi', 'codex', 'deepseek-harness', 'cherry-studio'].includes(id)) {
    return `node mcp/esquerystudio-mcp-cli.mjs install --client ${id} --url ${onboardingUrl.value} --token ${token}${onboardingTransport.value === 'sse' ? ' --transport sse' : ''} --write`;
  }
  return '';
});
const onboardingConfig = computed(() => {
  if (onboardingClient.value === 'dbx') {
    return 'DBX 0.6+ 是 MCP Server（把自己的数据库连接暴露给 AI 客户端），不是 MCP 客户端，不能消费本端点。\n'
      + '若同一个 Agent 要同时使用 DBX 与 ESQueryStudio，请在 Agent 配置里并列注册两个 server；DBX 侧可用 `dbx agent setup` 安装官方 Agent Skill。';
  }
  if (onboardingLocal.value) {
    const id = onboardingClient.value;
    const script = 'mcp/esquerystudio-local-mcp.mjs';
    const config = '~/.esquerystudio/mcp.json';
    if (id === 'claude-code') return JSON.stringify({
      mcpServers: { esquerystudio: { type: 'stdio', command: 'node', args: [script, '--config', config] } },
    }, null, 2);
    if (id === 'codex') return '[mcp_servers.esquerystudio]\n'
      + 'command = ' + tomlString('node') + '\n'
      + 'args = [' + tomlString(script) + ', ' + tomlString('--config') + ', ' + tomlString(config) + ']\n';
    if (id === 'vscode') return JSON.stringify({
      servers: { esquerystudio: { type: 'stdio', command: 'node', args: [script, '--config', config] } },
    }, null, 2);
    if (id === 'opencode') return JSON.stringify({
      '$schema': 'https://opencode.ai/config.json',
      mcp: { servers: { esquerystudio: { type: 'local', command: ['node', script, '--config', config] } } },
    }, null, 2);
    if (id === 'zcode') return JSON.stringify({
      mcp: { servers: { esquerystudio: { type: 'stdio', command: 'node', args: [script, '--config', config] } } },
    }, null, 2);
    if (['qoder', 'codebuddy', 'workbuddy'].includes(id)) return JSON.stringify({
      mcpServers: { esquerystudio: { type: 'stdio', command: 'node', args: [script, '--config', config] } },
    }, null, 2);
    return JSON.stringify({
      mcpServers: { esquerystudio: { command: 'node', args: [script, '--config', config] } },
    }, null, 2);
  }
  if (onboardingClient.value === 'claude-code') {
    return JSON.stringify({
      mcpServers: {
        esquerystudio: {
          type: onboardingHttpType.value,
          url: onboardingUrl.value,
          headers: { Authorization: 'Bearer ' + (onboardingToken.value || '<esq_mcp_key>') },
        },
      },
    }, null, 2);
  }
  if (onboardingClient.value === 'codex') {
    return '[mcp_servers.esquerystudio]\n'
      + 'url = ' + tomlString(onboardingUrl.value) + '\n'
      + 'http_headers = { Authorization = ' + tomlString('Bearer ' + (onboardingToken.value || '<esq_mcp_key>')) + ' }\n';
  }
  if (onboardingClient.value === 'vscode') {
    return JSON.stringify({
      servers: {
        esquerystudio: {
          type: onboardingHttpType.value,
          url: onboardingUrl.value,
          headers: { Authorization: 'Bearer ' + (onboardingToken.value || '<esq_mcp_key>') },
        },
      },
    }, null, 2);
  }
  if (onboardingClient.value === 'deepseek-harness') {
    const token = (onboardingToken.value || '<esq_mcp_key>').replace(/'/g, "''");
    return "- id: esquerystudio\n"
      + "  name: '@deepseek-ai/dsh-mcp-client'\n"
      + "  config:\n"
      + "    serverName: esquerystudio\n"
      + "    transport: " + (onboardingTransport.value === 'sse' ? 'sse' : 'streamable-http') + "\n"
      + `    url: ${onboardingUrl.value}\n`
      + "    headers:\n"
      + `      Authorization: 'Bearer ${token}'\n`;
  }
  if (onboardingClient.value === 'qoder' || onboardingClient.value === 'codebuddy' || onboardingClient.value === 'workbuddy') {
    return JSON.stringify({
      mcpServers: {
        esquerystudio: {
          type: onboardingHttpType.value,
          url: onboardingUrl.value,
          headers: { Authorization: 'Bearer ' + (onboardingToken.value || '<esq_mcp_key>') },
        },
      },
    }, null, 2);
  }
  if (onboardingClient.value === 'zcode') {
    return JSON.stringify({
      mcp: {
        servers: {
          esquerystudio: {
            type: onboardingHttpType.value,
            url: onboardingUrl.value,
            headers: { Authorization: 'Bearer ' + (onboardingToken.value || '<esq_mcp_key>') },
          },
        },
      },
    }, null, 2);
  }
  if (onboardingClient.value === 'opencode') {
    return JSON.stringify({
      '$schema': 'https://opencode.ai/config.json',
      mcp: {
        servers: {
          esquerystudio: {
            type: 'remote',
            url: onboardingUrl.value,
            headers: { Authorization: 'Bearer ' + (onboardingToken.value || '<esq_mcp_key>') },
            oauth: false,
          },
        },
      },
    }, null, 2);
  }
  if (onboardingClient.value === 'stdio') {
    return JSON.stringify({
      mcpServers: {
        esquerystudio: {
          command: 'node',
          args: ['/path/to/esquerystudio/mcp/esquerystudio-mcp-stdio.mjs'],
          env: { ESQ_MCP_URL: onboardingUrl.value, ESQ_MCP_TOKEN: onboardingToken.value || '<esq_mcp_key>' },
        },
      },
    }, null, 2);
  }
  if (onboardingClient.value !== 'local' && onboardingClient.value !== 'browser') {
    return JSON.stringify({
      mcpServers: {
        esquerystudio: {
          ...(onboardingTransport.value === 'sse' ? { type: 'sse' } : {}),
          url: onboardingUrl.value,
          headers: { Authorization: 'Bearer ' + (onboardingToken.value || '<esq_mcp_key>') },
        },
      },
    }, null, 2);
  }
  if (onboardingClient.value === 'browser') {
    return `await window.ESQueryStudioMCP.handle({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list'
})`;
  }
  return JSON.stringify({
    defaultConnection: 'prod',
    connections: [{
      id: 'prod', name: 'Production', url: 'http://localhost:9200',
      username: 'elastic', password: '<password>',
    }],
  }, null, 2);
});
const viewerIsAdmin = computed(() => !serverMode.value
  || String(keyMeta.value?.caller?.role || auth.me?.role || '').toUpperCase() === 'ADMIN');
/* 写工具可签发的前提是「当前身份至少有一个可写连接」，不能反过来用
   form.writeConnections 判断——否则用户没勾写之前写工具永远不可见，形成死循环。 */
const canIssueWriteTools = computed(() => availableConnections.value.some((c: any) => !!c.write));
const selectableTools = computed(() => availableTools.value.filter(tool =>
  (viewerIsAdmin.value || !MCP_ADMIN_ONLY_TOOLS.includes(tool))
  && (!adminOnlyTools.value.includes(tool) || form.role === 'ADMIN')
  && (tool === 'es_rest'
    ? (hasRead.value || canIssueWriteTools.value)
    : (MCP_WRITE_TOOLS.includes(tool) ? canIssueWriteTools.value : hasRead.value))));
const trialAsGroup = ref(false);
const showLegacyTools = ref(false);
const actionGroups = computed(() => {
  const q = toolPickQuery.value.trim().toLowerCase();
  const available = new Set(selectableTools.value);
  return Object.entries(MCP_GROUP_ACTIONS)
    .map(([name, map]) => {
      const actions = Object.entries(map)
        .map(([action, legacy]) => ({ action, legacy }))
        .filter(item => available.has(item.legacy))
        .filter(item => !q || name.toLowerCase().includes(q) || String(MCP_GROUP_DESCRIPTIONS[name] || '').toLowerCase().includes(q)
          || item.action.includes(q) || item.legacy.includes(q));
      return {
        name,
        description: MCP_GROUP_DESCRIPTIONS[name] || '',
        actions,
        selectedCount: actions.filter(item => form.allowedTools.includes(item.legacy)).length,
      };
    })
    .filter(group => group.actions.length > 0);
});
function actionGroupSelected(group: { actions: { legacy: string }[] }) {
  return group.actions.length > 0 && group.actions.every(item => form.allowedTools.includes(item.legacy));
}
function toggleActionGroup(group: { actions: { legacy: string }[] }) {
  const selected = new Set(form.allowedTools);
  if (actionGroupSelected(group)) group.actions.forEach(item => selected.delete(item.legacy));
  else group.actions.forEach(item => selected.add(item.legacy));
  form.allowedTools = [...selected];
}
const openKeyGroups = ref<string[]>([]);
function keyGroupExpanded(name: string) {
  return !!toolPickQuery.value.trim() || openKeyGroups.value.includes(name);
}
function toggleKeyGroup(name: string) {
  openKeyGroups.value = openKeyGroups.value.includes(name)
    ? openKeyGroups.value.filter(item => item !== name)
    : [...openKeyGroups.value, name];
}
function toggleAllKeyGroups() {
  openKeyGroups.value = openKeyGroups.value.length ? [] : actionGroups.value.map(group => group.name);
}
watch(toolPickQuery, () => {
  if (toolPickQuery.value.trim()) openKeyGroups.value = actionGroups.value.map(group => group.name);
});
const groupCallForLegacy = computed(() => {
  for (const [group, actions] of Object.entries(MCP_GROUP_ACTIONS)) {
    for (const [action, legacy] of Object.entries(actions)) {
      if (legacy === selected.value) return { group, action };
    }
  }
  return null;
});
const selectedTool = computed(() => tools.find(tool => tool.name === selected.value));
const requiredKeys = computed<string[]>(() => selectedTool.value?.inputSchema?.required || []);
interface ToolField {
  key: string;
  required: boolean;
  type: string;
  description: string;
  enum: any[];
  placeholder: string;
}
const toolArgs = reactive<Record<string, any>>({});
const toolDrafts = reactive<Record<string, string>>({});
const toolExtraArgs = reactive<Record<string, any>>({});
const toolJsonMode = ref(false);
const toolJsonModeError = ref('');
const toolResultMeta = ref<{ ok: boolean; ms: number | null } | null>(null);
type CredentialState = 'empty' | 'unverified' | 'checking' | 'valid' | 'invalid';
const credentialState = ref<CredentialState>('empty');
const credentialRole = ref('');
const credentialHint = ref('');
const normalizedServerToken = computed(() => serverToken.value.trim().replace(/^Bearer\s+/i, ''));
const looksLikeKeyPrefix = computed(() => /^esq_mcp_[A-Za-z0-9_-]+$/.test(normalizedServerToken.value));
const credentialLabel = computed(() => {
  if (!normalizedServerToken.value) return '待填入 key';
  if (credentialState.value === 'checking') return '验证中…';
  if (credentialState.value === 'valid') return credentialRole.value ? '有效 · ' + credentialRole.value : '有效';
  if (credentialState.value === 'invalid') return '无效 · 重新签发';
  return '待验证';
});
watch(serverToken, () => {
  credentialState.value = normalizedServerToken.value ? 'unverified' : 'empty';
  credentialRole.value = '';
  credentialHint.value = looksLikeKeyPrefix.value
    ? '这是 key 前缀，不是完整 key；请在密钥页点「复制 key」取回服务端加密保存的完整值。'
    : '';
});
const toolFields = computed<ToolField[]>(() => Object.entries(selectedTool.value?.inputSchema?.properties || {})
  .map(([key, raw]: [string, any]) => {
    const type = String(raw?.type || 'string');
    const description = String(raw?.description || '');
    return {
      key,
      required: requiredKeys.value.includes(key),
      type,
      description,
      enum: Array.isArray(raw?.enum) ? raw.enum : [],
      placeholder: type === 'integer' || type === 'number' ? '输入数字'
        : type === 'object' ? '{ }'
          : type === 'array' ? '[ ]'
            : description || ('输入 ' + key),
    };
  }));
const orderedToolFields = computed(() => [
  ...toolFields.value.filter(field => field.required),
  ...toolFields.value.filter(field => !field.required),
]);
const toolFieldErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {};
  for (const field of toolFields.value) {
    const draft = String(toolDrafts[field.key] ?? '').trim();
    const value = toolArgs[field.key];
    const empty = (field.type === 'object' || field.type === 'array') ? !draft : String(value ?? '').trim() === '';
    if (field.required && empty) {
      errors[field.key] = '必填';
      continue;
    }
    if ((field.type === 'object' || field.type === 'array') && draft) {
      try {
        JSON.parse(draft);
      } catch {
        errors[field.key] = 'JSON 格式不正确';
        continue;
      }
    }
    if ((field.type === 'integer' || field.type === 'number') && !empty && Number.isNaN(Number(value))) {
      errors[field.key] = '请输入数字';
    }
  }
  return errors;
});
const toolRequiredFilled = computed(() => requiredKeys.value.filter(key => !toolFieldErrors.value[key]).length);
const toolJsonModeErrorText = computed(() => {
  if (!toolJsonMode.value) return '';
  try {
    const parsed = JSON.parse(argsText.value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '参数必须是 JSON 对象';
    const missing = requiredKeys.value.filter(key => !(key in parsed));
    return missing.length ? '缺少必填参数：' + missing.join(', ') : '';
  } catch {
    return 'JSON 格式不正确';
  }
});
const toolRunBlockedReason = computed(() => {
  if (running.value) return '正在执行';
  if (isDemoMode) return '演示站没有可连接的 MCP 端点；请在服务端或浏览器扩展内试跑';
  if (!isBrowserMode && !normalizedServerToken.value) return '先填入服务端 MCP key 或 service token';
  if (!isBrowserMode && looksLikeKeyPrefix.value) return credentialHint.value;
  if (!isBrowserMode && credentialState.value === 'checking') return '正在验证 key';
  if (!isBrowserMode && credentialState.value === 'invalid') return credentialHint.value || 'key 无效，请重新签发';
  if (toolJsonMode.value) return toolJsonModeErrorText.value;
  const firstError = Object.entries(toolFieldErrors.value)[0];
  return firstError ? `${firstError[0]}：${firstError[1]}` : '';
});
const toolCanRun = computed(() => !toolRunBlockedReason.value);
watch(selected, () => resetToolArgs());
const filteredToolGroups = computed(() => MCP_TOOL_GROUPS
  .filter(group => toolGroup.value === 'all' || group.id === toolGroup.value)
  .map(group => ({
    ...group,
    tools: group.tools
      .filter(name => matchesTool(name, toolQuery.value) && matchesToolKind(name))
      .map(name => tools.find(tool => tool.name === name))
      .filter((tool): tool is typeof tools[number] => !!tool),
  }))
  .filter(group => group.tools.length));
const filteredActionCatalog = computed(() => {
  const q = toolQuery.value.trim().toLowerCase();
  return Object.entries(MCP_GROUP_ACTIONS)
    .map(([name, actions]) => {
      const items = Object.entries(actions)
        .map(([action, legacy]) => ({ action, legacy, tool: tools.find(item => item.name === legacy) }))
        .filter(item => !!item.tool)
        .filter(item => !q || name.toLowerCase().includes(q) || String(MCP_GROUP_DESCRIPTIONS[name] || '').toLowerCase().includes(q)
          || item.action.includes(q) || item.legacy.includes(q) || String(item.tool?.description || '').toLowerCase().includes(q))
        .filter(item => matchesToolKind(item.legacy));
      return { name, description: MCP_GROUP_DESCRIPTIONS[name] || '', actions: items };
    })
    .filter(group => group.actions.length > 0);
});
/* 分组目录默认只展开首组；搜索或权限筛选时自动展开全部命中分组，避免 15 组 130 个 action 铺满长滚动。 */
function catalogGroupExpanded(name: string) {
  return openCatalogGroups.value.includes(name);
}
function toggleCatalogGroup(name: string) {
  openCatalogGroups.value = openCatalogGroups.value.includes(name)
    ? openCatalogGroups.value.filter(item => item !== name)
    : [...openCatalogGroups.value, name];
}
watch([toolQuery, toolKindFilter], () => {
  if (toolQuery.value.trim() || toolKindFilter.value !== 'all') {
    openCatalogGroups.value = filteredActionCatalog.value.map(group => group.name);
  } else {
    openCatalogGroups.value = ['es_connections'];
  }
});
const visibleToolCount = computed(() => catalogView.value === 'groups'
  ? filteredActionCatalog.value.reduce((sum, group) => sum + group.actions.length, 0)
  : filteredToolGroups.value.reduce((sum, group) => sum + group.tools.length, 0));
const selectableGroups = computed(() => MCP_TOOL_GROUPS
  .map(group => ({
    ...group,
    tools: group.tools.filter(name => selectableTools.value.includes(name)
      && matchesTool(name, toolPickQuery.value)),
  }))
  .filter(group => group.tools.length));
const canCreate = computed(() => serverMode.value && availableConnections.value.length > 0);
const createBlockedReason = computed(() => {
  if (!serverMode.value || canCreate.value) return '';
  return '当前身份没有可签发 MCP key 的连接页面授权；请联系 ADMIN 分配连接菜单权限。';
});
const billingDays = computed(() => {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = [];
  let max = 1;
  for (let i = 6; i >= 0; i--) {
    const key = new Date(today - i * 86400000).toISOString().slice(0, 10);
    let total = 0;
    let activeKeys = 0;
    for (const item of filteredKeys.value) {
      const count = Number(item.dailyCounts?.[key] || 0);
      total += count;
      if (count > 0) activeKeys++;
    }
    if (total > max) max = total;
    days.push({ key, label: key.slice(5), total, keys: activeKeys });
  }
  return days.map(day => ({ ...day, height: Math.max(4, Math.round(day.total / max * 100)) }));
});
const billingTotal = computed(() => billingDays.value.reduce((sum, day) => sum + day.total, 0));

const totals = computed(() => ({
  active: keys.value.filter(k => k.enabled && !k.expired).length,
  today: keys.value.reduce((sum, k) => sum + Number(k.todayCount || 0), 0),
  month: keys.value.reduce((sum, k) => sum + Number(k.monthCount || 0), 0),
}));
const activeKeyCount = computed(() => totals.value.active);
const readyCount = computed(() => {
  let done = 0;
  if (protocolCheck.value?.ok) done += 1;
  if (serverMode.value ? activeKeyCount.value > 0 : isBrowserMode) done += 1;
  if (onboardingCopied.value) done += 1;
  if (auditCalls.value.length > 0) done += 1;
  return done;
});
const nearQuota = computed(() => keys.value.filter(k => k.enabled && !k.expired && (
  usagePercent(k.todayCount, k.dailyQuota) >= 80
  || usagePercent(k.monthCount, k.monthlyQuota) >= 80)).length);
const filteredKeys = computed(() => {
  const query = keyQuery.value.trim().toLowerCase();
  const list = keys.value.filter((k) => {
    if (query) {
      const haystack = [k.name, k.prefix, k.owner, k.role].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (keyRoleFilter.value !== 'all' && String(k.role || '') !== keyRoleFilter.value) return false;
    if (keyStatus.value === 'active') return k.enabled && !k.expired;
    if (keyStatus.value === 'revoked') return !k.enabled;
    if (keyStatus.value === 'expired') return !!k.expired;
    return true;
  });
  return [...list].sort((a, b) => {
    if (keySort.value === 'lastUsed') return Number(b.lastUsedAt || 0) - Number(a.lastUsedAt || 0);
    if (keySort.value === 'today') return Number(b.todayCount || 0) - Number(a.todayCount || 0);
    if (keySort.value === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });
});

function usagePercent(used: any, quota: any) {
  const u = Number(used) || 0;
  const q = Number(quota) || 0;
  return q > 0 ? Math.min(100, Math.round((u / q) * 100)) : 0;
}

function connectionLabel(id: string) {
  if (!id) return '—';
  if (id === 'host') return '宿主';
  const found = availableConnections.value.find((c: any) => String(c.id) === String(id));
  return found?.name ? String(found.name) : String(id);
}

function toolScopeLabel(k: any) {
  const tools = Array.isArray(k?.allowedTools) ? k.allowedTools : [];
  return `工具 ${tools.length}`;
}

function toggleKeyDetail(k: any) {
  expandedKeyId.value = expandedKeyId.value === k.id ? '' : k.id;
}

function selectKeyRow(k: any) {
  expandedKeyId.value = k.id;
}

const inspectedKey = computed<any | null>(() =>
  filteredKeys.value.find((k: any) => k.id === expandedKeyId.value)
  || keys.value.find((k: any) => k.id === expandedKeyId.value)
  || null);

type InspectorTabId = 'overview' | 'scope' | 'calls' | 'records';
const inspectorTab = ref<InspectorTabId>('overview');
watch(expandedKeyId, () => { inspectorTab.value = 'overview'; });
const inspectorTabs = computed<Array<{ id: InspectorTabId; label: string; badge: string }>>(() => {
  const k = inspectedKey.value;
  if (!k) return [];
  return [
    { id: 'overview', label: '概览', badge: '' },
    { id: 'scope', label: '范围', badge: (k.allowedTools || []).length ? `${keyToolGroups(k).length} 组` : '' },
    { id: 'calls', label: '调用', badge: (k.recentCalls || []).length ? String((k.recentCalls || []).length) : '' },
    { id: 'records', label: '记录', badge: (k.auditLog || []).length ? String((k.auditLog || []).length) : '' },
  ];
});
function keyConnectionStats(k: any) {
  const map = k?.connectionPermissions || {};
  const ids = Object.keys(map);
  return {
    total: ids.length || (k?.connections || []).length,
    write: ids.filter(id => (map[id] || []).includes('write')).length,
  };
}
function onInspectorTabKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const ids = inspectorTabs.value.map(t => t.id);
  if (!ids.length) return;
  const current = Math.max(0, ids.indexOf(inspectorTab.value));
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? ids.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
  inspectorTab.value = ids[nextIndex];
  nextTick(() => {
    const tabs = (event.currentTarget as HTMLElement)?.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  });
}

const browserSnippet = `await window.ESQueryStudioMCP.handle({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list'
})`;
const probeCommand = computed(() =>
  `node mcp/esquerystudio-mcp-cli.mjs probe --url ${endpoint.value} --token <esq_mcp_key>`);
async function copyProbeCommand() {
  await copyAndFlash(probeCommand.value, '接入自检命令已复制');
}

function keyMenuOptions(k: any): any[] {
  const items: any[] = [];
  if (canRevoke(k)) {
    items.push({ label: '编辑密钥', key: 'edit' });
    items.push({ label: '轮换密钥（旧 key 立即失效）', key: 'rotate' });
    items.push({ label: '撤销密钥', key: 'revoke', props: { style: 'color: var(--danger)' } });
  }
  if (canRevoke(k) && (k.allowedTools || []).length > 80) {
    items.push({ label: '精简到核心查询包', key: 'trim' });
  }
  items.push({ label: '以此为模板签发', key: 'clone' });
  return items;
}

function onKeyMenuAction(action: string, k: any) {
  if (action === 'edit') editKey(k);
  else if (action === 'rotate') rotateKey(k);
  else if (action === 'revoke') revokeKey(k);
  else if (action === 'trim') trimKey(k);
  else if (action === 'clone') cloneKey(inspectedKey);
}

function secretForCurrentView(k: any): string {
  const candidate = serverToken.value.trim();
  return candidate && candidate.startsWith(String(k?.prefix || '') + '.') ? candidate : '';
}

/** 服务端已加密保存的完整 key；旧版本 key 或解密失败返回空串（UI 再走轮换）。 */
async function revealSavedKey(k: any): Promise<string> {
  if (!k?.id) return '';
  try {
    const data = await api.mcpKeys.secret(k.id);
    const secret = String(data?.secret || '');
    if (secret) serverToken.value = secret;
    return secret;
  } catch {
    return '';
  }
}

/** 优先取回已保存的完整 key；旧 key 没有密文时明确询问是否轮换（轮换会立即失效旧 key）。 */
async function ensureCopyableKey(k: any): Promise<string> {
  const existing = secretForCurrentView(k);
  if (existing) return existing;
  const saved = await revealSavedKey(k);
  if (saved) return saved;
  const confirmed = await askConfirm({
    title: '轮换并保存完整 key',
    message: '该 key 由旧版本签发，完整值未加密保存。轮换后会生成并保存新的完整 key，旧 key 立即失效；权限、连接和配额保持不变。',
    level: 'warn',
    okText: '轮换并保存',
    facts: [{ label: '原 key', value: String(k.name || '') }, { label: '前缀', value: String(k.prefix || '') }],
  });
  if (!confirmed) return '';
  try {
    const data = await api.mcpKeys.rotate(k.id);
    const secret = String(data?.secret || '');
    if (!secret) throw new Error('服务端未返回轮换后的 key');
    newSecret.value = secret;
    newKey.value = data?.key || null;
    serverToken.value = secret;
    if (newKey.value?.id) expandedKeyId.value = newKey.value.id;
    await loadKeys();
    await loadAuditCalls();
    return secret;
  } catch (e: any) {
    keyErr.value = '轮换 key 失败：' + String(e?.message || e);
    return '';
  }
}

async function copyKeyFull(k: any) {
  const secret = await ensureCopyableKey(k);
  if (!secret) return;
  const ok = await copyText(secret);
  if (ok) flashCopyNotice('完整 key 已复制（服务端加密保存，可随时再复制）');
  else keyErr.value = '复制失败：浏览器拒绝了剪贴板访问，请打开密钥详情手动复制。';
}

const clientKeyNotice = ref('');
const clientKeyId = ref<string | null>(null);
const clientKeyOptions = computed(() => keys.value.map((k: any) => ({
  label: `${k.name} · ${k.prefix}${k.enabled === false ? '（已撤销）' : k.expired ? '（已过期）' : ''}`,
  value: k.id
})));
const activeKeyOptions = computed(() => keys.value
  .filter((k: any) => k.enabled !== false && !k.expired)
  .map((k: any) => ({ label: `${k.name} · ${k.prefix}`, value: k.id })));
const probeKeyId = ref<string | null>(null);
const trialKeyId = ref<string | null>(null);
const trialKeySelected = computed<any | null>(() => keys.value.find((k: any) => k.id === trialKeyId.value) || null);
const trialKeyScope = computed(() => trialKeySelected.value ? keyScopeText(trialKeySelected.value) : '');
const trialKeyWrite = computed(() => trialKeySelected.value ? keyScopeStats(trialKeySelected.value).write > 0 : false);
const clientKeySelected = computed<any | null>(() => keys.value.find((k: any) => k.id === clientKeyId.value) || null);
const clientKeyRevealedId = ref('');
const clientKeyReady = computed(() => !!(clientKeySelected.value
  && clientKeyRevealedId.value === clientKeySelected.value.id
  && secretForCurrentView(clientKeySelected.value)));

async function onClientKeyChange(id: string | null) {
  const key = keys.value.find((k: any) => k.id === id);
  clientKeyRevealedId.value = '';
  if (!key) { serverToken.value = ''; clientKeyNotice.value = ''; return; }
  const secret = secretForCurrentView(key) || await revealSavedKey(key);
  if (secret) {
    serverToken.value = secret;
    clientKeyRevealedId.value = key.id;
    clientKeyNotice.value = `已带入「${key.name}」的完整 key；选择客户端后直接复制配置即可。`;
  } else {
    serverToken.value = '';
    clientKeyNotice.value = `已选择「${key.name}」，该 key 由旧版本签发且完整值未保存；点「轮换并带入」生成并保存新值（旧 key 立即失效）。`;
  }
}

async function generateClientKey() {
  const key = clientKeySelected.value;
  if (!key) return;
  const secret = await ensureCopyableKey(key);
  if (!secret) return;
  clientKeyId.value = newKey.value?.id || key.id;
  clientKeyRevealedId.value = clientKeyId.value || '';
  clientKeyNotice.value = `已带入「${key.name}」的完整 key；选择客户端后直接复制配置即可。`;
  await nextTick();
  document.querySelector('.mcp-onboard')?.scrollIntoView({ block: 'start' });
}

async function openClientConfigForKey(k: any) {
  clientKeyId.value = k.id;
  clientKeyRevealedId.value = '';
  const secret = secretForCurrentView(k) || await revealSavedKey(k);
  if (secret) { serverToken.value = secret; clientKeyRevealedId.value = k.id; }
  clientKeyNotice.value = secret
    ? `已带入「${k.name}」的完整 key；选择客户端后直接复制配置即可。`
    : `已选择「${k.name}」，该 key 由旧版本签发且完整值未保存；点「轮换并带入」生成并保存新值（旧 key 立即失效）。`;
  tab.value = 'clients';
  onboardingClient.value = isBrowserMode ? 'browser' : 'claude-code';
  await nextTick();
  document.querySelector('.mcp-onboard')?.scrollIntoView({ block: 'start' });
}

const onboardingClientLabel = computed(() =>
  onboardingClients.find(client => client.id === onboardingClient.value)?.label || '客户端');
const onboardingTesting = ref(false);
const onboardingTest = ref<any>(null);
const clientKeyScope = computed(() => clientKeySelected.value ? keyScopeText(clientKeySelected.value) : '');
const clientKeyWrite = computed(() => clientKeySelected.value ? keyScopeStats(clientKeySelected.value).write > 0 : false);

async function testOnboarding() {
  onboardingTest.value = null;
  if (isDemoMode) {
    onboardingTest.value = { ok: false, message: '演示站没有可连接的 MCP 端点。' };
    return;
  }
  if (!isBrowserMode && ['local', 'stdio', 'browser', 'deepseek-harness'].includes(onboardingClient.value)) {
    onboardingTest.value = { ok: false, message: '该接入方式走本地进程或页面桥，无法从本页直接探测；请按生成的配置在客户端验证。' };
    return;
  }
  if (!isBrowserMode && !onboardingToken.value) {
    onboardingTest.value = { ok: false, message: '先选择一把已带入完整 key 的密钥，再测试配置。' };
    return;
  }
  onboardingTesting.value = true;
  const started = performance.now();
  try {
    let init: any;
    let list: any;
    if (isBrowserMode) {
      init = await handleMcpRequest({ jsonrpc: '2.0', id: Date.now(), method: 'initialize', params: {} });
      list = await handleMcpRequest({ jsonrpc: '2.0', id: Date.now() + 1, method: 'tools/list', params: {} });
    } else {
      init = await rpcServer('initialize', {});
      list = await rpcServer('tools/list', {});
    }
    if (init?.error) throw new Error(init.error.message || 'initialize failed');
    if (list?.error) throw new Error(list.error.message || 'tools/list failed');
    onboardingTest.value = {
      ok: true,
      ms: Math.round(performance.now() - started),
      protocol: init?.result?.protocolVersion || '—',
      serverName: init?.result?.serverInfo?.name || 'MCP',
      serverVersion: init?.result?.serverInfo?.version || '',
      tools: (list?.result?.tools || []).length,
      note: !isBrowserMode && onboardingTransport.value === 'sse'
        ? 'HTTP 鉴权与工具清单已验证；SSE 客户端使用同一密钥建立长连接。'
        : '',
    };
  } catch (e: any) {
    onboardingTest.value = { ok: false, message: String(e?.message || e) };
  } finally {
    onboardingTesting.value = false;
  }
}

function goClientsWithSecret() {
  closeSecretModal();
  clientKeyId.value = newKey.value?.id || null;
  clientKeyRevealedId.value = clientKeyId.value || '';
  clientKeyNotice.value = '已带入刚生成的完整 key；选择客户端后直接复制配置即可。';
  tab.value = 'clients';
  onboardingClient.value = 'claude-code';
  nextTick(() => document.querySelector('.mcp-onboard')?.scrollIntoView({ block: 'start' }));
}

async function copyKeyPrefix(k: any) {
  const text = String(k?.prefix || '');
  if (!text) return;
  const ok = await copyText(text);
  if (ok) {
    copiedKeyId.value = k.id;
    keyErr.value = '';
    flashCopyNotice('key 前缀已复制（完整 key 可在「复制 key」取回）');
    if (copiedKeyTimer) clearTimeout(copiedKeyTimer);
    copiedKeyTimer = setTimeout(() => { copiedKeyId.value = ''; }, 1600);
  } else {
    keyErr.value = `复制失败：浏览器拒绝了剪贴板访问。请手动选中前缀：${text}`;
    flashCopyNotice('复制失败：浏览器拒绝了剪贴板访问，请手动选中前缀。');
  }
}

function selectSecretText() {
  const el = document.querySelector('.mcp-secret-value') as HTMLElement | null;
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function downloadSecret() {
  if (!newSecret.value) return;
  const name = String(newKey.value?.name || form.name || 'mcp-key')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mcp-key';
  downloadText(`esquerystudio-${name}.env`,
    `ESQ_MCP_URL=${onboardingUrl.value}\nESQ_MCP_TOKEN=${newSecret.value}\n`, 'text/plain');
}

function closeSecretModal() {
  showSecretModal.value = false;
  newSecret.value = '';
  secretCopied.value = false;
  secretCopyError.value = '';
  rotatingSecret.value = false;
}

function csvCell(value: any) {
  const text = String(value == null ? '' : value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/** 导出当前筛选结果，供宿主/财务按 key 对账；使用 UTC ISO 时间与英文表头。 */
function dailySum(k: any, days: number) {
  const counts = k?.dailyCounts || {};
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let sum = 0;
  for (let i = 0; i < days; i++) {
    const key = new Date(todayUtc - i * 86400000).toISOString().slice(0, 10);
    sum += Number(counts[key] || 0);
  }
  return sum;
}

function exportDailyLedgerCsv() {
  const header = ['date', 'key', 'prefix', 'owner', 'role', 'count'];
  const rows = [header.join(',')];
  for (const k of filteredKeys.value) {
    const daily = k.dailyCounts || {};
    for (const date of Object.keys(daily).sort()) {
      rows.push([date, k.name, k.prefix, k.owner, k.role, Number(daily[date] || 0)]
        .map(csvCell).join(','));
    }
  }
  const blob = new Blob([String.fromCharCode(0xfeff) + rows.join(String.fromCharCode(13, 10))], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'esquerystudio-mcp-daily-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportAuditCsv() {
  const header = ['at', 'keyName', 'keyPrefix', 'method', 'tool', 'ok', 'ip', 'remoteIp', 'ua', 'http', 'ms', 'requestId'];
  const rows = [header.join(',')];
  for (const call of filteredAuditCalls.value) {
    rows.push([
      call.at ? new Date(Number(call.at)).toISOString() : '',
      call.keyName, call.keyPrefix, call.method, call.tool, call.ok === false ? 'failed' : 'ok',
      call.ip, call.remoteIp, call.ua, call.http, call.ms, call.requestId,
    ].map(csvCell).join(','));
  }
  const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'esquerystudio-mcp-audit-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportUsageCsv() {
  const header = ['name', 'prefix', 'owner', 'role', 'status', 'connections', 'writeConnections',
    'allowedTools', 'writeTools', 'requestsPerMinute', 'todayCount', 'dailyQuota',
    'monthCount', 'monthlyQuota', 'last7Days', 'last14Days', 'dailyCounts', 'auditLog', 'lastUsedAt', 'lastTool'];
  const rows = [header.join(',')];
  for (const k of filteredKeys.value) {
    const scoped = k.connectionPermissions || {};
    const writeConnections = Object.keys(scoped).filter(id => (scoped[id] || []).includes('write'));
    const tools = Array.isArray(k.allowedTools) ? k.allowedTools : [];
    const writeTools = tools.filter((tool: string) => MCP_WRITE_TOOLS.includes(tool));
    rows.push([
      k.name, k.prefix, k.owner, k.role, statusText(k),
      (k.connections || []).join('|'), writeConnections.join('|'),
      tools.length, writeTools.length, k.requestsPerMinute, k.todayCount, k.dailyQuota,
      k.monthCount, k.monthlyQuota, dailySum(k, 7), dailySum(k, 14), JSON.stringify(k.dailyCounts || {}), JSON.stringify(k.auditLog || []),
      k.lastUsedAt ? new Date(Number(k.lastUsedAt)).toISOString() : '', k.lastTool || '',
    ].map(csvCell).join(','));
  }
  const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'esquerystudio-mcp-keys-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sortedToolCounts(k: any) {
  const counts = k?.toolCounts || {};
  return Object.entries(counts).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));
}

/** 与服务端 dayKey 同口径（UTC），返回最近 14 天柱状数据；无历史时全部为 0 柱。 */
function dailySeries(k: any) {
  const counts = k?.dailyCounts || {};
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = [];
  let max = 1;
  for (let i = 13; i >= 0; i--) {
    const date = new Date(todayUtc - i * 86400000);
    const key = date.toISOString().slice(0, 10);
    const count = Number(counts[key] || 0);
    days.push({ key, count, label: key.slice(8) });
    if (count > max) max = count;
  }
  return days.map(day => ({ ...day, height: Math.max(4, Math.round(day.count / max * 100)) }));
}

const httpClientConfig = computed(() => JSON.stringify({
  mcpServers: {
    esquerystudio: {
      url: onboardingUrl.value,
      headers: { Authorization: 'Bearer ' + (newSecret.value || '<esq_mcp_...>') },
    },
  },
}, null, 2));

const clientConfig = computed(() => JSON.stringify({
  mcpServers: {
    esquerystudio: {
      command: 'node',
      args: ['/path/to/esquerystudio/mcp/esquerystudio-mcp-stdio.mjs'],
      env: { ESQ_MCP_URL: onboardingUrl.value, ESQ_MCP_TOKEN: newSecret.value || '<esq_mcp_...>' },
    },
  },
}, null, 2));

const curlSnippet = computed(() => `curl -s ${endpoint.value} \\
  -H 'Authorization: Bearer change-me' \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`);

function matchesTool(name: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (name.toLowerCase().includes(q)) return true;
  const definition = tools.find(tool => tool.name === name);
  return String(definition?.description || '').toLowerCase().includes(q);
}

function matchesToolKind(name: string) {
  if (toolKindFilter.value === 'all') return true;
  if (toolKindFilter.value === 'admin') return MCP_ADMIN_ONLY_TOOLS.includes(name);
  if (toolKindFilter.value === 'destructive') return isDestructive(name);
  if (toolKindFilter.value === 'write') return MCP_WRITE_TOOLS.includes(name) || name === 'es_rest';
  return !MCP_WRITE_TOOLS.includes(name) && name !== 'es_rest';
}

function groupSelected(group: { tools: string[] }) {
  return group.tools.length > 0 && group.tools.every(tool => form.allowedTools.includes(tool));
}

function toggleToolGroup(group: { tools: string[] }) {
  const selectedSet = new Set(form.allowedTools);
  if (groupSelected(group)) group.tools.forEach(tool => selectedSet.delete(tool));
  else group.tools.forEach(tool => selectedSet.add(tool));
  form.allowedTools = [...selectedSet];
}

function applyToolPack(packId: string) {
  const pack = toolPackOptions.value.find(item => item.id === packId);
  if (!pack) return;
  form.allowedTools = [...pack.tools];
}

function isDestructive(name: string) {
  return MCP_DESTRUCTIVE_TOOLS.includes(name);
}

function toolKind(name: string) {
  if (name === 'es_rest') return '读/写';
  return MCP_WRITE_TOOLS.includes(name) ? '写' : '读';
}

function toolKindClass(name: string) {
  if (name === 'es_rest') return 'rw';
  return MCP_WRITE_TOOLS.includes(name) ? 'write' : 'read';
}

/** 从任意入口开始签发：始终回到当前身份的最新范围，不继承上一次表单残留。 */
function openCreateKey() {
  openKeys();
  if (!showCreate.value) toggleCreate();
  else revealCreateForm();
}

function toggleCreate() {
  if (showCreate.value) {
    showCreate.value = false;
    editingId.value = '';
    return;
  }
  editingId.value = '';
  void loadAdminUsers();
  form.name = '';
  form.owner = '';
  form.role = viewerIsAdmin.value
    ? 'VIEWER'
    : String(keyMeta.value?.caller?.role || auth.me?.role || 'VIEWER');
  form.requestsPerMinute = 60;
  form.dailyQuota = 5000;
  form.monthlyQuota = 100000;
  form.expiresInDays = 0;
  form.permissions = ['read'];
  form.writeConnections = [];
  form.connections = viewerIsAdmin.value
    ? availableConnections.value.slice(0, 1).map(c => c.id)
    : availableConnections.value.map(c => c.id);
  form.allowedTools = [...(coreToolPack.value?.tools || selectableTools.value)];
  showCreate.value = true;
  revealCreateForm();
}

async function applyPreset(kind: 'readonly' | 'qa-write' | 'bulk') {
  form.connections = availableConnections.value.map(c => c.id);
  form.writeConnections = [];
  if (kind === 'readonly') {
    form.requestsPerMinute = 60;
    form.dailyQuota = 5000;
    form.monthlyQuota = 100000;
  } else {
    form.requestsPerMinute = kind === 'bulk' ? 120 : 60;
    form.dailyQuota = kind === 'bulk' ? 20000 : 5000;
    form.monthlyQuota = kind === 'bulk' ? 200000 : 100000;
  }
  /* 先决定工具面，再按「该工具面真正可写」的连接勾写，保证所见范围=后端复核范围。 */
  if (kind === 'bulk') {
    const preferred = ['es_bulk', 'es_index_doc', 'es_update_doc', 'es_delete_doc', 'es_search', 'es_count', 'es_msearch'];
    form.allowedTools = preferred.filter(tool => selectableTools.value.includes(tool));
  } else if (kind === 'qa-write') {
    applyToolPack('write');
  } else {
    applyToolPack('core');
  }
  await nextTick();
  if (kind !== 'readonly') {
    form.writeConnections = availableConnections.value
      .filter(c => canWriteConnection(c))
      .filter(c => c.id !== 'host')
      .filter(c => kind !== 'qa-write' || !/prod/i.test(String(c.id) + ' ' + String(c.name)))
      .map(c => c.id);
  }
}

/** 克隆/编辑时把 key 的旧范围投影到当前身份可签发范围：越界连接不留在表单里。 */
function hydrateKeyScope(k: any) {
  const availableIds = availableConnections.value.map((c: any) => String(c.id));
  const allowedIds = availableIds.length ? new Set(availableIds) : null;
  const originalConnections = [...(k.connections || ['host'])];
  /* ADMIN 编辑他人 key 时 ownerScope 还在加载，先保留原连接，等目标范围返回后由 watch 再收窄。 */
  form.connections = allowedIds
    ? originalConnections.filter((id: string) => allowedIds.has(String(id)))
    : originalConnections;
  const dropped = allowedIds
    ? originalConnections.filter((id: string) => !allowedIds.has(String(id))) : [];
  if (dropped.length) {
    keyErr.value = `当前身份已不包含连接 ${dropped.join('、')} 的授权；保存会把该 key 收窄到现有范围。`;
  }
  form.allowedTools = [...(k.allowedTools || [])];
  const scoped = k.connectionPermissions || {};
  form.writeConnections = form.connections
    .filter((id: string) => (scoped[id] || []).includes('write'))
    .filter((id: string) => {
      const conn = availableConnections.value.find((c: any) => String(c.id) === String(id));
      return !!conn && canWriteConnection(conn);
    });
}

function cloneKey(k: any) {
  editingId.value = '';
  showCreate.value = true;
  form.name = String(k.name || '') + '-copy';
  form.owner = k.owner || '';
  form.role = k.role || 'VIEWER';
  form.requestsPerMinute = Number(k.requestsPerMinute || 60);
  form.dailyQuota = Number(k.dailyQuota || 5000);
  form.monthlyQuota = Number(k.monthlyQuota || 100000);
  form.expiresInDays = 0;
  form.permissions = ['read'];
  hydrateKeyScope(k);
  revealCreateForm();
}

function editKey(k: any) {
  editingId.value = k.id;
  showCreate.value = true;
  form.name = k.name || '';
  form.owner = k.owner || '';
  form.role = k.role || 'VIEWER';
  form.requestsPerMinute = Number(k.requestsPerMinute || 60);
  form.dailyQuota = Number(k.dailyQuota || 5000);
  form.monthlyQuota = Number(k.monthlyQuota || 100000);
  form.expiresInDays = k.expiresAt
    ? Math.max(0, Math.ceil((Number(k.expiresAt) - Date.now()) / 86_400_000)) : 0;
  form.permissions = ['read'];
  hydrateKeyScope(k);
  revealCreateForm();
}

/** 已超客户端工具上限的 key：打开编辑并把工具收敛到核心包，仍需用户点保存，不静默改权限。 */
function trimKey(k: any) {
  editKey(k);
  const available = new Set(selectableTools.value);
  form.allowedTools = (coreToolPack.value?.tools || []).filter(tool => available.has(tool));
}

function selectTool(name: string) {
  selected.value = name;
  resetToolArgs();
}

function resetToolArgs() {
  for (const key of Object.keys(toolArgs)) delete toolArgs[key];
  for (const key of Object.keys(toolDrafts)) delete toolDrafts[key];
  for (const key of Object.keys(toolExtraArgs)) delete toolExtraArgs[key];
  argsText.value = '{}';
  toolJsonMode.value = false;
  toolJsonModeError.value = '';
  resultText.value = '';
  resultCopied.value = false;
  toolResultMeta.value = null;
}

function setToolBoolean(key: string, event: Event) {
  toolArgs[key] = (event.target as HTMLInputElement).checked;
}

function buildToolArgs(): Record<string, any> {
  const args: Record<string, any> = { ...toolExtraArgs };
  for (const field of toolFields.value) {
    const value = toolArgs[field.key];
    if (field.type === 'object' || field.type === 'array') {
      const draft = String(toolDrafts[field.key] ?? '').trim();
      if (!draft) continue;
      args[field.key] = JSON.parse(draft);
      continue;
    }
    if (field.type === 'boolean') {
      if (value === true || value === false) args[field.key] = value;
      continue;
    }
    const text = String(value ?? '').trim();
    if (!text) continue;
    args[field.key] = (field.type === 'integer' || field.type === 'number') ? Number(text) : text;
  }
  return args;
}

function applyToolArgs(parsed: Record<string, any>) {
  for (const key of Object.keys(toolExtraArgs)) delete toolExtraArgs[key];
  const known = new Set(toolFields.value.map(field => field.key));
  for (const [key, value] of Object.entries(parsed)) {
    if (!known.has(key)) {
      toolExtraArgs[key] = value;
      continue;
    }
    const field = toolFields.value.find(item => item.key === key)!;
    if (field.type === 'object' || field.type === 'array') {
      toolDrafts[key] = value == null ? '' : JSON.stringify(value, null, 2);
    } else if (field.type === 'boolean') {
      toolArgs[key] = value === true;
    } else {
      toolArgs[key] = value == null ? '' : String(value);
    }
  }
}

function toggleToolJson() {
  toolJsonModeError.value = '';
  if (!toolJsonMode.value) {
    try {
      argsText.value = JSON.stringify(buildToolArgs(), null, 2);
      toolJsonMode.value = true;
    } catch (e: any) {
      toolJsonModeError.value = 'JSON 格式不正确：' + String(e?.message || e);
    }
    return;
  }
  try {
    const parsed = JSON.parse(argsText.value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('参数必须是 JSON 对象');
    applyToolArgs(parsed);
    toolJsonMode.value = false;
  } catch (e: any) {
    toolJsonModeError.value = 'JSON 格式不正确：' + String(e?.message || e);
  }
}

async function copyResult() {
  resultCopied.value = await copyAndFlash(resultText.value, '结果已复制');
}

function clearResult() {
  resultText.value = '';
  resultCopied.value = false;
}

function toggleBrowserWrite() {
  setBrowserMcpWriteAllowed(browserWrite.value);
}

/** 浏览器里配好的连接一键导出为本地 Node MCP 的 mcp.json（含凭据，显式点击才生成）。 */
function exportLocalConfig() {
  const connections = profiles().map((p) => {
    const base = { id: p.id, name: p.name, url: p.url, username: p.username || '' };
    return p.authType === 'API_KEY'
      ? { ...base, apiKey: p.password || '' }
      : { ...base, password: p.password || '' };
  });
  const payload = { defaultConnection: activeProfile()?.id || connections[0]?.id || '', connections };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'esquerystudio-mcp.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function copyOnboardingConfig() {
  onboardingCopied.value = await copyAndFlash(onboardingConfig.value, '客户端配置已复制');
  if (onboardingCopied.value) setTimeout(() => { onboardingCopied.value = false; }, 1500);
}
async function copyDetectCommand() {
  detectCopied.value = await copyAndFlash('node mcp/esquerystudio-mcp-cli.mjs detect --json', '检测命令已复制');
  if (detectCopied.value) setTimeout(() => { detectCopied.value = false; }, 1500);
}

async function copyOnboardingInstall() {
  if (!onboardingInstallCommand.value) return;
  installCopied.value = await copyAndFlash(onboardingInstallCommand.value, '安装命令已复制');
  if (installCopied.value) setTimeout(() => { installCopied.value = false; }, 1500);
}

function downloadOnboardingConfig() {
  if (onboardingClient.value === 'dbx') return;
  const suffix = onboardingClient.value === 'browser'
    ? 'js'
    : onboardingClient.value === 'deepseek-harness' ? 'yml'
      : onboardingClient.value === 'codex' ? 'toml' : 'json';
  const mime = suffix === 'json' ? 'application/json'
    : suffix === 'yml' ? 'text/yaml'
      : suffix === 'toml' ? 'text/plain' : 'text/javascript';
  const blob = new Blob([onboardingConfig.value], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'esquerystudio-mcp-' + onboardingClient.value + '.' + suffix;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyTools() {
  const text = JSON.stringify(tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })), null, 2);
  if (await copyAndFlash(text, '工具 JSON 已复制')) resultText.value = '工具 JSON 已复制';
}

async function copyProtocolCatalog() {
  const text = JSON.stringify({
    protocolVersion: '2026-07-28',
    supportedVersions: ['2026-07-28', '2025-06-18'],
    tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })),
    resources: MCP_STATIC_RESOURCES,
    resourceTemplates: MCP_RESOURCE_TEMPLATES,
    prompts: MCP_PROMPTS,
  }, null, 2);
  if (await copyAndFlash(text, 'MCP 协议清单已复制')) resultText.value = 'MCP 协议清单已复制';
}

async function copyProtocolValue(value: string) {
  if (await copyAndFlash(value, '已复制')) {
    copiedValue.value = value;
    setTimeout(() => { if (copiedValue.value === value) copiedValue.value = ''; }, 1500);
  }
}

/** 服务端协议自检：真实往返 initialize + tools/resources/prompts 列表。 */
async function rpcServer(method: string, params: Record<string, any> = {}): Promise<any> {
  const res = await fetch(endpoint.value, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + serverToken.value.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error?.message || `HTTP ${res.status}`);
  if (payload?.error) throw new Error(payload.error.message || 'MCP JSON-RPC error');
  return payload;
}

async function runProtocolCheck() {
  if (checking.value || isDemoMode) return;
  checking.value = true;
  protocolCheck.value = null;
  const started = performance.now();
  try {
    if (!isBrowserMode) await ensureProbeToken();
    let init: any;
    let discover: any;
    let list: any;
    let resources: any;
    let templates: any;
    let prompts: any;
    let completion: any;
    if (isBrowserMode) {
      init = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
      discover = await handleMcpRequest({ jsonrpc: '2.0', id: 7, method: 'server/discover', params: {} });
      list = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      resources = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} });
      templates = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'resources/templates/list', params: {} });
      prompts = await handleMcpRequest({ jsonrpc: '2.0', id: 5, method: 'prompts/list', params: {} });
      completion = await handleMcpRequest({ jsonrpc: '2.0', id: 6, method: 'completion/complete', params: { argument: { name: 'connection', value: '' } } });
    } else {
      init = await rpcServer('initialize', {});
      discover = await rpcServer('server/discover', {});
      list = await rpcServer('tools/list', {});
      resources = await rpcServer('resources/list', {});
      templates = await rpcServer('resources/templates/list', {});
      prompts = await rpcServer('prompts/list', {});
      completion = await rpcServer('completion/complete', { argument: { name: 'connection', value: '' } });
    }
    if (init?.error) throw new Error(init.error.message || 'initialize failed');
    const supported = discover?.result?.supportedVersions || init?.result?.supportedVersions || [];
    protocolCheck.value = {
      ok: true,
      ms: Math.round(performance.now() - started),
      protocol: init?.result?.protocolVersion || '?',
      supported: Array.isArray(supported) ? supported.join(' / ') : '',
      server: init?.result?.serverInfo || discover?.result?.serverInfo || null,
      tools: (list?.result?.tools || []).length,
      resources: (resources?.result?.resources || []).length,
      templates: (templates?.result?.resourceTemplates || []).length,
      prompts: (prompts?.result?.prompts || []).length,
      completions: (completion?.result?.completion?.values || []).length,
    };
  } catch (e: any) {
    protocolCheck.value = { ok: false, ms: Math.round(performance.now() - started), message: String(e?.message || e) };
  } finally {
    checking.value = false;
  }
}

async function loadIndexChoices() {
  if (isDemoMode || (!isBrowserMode && !serverToken.value.trim())) return;
  try {
    const payload = isBrowserMode
      ? await handleMcpRequest({ jsonrpc: '2.0', id: Date.now(), method: 'completion/complete', params: { argument: { name: 'index', value: '' } } })
      : await rpcServer('completion/complete', { argument: { name: 'index', value: '' } });
    const values = payload?.result?.completion?.values;
    indexChoices.value = Array.isArray(values) ? values.map(String) : [];
  } catch {
    indexChoices.value = [];
  }
}

function openResource(resource: any) {
  selectedResource.value = resource;
  void loadIndexChoices();
  resourceResult.value = '';
  resourceError.value = '';
  resourceCopied.value = false;
  closePrompt();
  for (const key of Object.keys(resourceArgs)) delete resourceArgs[key];
  for (const match of String(resource.uri).matchAll(/\{([a-zA-Z0-9_]+)\}/g)) resourceArgs[match[1]] = '';
}

function closeResource() {
  selectedResource.value = null;
  resourceResult.value = '';
  resourceError.value = '';
  resourceCopied.value = false;
}

/** 资源读取：静态资源直接读；模板资源先填 {connection}/{index} 再读。 */
async function runResource() {
  if (!selectedResource.value || resourceRunning.value || resourceMissing.value.length) return;
  if (isDemoMode) {
    resourceError.value = '演示站没有可连接的 MCP 端点。';
    return;
  }
  if (!isBrowserMode && !serverToken.value.trim()) {
    resourceError.value = '请先填入服务端 MCP key 或 service token。';
    return;
  }
  resourceRunning.value = true;
  resourceError.value = '';
  resourceResult.value = '';
  try {
    const uri = resourceUri.value;
    const payload = isBrowserMode
      ? await handleMcpRequest({ jsonrpc: '2.0', id: Date.now(), method: 'resources/read', params: { uri } })
      : await rpcServer('resources/read', { uri });
    if (payload?.error) throw new Error(payload.error.message || 'resources/read failed');
    const contents = payload?.result?.contents || [];
    if (!contents.length) throw new Error('resources/read 没有返回内容');
    const text = typeof contents[0].text === 'string' ? contents[0].text : JSON.stringify(contents[0]);
    try { resourceResult.value = JSON.stringify(JSON.parse(text), null, 2); }
    catch { resourceResult.value = text; }
  } catch (e: any) {
    resourceError.value = '读取失败：' + String(e?.message || e);
  } finally {
    resourceRunning.value = false;
  }
}

async function copyResourceResult() {
  resourceCopied.value = await copyAndFlash(resourceResult.value, '资源结果已复制');
}

function openPrompt(prompt: any) {
  closeResource();
  void loadIndexChoices();
  selectedPrompt.value = prompt;
  promptResult.value = '';
  promptError.value = '';
  promptCopied.value = false;
  for (const key of Object.keys(promptArgs)) delete promptArgs[key];
  for (const arg of prompt.arguments || []) promptArgs[arg.name] = '';
}

function closePrompt() {
  selectedPrompt.value = null;
  promptResult.value = '';
  promptError.value = '';
  promptCopied.value = false;
}

/** 提示词试跑：真实调用三接入面统一的 prompts/get。 */
async function runPrompt() {
  if (!selectedPrompt.value || promptRunning.value || promptMissing.value.length) return;
  if (isDemoMode) {
    promptError.value = '演示站没有可连接的 MCP 端点。';
    return;
  }
  if (!isBrowserMode && !serverToken.value.trim()) {
    promptError.value = '请先填入服务端 MCP key 或 service token。';
    return;
  }
  promptRunning.value = true;
  promptError.value = '';
  promptResult.value = '';
  try {
    const params = { name: selectedPrompt.value.name, arguments: { ...promptArgs } };
    const payload = isBrowserMode
      ? await handleMcpRequest({ jsonrpc: '2.0', id: Date.now(), method: 'prompts/get', params })
      : await rpcServer('prompts/get', params);
    if (payload?.error) throw new Error(payload.error.message || 'prompts/get failed');
    const messages = payload?.result?.messages || [];
    promptResult.value = messages
      .map((message: any) => message?.content?.text || '')
      .filter((text: string) => text)
      .join('\n\n');
    if (!promptResult.value) throw new Error('prompts/get 没有返回文本');
  } catch (e: any) {
    promptError.value = '生成失败：' + String(e?.message || e);
  } finally {
    promptRunning.value = false;
  }
}

async function copyPromptResult() {
  promptCopied.value = await copyAndFlash(promptResult.value, '提示词已复制');
}

function credentialFailureMessage(error: any): string {
  const code = String(error?.code || '');
  const messages: Record<string, string> = {
    INVALID_MCP_KEY: 'key 无效：请粘贴完整 key（含 .secret）或重新签发',
    MCP_KEY_REVOKED: 'key 已撤销：请在「密钥与用量」重新签发',
    MCP_KEY_EXPIRED: 'key 已过期：请在「密钥与用量」重新签发',
    MCP_UNAUTHORIZED: '凭证无效：请确认 key / service token 与服务端一致',
  };
  if (messages[code]) return messages[code];
  if (error?.status === 401) return '凭证未通过：key 无效、已撤销或不是完整 key';
  return '验证失败：' + String(error?.message || error);
}

function credentialIsValid(): boolean {
  return credentialState.value === 'valid';
}

async function validateServerToken() {
  if (isBrowserMode || isDemoMode) return;
  const token = normalizedServerToken.value;
  if (!token) {
    credentialState.value = 'empty';
    credentialRole.value = '';
    credentialHint.value = '';
    return;
  }
  if (looksLikeKeyPrefix.value) {
    credentialState.value = 'invalid';
    credentialRole.value = '';
    credentialHint.value = '这是 key 前缀，不是完整 key；请在密钥页点「复制 key」取回服务端加密保存的完整值。';
    return;
  }
  credentialState.value = 'checking';
  credentialHint.value = '';
  try {
    const res = await fetch(endpoint.value, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const error: any = new Error(payload?.error?.message || `HTTP ${res.status}`);
      error.status = res.status;
      error.code = payload?.error?.data;
      throw error;
    }
    credentialState.value = 'valid';
    credentialRole.value = String(payload?.role || (payload?.auth === 'service-token' ? 'service token' : ''));
  } catch (e: any) {
    credentialState.value = 'invalid';
    credentialRole.value = '';
    credentialHint.value = credentialFailureMessage(e);
  }
}

async function runTool() {
  if (running.value) return;
  if (toolRunBlockedReason.value) {
    toolResultMeta.value = { ok: false, ms: null };
    resultText.value = toolRunBlockedReason.value;
    return;
  }
  if (!isBrowserMode && !isDemoMode && !credentialIsValid()) {
    await validateServerToken();
    if (!credentialIsValid()) {
      toolResultMeta.value = { ok: false, ms: null };
      resultText.value = '凭证未通过：' + credentialHint.value;
      return;
    }
  }
  let args: Record<string, any>;
  try {
    if (toolJsonMode.value) {
      const parsed = JSON.parse(argsText.value || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('参数必须是 JSON 对象');
      const missing = requiredKeys.value.filter(key => !(key in parsed));
      if (missing.length) throw new Error('缺少必填参数：' + missing.join(', '));
      args = parsed;
    } else {
      args = buildToolArgs();
    }
  } catch (e: any) {
    toolResultMeta.value = { ok: false, ms: null };
    resultText.value = '参数错误：' + String(e?.message || e);
    return;
  }
  running.value = true;
  resultText.value = '';
  resultCopied.value = false;
  toolResultMeta.value = null;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const groupCall = trialAsGroup.value ? groupCallForLegacy.value : null;
    const callName = groupCall ? groupCall.group : selected.value;
    const callArgs = groupCall ? { ...args, action: groupCall.action } : args;
    const data = isBrowserMode
      ? await mcpCallTool(callName, callArgs)
      : await callServerTool(callName, callArgs);
    resultText.value = JSON.stringify(data, null, 2);
    toolResultMeta.value = { ok: true, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) };
  } catch (e: any) {
    if (!isBrowserMode && (e?.status === 401 || e?.code)) {
      credentialState.value = 'invalid';
      credentialRole.value = '';
      credentialHint.value = credentialFailureMessage(e);
    }
    resultText.value = '失败：' + (!isBrowserMode && (e?.status === 401 || e?.code)
      ? credentialFailureMessage(e) : String(e?.message || e));
    toolResultMeta.value = { ok: false, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) };
  } finally {
    running.value = false;
  }
}

/** 服务端模式直接从面板试跑：真实 POST /mcp，凭证只在请求头中使用。 */
async function callServerTool(name: string, args: Record<string, any>): Promise<any> {
  const res = await fetch(endpoint.value, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + serverToken.value.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.error) {
    const error: any = new Error(payload?.error?.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.code = payload?.error?.data;
    throw error;
  }
  const result = payload?.result;
  if (result?.isError) {
    throw new Error(result?.content?.[0]?.text || 'MCP tool error');
  }
  if (result?.structuredContent != null) return result.structuredContent;
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') return result;
  try { return JSON.parse(text); } catch { return text; }
}

async function openKeys() {
  tab.value = 'keys';
  if (serverMode.value && !keys.value.length) await loadKeys();
}

async function openAudit() {
  tab.value = 'audit';
  if (serverMode.value || isBrowserMode) await loadAuditCalls();
}

async function openAuditForKey(key: any) {
  auditQuery.value = String(key?.prefix || key?.name || '');
  tab.value = 'audit';
  if (serverMode.value || isBrowserMode) await loadAuditCalls();
}

async function loadAdminUsers() {
  if (!serverMode.value || !viewerIsAdmin.value) return;
  try {
    const rows = await api.auth.users();
    adminUsers.value = Array.isArray(rows) ? rows : [];
  } catch {
    adminUsers.value = [];
  }
}

let keyLoadSeq = 0;
async function loadKeys() {
  if (!serverMode.value) return;
  const seq = ++keyLoadSeq;
  keyLoading.value = true;
  keyErr.value = '';
  try {
    const data = await api.mcpKeys.list();
    if (seq !== keyLoadSeq) return;
    keys.value = Array.isArray(data?.keys) ? data.keys : [];
    keyMeta.value = data || {};
    await nextTick();
    /* 首屏默认展开当前排序的第一把 key：右侧检查器直接展示权限/用量/最近调用，避免大片空面板。 */
    if (!expandedKeyId.value && filteredKeys.value.length) expandedKeyId.value = filteredKeys.value[0].id;
    measureKeyTable();
    if (!form.connections.some(id => availableConnections.value.some(c => c.id === id))) {
      /* 管理员的常用默认是宿主；普通用户默认列出自己全部授权连接（仍由后端逐连接校验）。 */
      form.connections = viewerIsAdmin.value
        ? availableConnections.value.slice(0, 1).map(c => c.id)
        : availableConnections.value.map(c => c.id);
      form.writeConnections = [];
    }
    /* 默认给最小可用的核心查询包；不让“全部工具”成为签发默认值。 */
    if (!form.allowedTools.length) form.allowedTools = [...(coreToolPack.value?.tools || selectableTools.value)];
  } catch (e: any) {
    if (seq === keyLoadSeq) keyErr.value = String(e?.message || e);
  } finally {
    if (seq === keyLoadSeq) keyLoading.value = false;
  }
}

async function createKey() {
  if (!canCreate.value || creating.value || !form.name.trim()) return;
  creating.value = true;
  keyErr.value = '';
  newSecret.value = '';
  try {
    const payload: any = {
      name: form.name.trim(),
      requestsPerMinute: Number(form.requestsPerMinute),
      dailyQuota: Number(form.dailyQuota),
      monthlyQuota: Number(form.monthlyQuota),
      expiresInDays: Number(form.expiresInDays),
      allowedTools: [...form.allowedTools],
    };
    if (viewerIsAdmin.value) {
      if (form.owner.trim()) payload.owner = form.owner.trim();
      payload.role = form.role;
    }
    payload.permissions = ['read'];
    payload.connections = [...form.connections];
    payload.connectionPermissions = Object.fromEntries(form.connections.map((id: string) => [
      id,
      form.writeConnections.includes(id) ? ['read', 'write'] : ['read'],
    ]));
    if (editingId.value) {
      const { owner: _owner, role: _role, ...updatePayload } = payload;
      await api.mcpKeys.update(editingId.value, updatePayload);
      showCreate.value = false;
      editingId.value = '';
      await loadKeys();
      return;
    }
    const data = await api.mcpKeys.create(payload);
    newSecret.value = String(data?.secret || '');
    if (newSecret.value) {
      serverToken.value = newSecret.value;
      showSecretModal.value = true;
      rotatingSecret.value = false;
    }
    newKey.value = data?.key || null;
    secretCopied.value = false;
    secretCopyError.value = '';
    showCreate.value = false;
    await loadKeys();
    await loadAuditCalls();
  } catch (e: any) {
    keyErr.value = String(e?.message || e);
  } finally {
    creating.value = false;
  }
}

async function rotateKey(k: any) {
  if (!k?.id || !canRevoke(k)) return;
  const confirmed = await askConfirm({
    title: '轮换密钥',
    message: `轮换「${k.name}」后旧 key 会立即失效，新明文只显示一次；请把新 key 更新到所有客户端。`,
    level: 'warn',
    okText: '轮换密钥',
    facts: [{ label: '名称', value: String(k.name || '') }, { label: '前缀', value: String(k.prefix || '') }],
  });
  if (!confirmed) return;
  try {
    const data = await api.mcpKeys.rotate(k.id);
    newSecret.value = String(data?.secret || '');
    if (newSecret.value) {
      serverToken.value = newSecret.value;
      showSecretModal.value = true;
      rotatingSecret.value = true;
    }
    newKey.value = data?.key || k;
    secretCopied.value = false;
    secretCopyError.value = '';
    await loadKeys();
    await loadAuditCalls();
  } catch (e: any) {
    keyErr.value = String(e?.message || e);
  }
}

async function revokeKey(k: any) {
  if (!k?.id || !canRevoke(k)) return;
  const confirmed = await askConfirm({
    title: '撤销密钥',
    message: `撤销「${k.name}」后，使用该 key 的客户端会立即收到 401，且不可恢复。`,
    level: 'critical',
    guardText: String(k.prefix || ''),
    okText: '撤销密钥',
    facts: [{ label: '名称', value: String(k.name || '') }, { label: '前缀', value: String(k.prefix || '') }],
  });
  if (!confirmed) return;
  try {
    await api.mcpKeys.revoke(k.id);
    await loadKeys();
  } catch (e: any) {
    keyErr.value = String(e?.message || e);
  }
}

async function copySecret() {
  const ok = await copyText(newSecret.value);
  secretCopied.value = ok;
  secretCopyError.value = ok ? '' : '复制失败：浏览器拒绝了剪贴板访问。已为你全选 key，请按 Ctrl+C。';
  if (!ok) selectSecretText();
}

function canRevoke(k: any) {
  return serverMode.value && k?.enabled && !k?.expired
    && (viewerIsAdmin.value || k.owner === auth.me?.username);
}

function auditActionLabel(action: string) {
  return ({ create: '签发', update: '编辑', rotate: '轮换', revoke: '撤销' } as Record<string, string>)[action] || action;
}

function statusText(k: any) {
  if (!k.enabled) return '已撤销';
  if (k.expired) return '已过期';
  return '启用';
}

function statusClass(k: any) {
  if (!k.enabled) return 'off';
  if (k.expired) return 'expired';
  return 'on';
}

function fmtTime(ms: number) {
  return new Date(Number(ms)).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

watch(selectableTools, () => {
  const allowed = new Set(selectableTools.value);
  form.allowedTools = form.allowedTools.filter(tool => allowed.has(tool));
});
watch(() => form.connections, () => {
  form.writeConnections = form.writeConnections.filter(id => form.connections.includes(id));
}, { deep: true });
/* 写工具变化 / 可用连接变化时，实时收回不再可写的连接勾选——
   不能让界面保留一个后端会拒绝的 write。 */
watch(() => form.allowedTools.slice(), () => {
  if (!selectedWriteTools.value.length) {
    form.writeConnections = [];
    return;
  }
  form.writeConnections = form.writeConnections.filter(id => {
    const conn = availableConnections.value.find((c: any) => String(c.id) === String(id));
    return !!conn && canWriteConnection(conn);
  });
});
watch(availableConnections, (list) => {
  const ids = new Set(list.map((c: any) => String(c.id)));
  if (delegatedOwnerSelected.value && ownerScope.value) {
    form.connections = form.connections.filter((id: string) => ids.has(String(id)));
  }
  form.writeConnections = form.writeConnections.filter(id => {
    const conn = list.find((c: any) => String(c.id) === String(id));
    return !!conn && canWriteConnection(conn);
  });
}, { deep: true });

function toolSummary(k: any) {
  const counts = k?.toolCounts || {};
  const entries = Object.entries(counts).sort((a: any, b: any) => Number(b[1]) - Number(a[1])).slice(0, 3);
  return entries.map(([name, n]) => `${name} ${n}`).join(' · ');
}

/** Key Inspector 默认按 15 组汇总，130 个动作收进「查看全部」，避免台账详情被工具墙淹没。 */
function keyToolGroups(k: any) {
  const allowed = new Set<string>(k?.allowedTools || []);
  return Object.entries(MCP_GROUP_ACTIONS)
    .map(([name, actions]) => {
      const legacy = Object.values(actions) as string[];
      const selected = legacy.filter(tool => allowed.has(tool));
      return {
        name,
        count: selected.length,
        write: selected.filter(tool => MCP_WRITE_TOOLS.includes(tool)).length,
      };
    })
    .filter(group => group.count > 0);
}

function scopeLabel(k: any) {
  const map = k.connectionPermissions || {};
  const ids = Object.keys(map);
  if (!ids.length) return (k.permissions || ['read']).join('+');
  const writable = ids.filter(id => (map[id] || []).includes('write')).length;
  return writable ? `写 ${writable} / 共 ${(k.connections || ids).length}` : '全只读';
}
function keyScopeStats(k: any) {
  const map = k?.connectionPermissions || {};
  const ids = Object.keys(map);
  const write = ids.filter(id => (map[id] || []).includes('write')).length;
  return { total: ids.length, write };
}
function keyScopeText(k: any) {
  if (!k) return '';
  const stats = keyScopeStats(k);
  return `读 ${stats.total} · 写 ${stats.write}`;
}

watch(() => props.show, (show) => {
  if (show) {
    resultText.value = '';
    if (tab.value === 'keys' && serverMode.value) loadKeys();
    if (tab.value === 'audit' && (serverMode.value || isBrowserMode)) loadAuditCalls();
  }
});
watch(tab, value => {
  if (value === 'audit' && (serverMode.value || isBrowserMode)) loadAuditCalls();
  else if (value !== 'audit') stopAuditLive();
  if (value === 'keys' && serverMode.value) loadKeys();
  if (value === 'clients') void autoPickSingleKey();
});
watch(() => keys.value.length, () => { if (tab.value === 'clients') void autoPickSingleKey(); });

/** 只有一把活跃 key 时直接带入客户端配置，少一步「选 key」；多把时保留手动选择。 */
async function autoPickSingleKey() {
  if (!serverMode.value || clientKeyId.value) return;
  const active = keys.value.filter((k: any) => k.enabled !== false && !k.expired);
  if (active.length !== 1) return;
  clientKeyId.value = active[0].id;
  await onClientKeyChange(active[0].id);
}

/* ── 权限链路（顶部贯穿五段）：客户端 → 传输 → 凭证 → 范围 → 审计 ── */
const traceClient = computed(() => onboardingClientLabel.value);
const traceClientSub = computed(() => `${onboardingClientCount} 个客户端可选`);
const traceTransport = computed(() => isBrowserMode ? 'PAGE BRIDGE'
  : onboardingTransport.value === 'sse' ? 'SSE' : 'HTTP');
const traceTransportSub = computed(() => isBrowserMode
  ? 'window.ESQueryStudioMCP'
  : `surface=${onboardingSurface.value}`);
const traceKey = computed<any | null>(() => clientKeySelected.value
  || keys.value.find((item: any) => item.id === probeKeyId.value)
  || null);
const traceAuth = computed(() => {
  if (traceKey.value) return traceKey.value.prefix;
  return activeKeyCount.value ? `${activeKeyCount.value} 把活跃 key` : '未签发';
});
const traceAuthSub = computed(() => clientKeySelected.value ? '当前接入 key'
  : traceKey.value ? '体检凭证' : 'Bearer key');
const traceScopeStats = computed(() => {
  const selectedKey = traceKey.value;
  if (selectedKey) return keyScopeStats(selectedKey);
  const ids = new Set<string>();
  const writeIds = new Set<string>();
  for (const key of keys.value.filter((item: any) => item.enabled !== false && !item.expired)) {
    const map = key.connectionPermissions || {};
    for (const id of Object.keys(map)) {
      ids.add(id);
      if ((map[id] || []).includes('write')) writeIds.add(id);
    }
  }
  return { total: ids.size, write: writeIds.size };
});
const traceScope = computed(() => {
  const stats = traceScopeStats.value;
  if (!stats.total) return '未授权连接';
  return `读 ${stats.total} · 写 ${stats.write}`;
});
const traceScopeSub = computed(() => traceKey.value ? '该 key 的实际范围' : '全部活跃 key');
const traceAudit = computed(() => `${auditCalls.value.length} 条`);
const traceAuditSub = computed(() => `${auditIpCount.value} 个来源 IP · ${auditRetentionDays.value} 天`);

/** 体检凭证：优先当前已带入的 key；否则只自动取唯一活跃 key，多把时必须显式选择。 */
async function ensureProbeToken(): Promise<string> {
  const current = serverToken.value.trim();
  if (current) return current;
  if (probeKeyId.value) {
    const key = keys.value.find((item: any) => item.id === probeKeyId.value);
    const secret = key ? await revealSavedKey(key) : '';
    if (secret) return secret;
    throw new Error('该 key 的完整值未保存，请到「密钥」页轮换后再体检。');
  }
  const active = keys.value.filter((item: any) => item.enabled !== false && !item.expired);
  if (active.length === 1) {
    probeKeyId.value = active[0].id;
    const secret = await revealSavedKey(active[0]);
    if (secret) return secret;
    throw new Error('该 key 的完整值未保存，请到「密钥」页轮换后再体检。');
  }
  if (active.length > 1) throw new Error('当前有多把活跃 key，请在上方「体检凭证」选择一把。');
  throw new Error('还没有可用的 MCP key，请先在「密钥」页签发。');
}

async function onProbeKeyChange(id: string | null) {
  probeKeyId.value = id || null;
  if (!id) return;
  const key = keys.value.find((item: any) => item.id === id);
  if (key) await revealSavedKey(key);
}

async function onTrialKeyChange(id: string | null) {
  trialKeyId.value = id || null;
  if (!id) return;
  const key = keys.value.find((item: any) => item.id === id);
  if (!key) return;
  const secret = secretForCurrentView(key) || await revealSavedKey(key);
  if (!secret) {
    credentialState.value = 'invalid';
    credentialHint.value = '该 key 的完整值未保存，请到「密钥」页轮换后再试跑。';
    return;
  }
  await nextTick();
  credentialState.value = 'valid';
  credentialRole.value = key.role || '';
  credentialHint.value = '';
}

async function copyDoctorReport() {
  if (!protocolCheck.value) return;
  const report = {
    at: new Date().toISOString(),
    endpoint: endpoint.value,
    mode: serverMode.value ? 'server' : isBrowserMode ? 'browser' : 'demo',
    ...protocolCheck.value,
  };
  await copyAndFlash(JSON.stringify(report, null, 2), '体检报告已复制');
}

/* 密钥空态的三张用途卡：数字从当前可选工具包派生，避免写死。 */
function connectionCoversTools(c: any, toolList: string[]) {
  const supported = new Set(connectionWritableTools(c));
  return toolList.filter(isWriteCapableTool).every(tool => supported.has(tool));
}
const keyPresetCards = computed(() => {
  const writePack = toolPackOptions.value.find(pack => pack.id === 'write');
  const qaTools = (writePack?.tools || []).filter(isWriteCapableTool);
  const bulkToolList = ['es_bulk', 'es_index_doc', 'es_update_doc', 'es_delete_doc', 'es_search', 'es_count', 'es_msearch']
    .filter(tool => selectableTools.value.includes(tool));
  const qaTargets = qaTools.length ? availableConnections.value.filter(c => c.write && c.id !== 'host'
    && !/prod/i.test(String(c.id) + ' ' + String(c.name)) && connectionCoversTools(c, qaTools)) : [];
  const bulkTargets = bulkToolList.some(isWriteCapableTool)
    ? availableConnections.value.filter(c => connectionCoversTools(c, bulkToolList)) : [];
  return [
    { id: 'readonly' as const, label: '只读分析', scope: '全部连接只读', tools: `核心查询 ${coreToolPack.value?.tools.length || 0} 个工具`, note: '分析师、报表与巡检 Agent', disabled: false, reason: '' },
    { id: 'qa-write' as const, label: 'QA / UAT 可写', scope: '生产只读 · 测试环境读写', tools: `写工具包 ${qaTools.length} 个写工具`, note: qaTargets.length ? '联调、测试自动化与演练' : '当前身份没有可写的 QA/UAT 连接', disabled: qaTargets.length === 0, reason: '当前身份没有覆盖写工具包的 QA/UAT 连接写授权' },
    { id: 'bulk' as const, label: '批量写入', scope: '写连接 + 批量工具', tools: `${bulkToolList.length} 个数据工具`, note: bulkTargets.length ? '导入、清洗与数据回填' : '当前身份没有覆盖批量工具的写连接', disabled: bulkTargets.length === 0, reason: '当前身份没有覆盖批量工具的连接写授权' },
  ];
});

function startKeyPreset(kind: 'readonly' | 'qa-write' | 'bulk') {
  const card = keyPresetCards.value.find(item => item.id === kind);
  if (card?.disabled) return;
  if (!showCreate.value) toggleCreate();
  const names = { readonly: 'analyst-readonly', 'qa-write': 'qa-uat-writer', bulk: 'bulk-loader' };
  form.name = names[kind];
  void nextTick(() => applyPreset(kind));
}
</script>

<style scoped>
.mcp-panel { display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - var(--vh-offset) + 60px); overflow-y: auto; padding-right: 2px; }
.mcp-banner { display: flex; align-items: flex-start; gap: 8px; padding: 2px 0 2px 10px; border: 0; border-left: 2px solid var(--ac); border-radius: 0; background: transparent; color: var(--tx1); font-size: var(--fs-sm); line-height: 1.6; }
.mcp-banner.browser { border-left-color: var(--warn); color: var(--tx1); }
.mcp-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ac-hi); margin-top: 6px; flex-shrink: 0; }
.mcp-banner.browser .mcp-dot { background: var(--warn); }
.mcp-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
.mcp-tab { border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--tx2); font-size: var(--fs-sm); padding: var(--sp-1h) var(--sp-2h); cursor: pointer; }
.mcp-tab:hover { color: var(--tx1); }
.mcp-tab.active { color: var(--ac-hi); border-bottom-color: var(--ac-hi); }
.mcp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
.mcp-card { border: 0; border-radius: 0; padding: 0; background: transparent; min-width: 0; }
.mcp-card h3 { margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); font-size: var(--fs-sm); color: var(--tx0); }
.mcp-hint { margin: var(--sp-2) 0 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.6; }
.mcp-protocol { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
.mcp-protocol-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.mcp-protocol-head h3 { flex: 1 1 auto; margin: 0; padding: 0; border: 0; }
.mcp-protocol-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; margin-top: 10px; }
.mcp-protocol-col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mcp-resource { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 8px; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--r-s); background: transparent; text-align: left; cursor: pointer; }
.mcp-resource:hover { background: var(--bg-alt); }
.mcp-resource code { grid-column: 1; color: var(--ac-hi); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.mcp-resource span { grid-column: 1; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-resource em { grid-column: 2; grid-row: 1 / span 2; font-style: normal; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-check-result { margin-top: 8px; padding: 6px 8px; border-radius: var(--r-s); background: var(--ac-soft); color: var(--ac-hi); font-size: var(--fs-xs); }
.mcp-check-result.bad { background: var(--warn-soft, #fff7e6); color: var(--warn); }
.mcp-onboard { margin-top: 18px; }
.mcp-onboard-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.mcp-onboard-head h3 { border: 0; margin: 0; padding: 0; white-space: nowrap; }
.mcp-client-chips, .mcp-transport-toggle { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mcp-transport-toggle { margin: 6px 0; }
.mcp-client-chip { height: 30px; flex-shrink: 0; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); cursor: pointer; font-size: var(--fs-xs); }
.mcp-client-chip:hover { background: var(--bg-alt); }
.mcp-client-chip.active { background: var(--ac-soft); border-color: var(--ac-line); color: var(--ac-hi); }
.mcp-client-note { margin: 6px 0 0; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-troubleshoot { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--tx2); font-size: var(--fs-2xs); line-height: 1.65; }
.mcp-troubleshoot-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--tx1); }
.mcp-troubleshoot-head b { font-size: var(--fs-xs); }
.mcp-troubleshoot ol { margin: 6px 0 0; padding-left: 18px; }
.mcp-troubleshoot li + li { margin-top: 4px; }
.mcp-troubleshoot-url { color: var(--ac-hi); overflow-wrap: anywhere; }
.mcp-onboarding-local { margin-top: 6px; }
.mcp-client-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-top: 8px; }
.mcp-prompt-play { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.mcp-prompt-play-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.mcp-prompt-play-head .mcp-link-btn { margin-left: auto; }
.mcp-prompt-form { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.mcp-prompt-form label { display: flex; flex: 1 1 190px; min-width: 0; flex-direction: column; gap: 2px; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-prompt-form label b { color: var(--danger, #d03050); font-weight: 600; }
.mcp-prompt-form .mcp-filter { width: 100%; }
.mcp-prompt-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
.mcp-prompt-result { max-height: 220px; overflow: auto; white-space: pre-wrap; }
.mcp-code, .mcp-result, .mcp-args { font-family: var(--mono); font-size: var(--fs-xs); line-height: 1.6; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-s); padding: var(--sp-2); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto; }
.mcp-code { margin: var(--sp-2) 0 0; color: var(--tx1); }
.mcp-tool-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.mcp-filter, .mcp-filter-select { height: 30px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); padding: 0 8px; font-size: var(--fs-xs); box-shadow: none; }
.mcp-filter { flex: 1; min-width: 0; }
.mcp-filter-select { width: 150px; flex-shrink: 0; padding: 0; }
.mcp-filter-select :deep(.n-base-selection__border) { border: 0; box-shadow: none; }
.mcp-filter-select :deep(.n-base-selection) { min-height: 28px; }
.mcp-kind-filter { width: 124px; }
.mcp-tools { display: flex; flex-direction: column; margin-bottom: 8px; max-height: 300px; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-s); padding: 0 4px; }
.mcp-tool-group { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 4px; background: var(--bg-alt); border-bottom: 1px solid var(--line); color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-tool-group em { font-style: normal; }
.mcp-tool { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 6px 4px; background: transparent; color: var(--tx2); cursor: pointer; font-size: var(--fs-xs); }
.mcp-tool:last-child { border-bottom: 0; }
.mcp-tool:hover, .mcp-tool.active { background: var(--bg-alt); color: var(--tx1); }
.mcp-tool code { color: var(--ac-hi); font-size: var(--fs-xs); }
.mcp-tool span { font-size: var(--fs-xs); line-height: 1.4; }
.mcp-tool-line { display: flex; align-items: flex-start; gap: 5px; }
.mcp-kind { flex-shrink: 0; border-radius: 99px; padding: 0 5px; font-size: var(--fs-2xs); line-height: 1.5; background: var(--bg); border: 1px solid var(--line); color: var(--tx2); }
.mcp-kind.read { color: var(--ac-hi); border-color: var(--ac-line); }
.mcp-kind.write { color: var(--warn); border-color: var(--warn); }
.mcp-kind.rw { color: var(--tx1); border-color: var(--tx2); }
.mcp-kind.destroy { color: var(--danger, #d03050); border-color: var(--danger, #d03050); }
.mcp-kind.admin { color: var(--warn); border-color: var(--warn); border-style: dashed; }
.mcp-role-warning { color: var(--warn); }
.mcp-clients-boundary { color: var(--warn); }
.mcp-audit-list { display: flex; flex-direction: column; margin-top: 8px; border: 1px solid var(--line); border-radius: var(--r-s); max-height: 220px; overflow: auto; }
.mcp-audit-row { cursor: pointer; }
.mcp-audit-row:last-child td { border-bottom: 0; }
.mcp-copy { margin-top: 2px; }
.mcp-play { display: flex; flex-direction: column; gap: var(--sp-2); }
.mcp-play-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }
.mcp-play-head h3 { margin: 0; }
.mcp-play-group-toggle { margin-top: 4px; }
.mcp-play-sub { margin: 3px 0 0; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-play-auth { display: flex; align-items: center; gap: 6px; flex: 1 1 300px; min-width: 240px; max-width: 420px; }
.mcp-play-auth .mcp-filter { flex: 1 1 auto; min-width: 0; height: 30px; box-sizing: border-box; }
.mcp-play-auth em { flex: 0 0 auto; font-style: normal; color: var(--tx3); font-size: var(--fs-2xs); white-space: nowrap; }
.mcp-play-auth.ready em { color: var(--ac-hi); }
.mcp-auth-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); flex: 0 0 auto; }
.mcp-play-auth.ready .mcp-auth-dot { background: var(--ac); }
.mcp-play-auth.invalid .mcp-filter { border-color: var(--warn); }
.mcp-play-auth.invalid em { color: var(--warn); }
.mcp-play-auth.invalid .mcp-auth-dot { background: var(--warn); }
.mcp-cred-check { flex: 0 0 auto; padding: 0 2px; white-space: nowrap; }
.mcp-cred-error { margin: 0; color: var(--warn); font-size: var(--fs-2xs); }
.mcp-play-row { display: flex; gap: 6px 8px; align-items: center; flex-wrap: wrap; }
.mcp-tool-select { flex: 1 1 260px; min-width: 0; }
.mcp-field-select { width: 100%; }
.mcp-select { flex: 1; height: 30px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); padding: 0 8px; }
.mcp-tool-kind { height: 20px; padding: 0 7px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 99px; color: var(--tx2); font-size: var(--fs-2xs); white-space: nowrap; }
.mcp-tool-kind.write { color: var(--warn); border-color: var(--warn); }
.mcp-tool-kind.admin { color: #c58af9; border-color: #7c4d9f; }
.mcp-json-toggle { margin-left: auto; white-space: nowrap; }
.mcp-tool-desc { margin: 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.55; }
.mcp-play-grid { display: grid; grid-template-columns: minmax(0, 1.06fr) minmax(0, .94fr); gap: 12px; align-items: stretch; }
.mcp-play-form { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.mcp-fields { display: flex; flex-direction: column; gap: 9px; max-height: 336px; overflow: auto; padding-right: 4px; }
.mcp-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mcp-field-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 6px; min-width: 0; }
.mcp-field-head b { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-xs); font-weight: 600; }
.mcp-field-head em { font-style: normal; color: var(--warn); font-size: var(--fs-2xs); }
.mcp-field-head code { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-field-desc { flex: 1 1 160px; min-width: 0; color: var(--tx3); font-size: var(--fs-2xs); line-height: 1.4; }
.mcp-field-input { width: 100%; height: 30px; box-sizing: border-box; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); padding: 0 8px; font-family: var(--mono); font-size: var(--fs-xs); }
.mcp-field-input:focus { outline: none; border-color: var(--ac-line); }
.mcp-field-json { height: auto; min-height: 62px; max-height: 120px; padding: 6px 8px; resize: vertical; line-height: 1.5; }
.mcp-field.invalid .mcp-field-input { border-color: var(--warn); }
.mcp-field-check { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-field-check input { accent-color: var(--ac); }
.mcp-field-error { color: var(--warn); font-size: var(--fs-2xs); }
.mcp-no-args { margin: 0; padding: 8px 0; }
.mcp-play-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: auto; }
.mcp-play-result { min-width: 0; display: flex; flex-direction: column; gap: 6px; border-left: 1px solid var(--line); padding-left: 12px; }
.mcp-result-head { display: flex; align-items: center; gap: 8px; min-height: 24px; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-result-status { padding: 0 7px; border: 1px solid var(--line); border-radius: 99px; line-height: 18px; }
.mcp-result-status.ok { color: var(--ac-hi); border-color: var(--ac-line); }
.mcp-result-status.fail { color: var(--warn); border-color: var(--warn); }
.mcp-result-copy { margin-left: auto; }
.mcp-result-play { margin: 0; max-height: 360px; min-height: 120px; box-sizing: border-box; }
.mcp-result-empty { margin: 0; min-height: 120px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--line); border-radius: var(--r-s); }
@media (max-width: 900px) {
  .mcp-play-grid { grid-template-columns: minmax(0, 1fr); }
  .mcp-play-result { border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 8px; }
  .mcp-play-auth { flex-basis: 100%; max-width: none; }
}
.mcp-args { min-height: 70px; max-height: 120px; width: 100%; box-sizing: border-box; resize: vertical; }
.mcp-result { margin: 0; color: var(--tx1); }
.mcp-result-actions { display: flex; gap: 6px; align-items: center; margin-top: 2px; }
.mcp-boundary { border-color: var(--warn); }
.mcp-copy-notice { margin: 0 0 8px; padding: 7px 10px; border-left: 2px solid var(--ac); border-radius: 0 var(--r-s) var(--r-s) 0; background: var(--ac-soft); color: var(--ac-hi); font-size: var(--fs-xs); line-height: 1.5; }
.mcp-key-roster { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.mcp-key-card { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); }
.mcp-key-card.off, .mcp-key-card.expired { border-style: dashed; opacity: .72; }
.mcp-key-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); }
.mcp-key-identity { display: grid; grid-template-columns: 7px minmax(0, 1fr); align-items: start; gap: 2px 9px; min-width: 0; }
.mcp-key-dot { grid-row: 1 / span 2; width: 7px; height: 7px; margin-top: 7px; border-radius: 50%; background: var(--ac-hi); box-shadow: 0 0 0 3px var(--ac-soft); flex: 0 0 auto; }
.mcp-key-card.off .mcp-key-dot { background: var(--tx3); box-shadow: none; }
.mcp-key-card.expired .mcp-key-dot { background: var(--warn); box-shadow: none; }
.mcp-key-titlerow { grid-column: 2; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.mcp-key-titlerow strong { color: var(--tx0); font-size: var(--fs-sm); font-weight: 600; overflow-wrap: anywhere; }
.mcp-key-state { padding: 0 6px; border: 1px solid var(--ac-line); border-radius: 99px; color: var(--ac-hi); font-size: var(--fs-2xs); line-height: 18px; white-space: nowrap; }
.mcp-key-card.off .mcp-key-state { border-color: var(--line); color: var(--tx3); }
.mcp-key-card.expired .mcp-key-state { border-color: var(--warn); color: var(--warn); }
.mcp-key-role { padding: 0 6px; border: 1px solid var(--line); border-radius: 99px; color: var(--tx2); font-size: var(--fs-2xs); line-height: 18px; }
.mcp-key-owner { grid-column: 2; margin: 0; color: var(--tx2); font-size: var(--fs-2xs); line-height: 1.5; }
.mcp-key-owner span { margin: 0 5px; color: var(--tx3); }
.mcp-key-card-actions { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 5px; flex: 0 0 auto; }
.mcp-prefix-copy { display: inline-flex; align-items: center; gap: 6px; height: 30px; max-width: 250px; padding: 0 9px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx2); cursor: pointer; }
.mcp-prefix-copy:hover { border-color: var(--ac-line); color: var(--ac-hi); }
.mcp-prefix-copy:focus-visible { outline: 2px solid var(--ac-line); outline-offset: 1px; }
.mcp-prefix-copy code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ac-hi); font-size: var(--fs-2xs); }
.mcp-prefix-copy span { flex: 0 0 auto; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-key-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.mcp-key-metric { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mcp-key-metric > span { display: flex; align-items: baseline; gap: 8px; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-key-metric em { margin-left: 4px; color: var(--tx3); font-style: normal; }
.mcp-key-metric b { margin-left: auto; color: var(--tx2); font-weight: 500; }
.mcp-key-metric b.warn { color: var(--warn); }
.mcp-key-metric .mcp-meter { margin: 0; }
.mcp-key-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 16px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-key-foot em { margin-right: 4px; color: var(--tx3); font-style: normal; }
.mcp-key-conns { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-key-detail { padding-top: 10px; border-top: 1px solid var(--line); }
.mcp-key-detail .mcp-detail-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.mcp-secret-dialog { display: flex; flex-direction: column; gap: 10px; }
.mcp-secret-eyebrow { color: var(--ac-hi); font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .08em; }
.mcp-secret-top h3 { margin: 2px 0 4px; color: var(--tx0); font-size: var(--fs-lg); }
.mcp-secret-top p { margin: 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.6; }
.mcp-secret-warning { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-left: 2px solid var(--warn); background: var(--bg-alt); color: var(--tx1); font-size: var(--fs-xs); line-height: 1.55; }
.mcp-secret-warning strong { color: var(--warn); }
.mcp-secret-value-wrap { display: flex; align-items: stretch; gap: 8px; }
.mcp-secret-value { flex: 1 1 auto; min-width: 0; padding: 10px; border: 1px solid var(--ac-line); border-radius: var(--r-s); background: var(--bg); color: var(--ac-hi); font-family: var(--mono); font-size: var(--fs-xs); line-height: 1.6; overflow-wrap: anywhere; user-select: all; }
.mcp-secret-value:focus-visible { outline: 2px solid var(--ac-line); outline-offset: 1px; }
.mcp-secret-copy { flex: 0 0 auto; align-self: center; }
.mcp-secret-error { margin: 0; color: var(--warn); font-size: var(--fs-2xs); }
.mcp-secret-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.mcp-secret-actions .mcp-muted { flex: 1 1 220px; font-size: var(--fs-2xs); line-height: 1.5; }
.mcp-secret-config { border-top: 1px solid var(--line); padding-top: 8px; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-secret-config summary { cursor: pointer; color: var(--tx1); }
.mcp-secret-footer { display: flex; justify-content: flex-end; padding-top: 4px; }
@media (max-width: 1100px) {
  .mcp-key-detail .mcp-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .mcp-key-card-head { flex-direction: column; }
  .mcp-key-card-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; width: 100%; justify-content: stretch; }
  .mcp-prefix-copy { grid-column: 1 / -1; max-width: 100%; justify-content: space-between; }
  .mcp-key-more { justify-self: end; }
  .mcp-key-metrics { grid-template-columns: minmax(0, 1fr); }
  .mcp-key-detail .mcp-detail-grid { grid-template-columns: minmax(0, 1fr); }
  .mcp-secret-value-wrap { flex-direction: column; }
  .mcp-secret-copy { align-self: flex-start; }
}
.mcp-key-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); }
.mcp-key-head h3 { margin: 0; font-size: var(--fs-sm); color: var(--tx0); }
.mcp-key-copy-hint { max-width: 780px; }
.mcp-key-actions { display: flex; gap: var(--sp-2); flex-shrink: 0; }
.mcp-kpis { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0 0 8px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; color: var(--tx2); font-size: var(--fs-xs); }
.mcp-kpis b { color: var(--tx0); font-weight: 600; }
.mcp-kpis b.warn { color: var(--warn); }
.mcp-billing { margin-top: 6px; padding: 5px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.mcp-billing-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
.mcp-billing-days { display: flex; align-items: flex-end; gap: 4px; height: 46px; margin-top: 3px; }
.mcp-billing-day { display: flex; flex: 1 1 0; min-width: 0; flex-direction: column; align-items: center; justify-content: flex-end; gap: 1px; height: 100%; }
.mcp-billing-day b { color: var(--tx1); font-size: var(--fs-2xs); font-weight: 600; line-height: 1.2; }
.mcp-billing-bar { display: flex; align-items: flex-end; width: 100%; height: 26px; }
.mcp-billing-bar i { display: block; width: 100%; min-height: 2px; border-radius: 2px 2px 0 0; background: var(--ac-hi); opacity: .7; }
.mcp-billing-bar i.zero { background: var(--line); opacity: 1; }
.mcp-billing-day em { color: var(--tx2); font-style: normal; font-size: var(--fs-2xs); line-height: 1.2; }
.mcp-key-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.mcp-key-filters .mcp-filter { flex: 1; min-width: 0; }
.mcp-usage-line { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.mcp-usage-line em { font-style: normal; color: var(--tx2); }
.mcp-usage-line em.warn { color: var(--warn); }
.mcp-meter { height: 3px; margin: 3px 0; border-radius: 99px; background: var(--bg); overflow: hidden; }
.mcp-meter i { display: block; height: 100%; border-radius: 99px; background: var(--ac-hi); }
.mcp-meter.warn i { background: var(--warn); }
.mcp-error { border: 1px solid var(--danger, #d03050); border-radius: var(--r-s); padding: var(--sp-2); color: var(--danger, #d03050); font-size: var(--fs-xs); line-height: 1.5; white-space: pre-wrap; }
.mcp-create { border: 1px solid var(--line); border-radius: var(--r-m); padding: 12px; background: var(--bg-alt); }
.mcp-create h3 { margin: 0 0 var(--sp-2); font-size: var(--fs-sm); color: var(--tx0); }
.mcp-presets { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.mcp-presets .btn { height: 26px; }
.mcp-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
.mcp-field { display: flex; flex-direction: column; gap: 4px; color: var(--tx2); font-size: var(--fs-xs); }
.mcp-field input, .mcp-field select { height: 30px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); padding: 0 8px; }
.mcp-scope-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-3); margin-top: var(--sp-2); align-items: start; }
.mcp-scope { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; }
.mcp-scope .mcp-check { width: 100%; min-width: 0; }
.mcp-scope .mcp-check code { margin-left: auto; max-width: 58%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; font-size: var(--fs-xs); opacity: .9; }
.mcp-tool-picks { display: flex; flex-direction: column; gap: 6px; margin-top: var(--sp-2); }
.mcp-tool-picks-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.mcp-tool-picks-head .mcp-filter { flex: 0 1 200px; }
.mcp-tool-packs { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.mcp-tool-pack { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); font-size: var(--fs-xs); cursor: pointer; }
.mcp-tool-pack em { font-style: normal; color: var(--tx3); margin-left: 2px; }
.mcp-tool-pack:hover { border-color: var(--ac); color: var(--ac); }
.mcp-tool-pack.active { border-color: var(--ac); background: color-mix(in srgb, var(--ac) 12%, transparent); color: var(--ac); }
.mcp-tool-budget { margin: 0; padding: 6px 8px; border: 1px solid var(--warn); border-radius: var(--r-s); color: var(--warn); font-size: var(--fs-2xs); background: color-mix(in srgb, var(--warn) 8%, transparent); }
.mcp-tool-view-toggle { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.mcp-tool-action { display: inline-flex; align-items: baseline; gap: 6px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); padding: 3px 8px; cursor: pointer; }
.mcp-tool-action:hover { border-color: var(--ac); }
.mcp-tool-action code { color: var(--ac-hi); }
.mcp-action-catalog { max-height: 440px; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-s); }
.mcp-action-group-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 8px; border: 0; border-bottom: 1px solid var(--line); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-2xs); text-align: left; cursor: pointer; }
.mcp-action-group-head:hover { color: var(--tx1); }
.mcp-action-group-head em { margin-left: auto; font-style: normal; }
.mcp-action-chevron { display: inline-block; width: 10px; color: var(--tx3); transition: transform .15s ease; }
.mcp-action-group.open .mcp-action-chevron { transform: rotate(90deg); color: var(--ac-hi); }
.mcp-action-group .mcp-action-desc { padding: 6px 8px 2px; }
.mcp-action-group .mcp-tool-pick-items { padding-top: 4px; }
.mcp-key-group-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-bottom: 1px solid var(--line); background: var(--bg-alt); }
.mcp-key-group-toggle { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--tx2); font-size: var(--fs-2xs); text-align: left; cursor: pointer; }
.mcp-key-group-toggle em { margin-left: auto; color: var(--tx3); font-style: normal; }
.mcp-key-group-toggle:hover { color: var(--tx1); }
.mcp-key-group-all { margin-left: 0; }
.mcp-key-group.open .mcp-action-chevron { transform: rotate(90deg); color: var(--ac-hi); }
.mcp-tool-pick-groups, .mcp-action-groups { max-height: 260px; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-s); }
.mcp-action-desc { margin: 0; padding: 2px 8px 4px; }
.mcp-legacy-toggle { margin-top: 4px; color: var(--tx2); }
.mcp-tool-pick-group header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: var(--bg-alt); border-bottom: 1px solid var(--line); color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-tool-pick-group header em { font-style: normal; }
.mcp-link-btn { margin-left: auto; border: 0; background: transparent; color: var(--ac-hi); cursor: pointer; font-size: var(--fs-2xs); padding: 0 2px; }
.mcp-tool-pick-items { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
.mcp-tool-pick-group:last-child .mcp-tool-pick-items { border-bottom: 0; }
.mcp-field-label { color: var(--tx2); font-size: var(--fs-xs); }
.mcp-check { display: inline-flex; align-items: center; gap: 4px; color: var(--tx1); font-size: var(--fs-xs); }
.mcp-check code { color: var(--ac-hi); }
.mcp-write-toggle { margin-top: var(--sp-2); padding-top: var(--sp-2); border-top: 1px solid var(--line); }
.mcp-form-actions { margin-top: var(--sp-2); }
.mcp-secret { border: 1px solid var(--warn); border-radius: var(--r-m); padding: var(--sp-3); background: var(--bg-alt); }
.mcp-secret-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); color: var(--tx0); font-size: var(--fs-sm); }
.mcp-empty { border: 1px dashed var(--line); border-radius: var(--r-m); padding: var(--sp-3); color: var(--tx2); font-size: var(--fs-xs); text-align: center; }
.mcp-table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: var(--r-m); }
.mcp-table { table-layout: fixed; }
.mcp-table th:nth-child(1) { width: 170px; }
.mcp-table th:nth-child(2) { width: 230px; }
.mcp-table th:nth-child(3) { width: 64px; }
.mcp-table th:nth-child(4) { width: 120px; }
.mcp-table th:nth-child(5) { width: 96px; }
.mcp-table th:nth-child(6) { width: 68px; }
.mcp-table th:nth-child(7) { width: 150px; }
.mcp-table td { white-space: nowrap; }
.mcp-table td:nth-child(1) code { display: block; overflow: hidden; text-overflow: ellipsis; }
.mcp-key-name { display: flex; align-items: center; gap: 6px; }
.mcp-key-toggle { border: 0; background: transparent; color: var(--ac-hi); cursor: pointer; font-size: var(--fs-2xs); padding: 0; }
.mcp-detail-row td { background: var(--bg-alt); white-space: normal; }
.mcp-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; }
.mcp-detail-block { min-width: 0; }
.mcp-detail-block + .mcp-detail-block { border-left: 1px solid var(--line); padding-left: 12px; }
.mcp-chip-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; max-height: 96px; overflow: auto; }
.mcp-chip { border: 1px solid var(--line); border-radius: 99px; padding: 0 6px; color: var(--tx2); font-size: var(--fs-2xs); line-height: 1.6; }
.mcp-key-tool-meta { margin-left: 5px; color: var(--tx3); font-style: normal; font-weight: 400; }
.mcp-key-tool-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px; max-height: none; overflow: visible; }
.mcp-key-tool-groups .mcp-chip { display: flex; align-items: center; justify-content: space-between; padding: 1px 7px; border-radius: var(--r-s); }
.mcp-key-inspector .mcp-detail-block > .mcp-chip-list { max-height: none; overflow: visible; }
.mcp-key-tool-groups .mcp-chip b { margin-left: 2px; color: var(--tx1); font-weight: 650; }
.mcp-key-tool-groups .mcp-chip i { margin-left: 4px; color: var(--warn); font-style: normal; }
.mcp-key-tool-all { margin-top: 6px; }
.mcp-key-tool-all > summary { cursor: pointer; color: var(--tx2); font-size: var(--fs-2xs); line-height: 1.6; }
.mcp-key-tool-all > summary:hover { color: var(--tx0); }
.mcp-key-tool-all-list { max-height: 150px; padding-top: 2px; }
@media (max-width: 600px) {
  .mcp-key-tool-groups { display: flex; flex-wrap: wrap; }
  .mcp-key-tool-groups .mcp-chip { border-radius: 99px; }
  .mcp-key-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mcp-key-inspector-tab { padding: 0 4px; }
}
.mcp-spark { display: flex; align-items: flex-end; gap: 3px; height: 46px; margin-top: 6px; }
.mcp-spark > span { display: flex; flex: 1 1 0; min-width: 0; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 2px; }
.mcp-spark i { display: block; width: 100%; min-height: 2px; border-radius: 1px 1px 0 0; background: var(--ac-hi); opacity: .75; }
.mcp-spark i.zero { background: var(--line); opacity: 1; }
.mcp-spark em { font-style: normal; color: var(--tx2); font-size: var(--fs-2xs); line-height: 1; white-space: nowrap; }
.mcp-chip.danger { color: var(--danger, #d03050); border-color: var(--danger, #d03050); }
.mcp-detail-line { margin: 4px 0 0; color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-clone-btn { margin-top: 6px; }
.mcp-table td:nth-child(2) .mcp-muted { display: block; white-space: normal; line-height: 1.5; }
.mcp-table .mcp-state { white-space: nowrap; }
.mcp-table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.mcp-table th { text-align: left; font-weight: 600; color: var(--tx2); background: var(--bg-alt); padding: var(--sp-2); white-space: nowrap; }
.mcp-table td { padding: var(--sp-2); border-top: 1px solid var(--line); color: var(--tx1); vertical-align: top; }
.mcp-table code { color: var(--ac-hi); font-size: var(--fs-2xs); }
.mcp-muted { color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-state { display: inline-block; padding: 1px 7px; border-radius: 99px; font-size: var(--fs-2xs); font-weight: 600; }
.mcp-state.on { background: var(--ac-soft); color: var(--ac-hi); }
.mcp-state.off { background: var(--bg-alt); color: var(--tx2); }
.mcp-state.expired { background: var(--warn-soft, #fff7e6); color: var(--warn); }
.mcp-row-action { text-align: right; white-space: nowrap; }
@media (max-width: 720px) {
  .mcp-grid, .mcp-form-grid, .mcp-protocol-grid, .mcp-scope-grid { grid-template-columns: 1fr; }
  .mcp-key-head { flex-direction: column; }
  .mcp-table th:first-child, .mcp-table tbody tr:not(.mcp-detail-row) td:first-child {
    position: sticky; left: 0; z-index: 2; background: var(--bg);
    box-shadow: 1px 0 0 var(--line);
  }
  .mcp-table th:first-child { background: var(--bg-alt); }
  .mcp-detail-grid { grid-template-columns: 1fr; }
  .mcp-detail-block + .mcp-detail-block { border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 6px; }
  .mcp-tool-filters .mcp-filter { flex: 0 0 100%; width: 100%; }
  .mcp-tool-filters .mcp-filter-select { flex: 1 1 auto; width: auto; }
  .mcp-tool-filters .mcp-kind-filter { flex: 0 0 124px; width: 124px; }
  .mcp-key-filters .mcp-filter { flex: 0 0 100%; width: 100%; }
  .mcp-key-filters .mcp-filter-select { flex: 1 1 auto; width: auto; }
}

/* ===== MCP 控制台深塑：左侧流程轨 + 右侧工作台 + 顶部链路条 ===== */
.mcp-panel.mcp-console { max-height: none; overflow: hidden; padding: 0; gap: 0; background: var(--bg); }
.mcp-console { --mcp-nav: #7fb0ff; height: min(86vh, 860px); display: flex; flex-direction: column; }
.mcp-inline { height: calc(100vh - var(--vh-offset) + 90px); min-height: 620px; max-height: calc(100vh - var(--vh-offset) + 110px); border: 1px solid var(--line); border-radius: var(--r-m); }
.mcp-console-modal :deep(.n-card) { padding: 0; overflow: hidden; border-radius: var(--r-l); background: var(--bg); }
.mcp-console-modal :deep(.n-card-header) { display: none; }
.mcp-console-modal :deep(.n-card__content) { padding: 0; }
.mcp-console-modal :deep(.n-base-close) { display: none; }
.mcp-console-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 22px 14px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, color-mix(in srgb, var(--bg-alt) 82%, transparent), var(--bg)); }
.mcp-console-title { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mcp-console-title h2 { margin: 0; color: var(--tx0); font-size: 1.3rem; font-weight: 680; letter-spacing: -0.02em; }
.mcp-eyebrow { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .16em; line-height: 1.4; }
.mcp-console-status { display: flex; align-items: center; gap: 8px; color: var(--tx2); font-size: var(--fs-xs); }
.mcp-console-status code { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-family: var(--mono); }
.mcp-live-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--ac-hi); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ac-hi) 14%, transparent); animation: mcp-live 2.6s ease-out infinite; }
.mcp-live-dot.browser { background: var(--warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 14%, transparent); }
@keyframes mcp-live { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
.mcp-shell-close { display: inline-grid; place-items: center; width: 26px; height: 26px; margin-left: 4px; border: 1px solid var(--line); border-radius: 50%; background: transparent; color: var(--tx2); font-size: 1.05rem; line-height: 1; cursor: pointer; }
.mcp-shell-close:hover { color: var(--tx0); border-color: var(--tx3); }
.mcp-link-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 10px 18px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg-alt) 45%, transparent); }
.mcp-link-mode { display: flex; align-items: center; gap: 7px; min-width: 220px; color: var(--tx2); font-size: var(--fs-xs); }
.mcp-link-mode code { color: var(--tx1); }
.mcp-link-pills { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; flex: 1; min-width: 0; }
.mcp-link-pill { display: inline-flex; align-items: center; gap: 6px; min-width: 0; height: 26px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); }
.mcp-link-pill em { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); font-style: normal; letter-spacing: .08em; }
.mcp-link-pill code { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-link-pill span { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-link-copy { height: 26px; padding: 0 9px; border: 1px solid color-mix(in srgb, var(--mcp-nav) 38%, var(--line)); border-radius: var(--r-s); background: color-mix(in srgb, var(--mcp-nav) 10%, transparent); color: var(--mcp-nav); font-size: var(--fs-2xs); cursor: pointer; }
.mcp-link-copy:hover { border-color: var(--mcp-nav); }
.mcp-strip-check { flex: 0 0 auto; }
.mcp-check-strip { margin: 0; padding: 7px 18px; border-bottom: 1px solid var(--line); border-radius: 0; font-size: var(--fs-xs); }
.mcp-console-body { display: flex; flex: 1; min-height: 0; }
.mcp-rail { display: flex; flex-direction: column; gap: 3px; width: 190px; flex: 0 0 190px; padding: 12px 10px; border-right: 1px solid var(--line); background: color-mix(in srgb, var(--bg-alt) 32%, transparent); overflow: auto; }
.mcp-rail-item { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 7px; min-height: 44px; padding: 7px 8px; border: 1px solid transparent; border-left: 2px solid transparent; border-radius: var(--r-s); background: transparent; color: var(--tx2); text-align: left; cursor: pointer; }
.mcp-rail-item:hover { background: color-mix(in srgb, var(--bg-alt) 75%, transparent); color: var(--tx0); }
.mcp-rail-item.active { border-color: color-mix(in srgb, var(--mcp-nav) 24%, var(--line)); border-left-color: var(--mcp-nav); background: color-mix(in srgb, var(--mcp-nav) 11%, transparent); color: var(--tx0); }
.mcp-rail-index { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .06em; }
.mcp-rail-item.active .mcp-rail-index { color: var(--mcp-nav); }
.mcp-rail-label { font-size: var(--fs-sm); font-weight: 560; }
.mcp-rail-item em { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); font-style: normal; white-space: nowrap; }
.mcp-rail-foot { display: flex; flex-direction: column; gap: 4px; margin-top: auto; padding: 12px 8px 4px; border-top: 1px solid var(--line); color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-stage { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.mcp-protocol-head { flex-wrap: wrap; }
.mcp-protocol-head .mcp-muted { min-width: 0; overflow-wrap: anywhere; }
.mcp-protocol-head .mcp-muted code { word-break: break-all; }
.mcp-stage-head { padding: 16px 22px 13px; border-bottom: 1px solid var(--line); background: var(--bg-alt); }
.mcp-stage-head h3 { margin: 3px 0 4px; color: var(--tx0); font-size: var(--fs-xl); font-weight: 650; letter-spacing: -0.01em; }
.mcp-stage-head p { max-width: 780px; margin: 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.6; }
.mcp-stage-scroll { flex: 1; min-height: 0; padding: 16px 18px 22px; overflow: auto; }
.mcp-stage .mcp-card { padding: 14px; border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); }
.mcp-stage .mcp-card h3 { margin: 0 0 8px; font-size: var(--fs-md); }
.mcp-mode-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
.mcp-mode-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 15px; border: 1px solid var(--line); border-top: 2px solid var(--line); border-radius: var(--r-m); background: color-mix(in srgb, var(--bg-alt) 48%, transparent); }
.mcp-mode-card.active { border-top-color: var(--mcp-nav); background: linear-gradient(180deg, color-mix(in srgb, var(--mcp-nav) 9%, transparent), color-mix(in srgb, var(--bg-alt) 48%, transparent)); }
.mcp-mode-card header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mcp-mode-card h3 { margin: 0; color: var(--tx0); font-size: var(--fs-md); }
.mcp-mode-card p { margin: 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.6; }
.mcp-mode-card .mcp-code { margin: 0; font-size: var(--fs-2xs); }
.mcp-mode-tag { padding: 1px 6px; border: 1px solid color-mix(in srgb, var(--mcp-nav) 40%, var(--line)); border-radius: var(--r-xs); color: var(--mcp-nav); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-mode-foot { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 6px 8px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--line); }
.mcp-mode-foot code { flex: 1 1 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx2); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-mode-foot .mcp-link-btn { margin-left: 0; flex: 0 0 auto; }
.mcp-signal-flow { display: grid; grid-template-columns: minmax(0,1fr) 110px minmax(0,1.15fr) 92px minmax(0,1fr); align-items: center; gap: 8px; margin-top: 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--r-m); background: color-mix(in srgb, var(--bg-alt) 40%, transparent); }
.mcp-signal-node { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mcp-signal-node strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx0); font-family: var(--mono); font-size: var(--fs-sm); font-weight: 600; }
.mcp-signal-node small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-signal-node.live { padding-left: 10px; border-left: 2px solid var(--mcp-nav); }
.mcp-signal-node.live strong { color: var(--mcp-nav); }
.mcp-signal-link { display: flex; flex-direction: column; gap: 3px; min-width: 0; color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); text-align: center; }
.mcp-signal-link i { position: relative; height: 1px; background: var(--line); }
.mcp-signal-link i::after { content: ''; position: absolute; top: -3px; right: 0; width: 6px; height: 6px; border-top: 1px solid var(--tx3); border-right: 1px solid var(--tx3); transform: rotate(45deg); }
.mcp-access-foot { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px 16px; margin-top: 14px; padding: 13px 15px; border: 1px dashed var(--line); border-radius: var(--r-m); }
.mcp-access-foot > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mcp-access-foot code, .mcp-access-foot span:not(.mcp-eyebrow) { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-tools-layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr); gap: 12px; align-items: start; }
.mcp-tools-layout > .mcp-card { min-width: 0; }
.mcp-tools-layout + .mcp-protocol { margin-top: 12px; }
.mcp-audit-kpis { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-bottom: 12px; }
.mcp-audit-kpis > div { display: flex; flex-direction: column; gap: 3px; padding: 13px 14px; border: 1px solid var(--line); border-radius: var(--r-m); background: color-mix(in srgb, var(--bg-alt) 48%, transparent); }
.mcp-audit-kpis b { color: var(--tx0); font-family: var(--mono); font-size: 1.5rem; font-weight: 650; line-height: 1.1; }
.mcp-audit-kpis b.warn { color: var(--warn); }
.mcp-audit-kpis em { color: var(--tx3); font-size: var(--fs-2xs); font-style: normal; }
.mcp-audit-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.mcp-audit-toolbar .mcp-filter { flex: 1 1 240px; }
.mcp-audit-toolbar .mcp-audit-cred { flex: 0 1 260px; }
.mcp-audit-filter { display: inline-flex; align-items: center; gap: 4px; min-height: 26px; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-audit-filter code { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-family: var(--mono); }
.mcp-audit-table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg); }
.mcp-audit-scroll-hint { display: none; margin: 0 0 4px; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-audit-table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: var(--fs-xs); }
.mcp-audit-table th { position: sticky; top: 0; z-index: 1; padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--bg-alt); color: var(--tx3); font-size: var(--fs-2xs); font-weight: 500; text-align: left; white-space: nowrap; }
.mcp-audit-table td { padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent); color: var(--tx1); vertical-align: top; }
.mcp-audit-table tr:last-child td { border-bottom: 0; }
.mcp-audit-table code { color: var(--ac-hi); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-audit-key { display: block; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-weight: 560; }
.mcp-audit-tool { display: block; margin-top: 2px; color: var(--tx2); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-audit-ua { display: block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx2); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-audit-rid { display: inline-block; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
@media (max-width: 1100px) {
  .mcp-tools-layout { grid-template-columns: 1fr; }
  .mcp-mode-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .mcp-inline { height: auto; min-height: 0; border: 0; }
  .mcp-console { height: min(90vh, 820px); }
  .mcp-console-head { padding: 13px 14px 11px; }
  .mcp-console-status code { display: none; }
  .mcp-link-strip { padding: 8px 12px; }
  .mcp-link-mode { min-width: 0; }
  .mcp-link-pill code { max-width: 150px; }
  .mcp-console-body { flex-direction: column; }
  .mcp-rail { width: auto; flex: 0 0 auto; flex-direction: row; gap: 2px; padding: 7px 6px; border-right: 0; border-bottom: 1px solid var(--line); overflow-x: hidden; }
  .mcp-rail-item { grid-template-columns: minmax(0, 1fr); flex: 1 1 0; min-width: 0; min-height: 38px; padding: 6px 4px; border-left: 0; border-bottom: 2px solid transparent; justify-items: center; }
  .mcp-rail-item.active { border-left-color: transparent; border-bottom-color: var(--mcp-nav); }
  .mcp-rail-index, .mcp-rail-item em { display: none; }
  .mcp-rail-label { max-width: 100%; overflow: hidden; font-size: var(--fs-2xs); text-overflow: ellipsis; white-space: nowrap; }
  .mcp-rail-foot { display: none; }
  .mcp-protocol-head { flex-wrap: wrap; }
.mcp-protocol-head .mcp-muted { min-width: 0; overflow-wrap: anywhere; }
.mcp-protocol-head .mcp-muted code { word-break: break-all; }
.mcp-stage-head { padding: 12px 14px 10px; }
  .mcp-stage-scroll { padding: 12px; }
  .mcp-audit-kpis { grid-template-columns: 1fr 1fr; }
  .mcp-access-foot { grid-template-columns: 1fr; }
  .mcp-signal-flow { grid-template-columns: 1fr; gap: 8px; padding: 12px; }
  .mcp-signal-link { flex-direction: row; align-items: center; justify-content: center; gap: 6px; }
  .mcp-signal-link i { flex: 1; }
  .mcp-audit-toolbar { align-items: stretch; flex-direction: column; }
  .mcp-audit-toolbar .mcp-filter, .mcp-audit-toolbar .mcp-filter-select { width: 100%; flex: 0 0 auto; }
}
@media (prefers-reduced-motion: reduce) {
  .mcp-live-dot { animation: none; }
}

/* ═══ MCP 2.0 · 控制台重塑：信号条 + 横向作业台 + 权限账本 ═══ */
.mcp-console { --mcp-nav: #4cc9f0; --mcp-write: #f0b23c; }
.mcp-console-head { align-items: flex-start; padding: 18px 22px 14px; background:
  radial-gradient(1200px 120px at 12% -40%, color-mix(in srgb, var(--mcp-nav) 12%, transparent), transparent 70%),
  linear-gradient(180deg, color-mix(in srgb, var(--bg-alt) 82%, transparent), var(--bg)); }
.mcp-console-title { gap: 5px; }
.mcp-console-title h2 { font-size: 1.45rem; letter-spacing: -0.03em; }
.mcp-head-sub { max-width: 620px; margin: 1px 0 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.55; }
.mcp-mode-pill { display: inline-flex; align-items: center; gap: 7px; height: 27px; padding: 0 9px; border: 1px solid var(--line); border-radius: 99px; background: var(--bg); color: var(--tx1); font-size: var(--fs-2xs); white-space: nowrap; }
.mcp-endpoint-chip { display: inline-flex; align-items: center; gap: 7px; min-width: 0; height: 27px; max-width: 340px; padding: 0 9px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx1); cursor: pointer; }
.mcp-endpoint-chip:hover { border-color: color-mix(in srgb, var(--mcp-nav) 46%, var(--line)); }
.mcp-endpoint-chip em { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); font-style: normal; letter-spacing: .08em; }
.mcp-endpoint-chip code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-signal-bar { display: grid; grid-template-columns: minmax(0,1fr) 16px minmax(0,1fr) 16px minmax(0,1fr) 16px minmax(0,1fr) minmax(150px,.8fr); align-items: center; gap: 4px; padding: 10px 22px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg-alt) 36%, transparent); }
.mcp-signal-node { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mcp-signal-node strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx0); font-family: var(--mono); font-size: var(--fs-sm); font-weight: 600; }
.mcp-signal-node small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-signal-node.live { padding-left: 9px; border-left: 2px solid var(--mcp-nav); }
.mcp-signal-node.live strong { color: var(--mcp-nav); }
.mcp-signal-arrow { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-xs); text-align: center; opacity: .55; }
.mcp-signal-audit { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; border-left: 1px solid var(--line); padding-left: 12px; }
.mcp-signal-audit b { color: var(--tx0); font-family: var(--mono); font-size: 1.15rem; line-height: 1.1; }
.mcp-signal-audit small { color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-console-body-stacked { flex-direction: column; }
.mcp-tabs { flex: 0 0 auto; width: 100%; flex-direction: row; align-items: stretch; gap: 2px; padding: 0 14px; border-right: 0; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg-alt) 26%, transparent); overflow-x: auto; }
.mcp-tabs .mcp-rail-item { display: flex; align-items: center; gap: 8px; min-height: 42px; flex: 0 0 auto; padding: 0 12px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; }
.mcp-tabs .mcp-rail-item:hover { background: color-mix(in srgb, var(--bg-alt) 70%, transparent); }
.mcp-tabs .mcp-rail-item.active { border-color: transparent; border-bottom-color: var(--mcp-nav); background: color-mix(in srgb, var(--mcp-nav) 8%, transparent); }
.mcp-tabs .mcp-rail-index { color: var(--tx3); }
.mcp-tabs .mcp-rail-label { font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.mcp-tabs .mcp-rail-item em { font-size: var(--fs-2xs); color: var(--tx3); }
.mcp-tabs-meta { display: flex; align-items: center; gap: 10px; margin-left: auto; padding: 0 4px 0 14px; color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); white-space: nowrap; }
.mcp-tabs-meta span { padding-left: 10px; border-left: 1px solid var(--line); }
.mcp-access-top { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, .75fr); gap: 12px; align-items: start; }
.mcp-card-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.mcp-card-head-row h3 { margin: 0; }
.mcp-contract-badge { align-self: center; padding: 2px 8px; border: 1px solid color-mix(in srgb, var(--mcp-nav) 34%, var(--line)); border-radius: 99px; color: var(--mcp-nav); font-family: var(--mono); font-size: var(--fs-2xs); white-space: nowrap; }
.mcp-mode-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-s); }
.mcp-mode-table { width: 100%; min-width: 620px; table-layout: fixed; border-collapse: collapse; font-size: var(--fs-xs); }
.mcp-mode-table th { padding: 7px 10px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg-alt) 72%, transparent); color: var(--tx3); font-size: var(--fs-2xs); font-weight: 500; text-align: left; white-space: nowrap; }
.mcp-mode-table td { padding: 11px 10px; border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); color: var(--tx1); vertical-align: top; }
.mcp-mode-table tr:last-child td { border-bottom: 0; }
.mcp-mode-table tr.active td { background: color-mix(in srgb, var(--mcp-nav) 6%, transparent); }
.mcp-mode-table td b { display: inline-flex; align-items: center; gap: 6px; color: var(--tx0); font-size: var(--fs-xs); font-weight: 600; }
.mcp-mode-table td small { display: block; margin-top: 2px; color: var(--tx3); font-size: var(--fs-2xs); line-height: 1.45; }
.mcp-mode-table td code { overflow-wrap: anywhere; color: var(--ac-hi); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-ready-card { min-width: 0; }
.mcp-ready-count { color: var(--mcp-nav); font-family: var(--mono); font-size: var(--fs-sm); }
.mcp-ready-list { display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; list-style: none; }
.mcp-ready-list li { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px dashed var(--line); }
.mcp-ready-list li:last-child { border-bottom: 0; }
.mcp-ready-list li > span { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-ready-list li.done > span { color: var(--ok); }
.mcp-ready-list b { display: block; color: var(--tx1); font-size: var(--fs-xs); font-weight: 600; }
.mcp-ready-list small { display: block; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-ready-actions { display: flex; gap: 8px; margin-top: 10px; }
.mcp-access-commands { margin-top: 12px; }
.mcp-cmd-row { display: grid; grid-template-columns: 54px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 7px 0; border-top: 1px dashed var(--line); }
.mcp-cmd-row:first-of-type { border-top: 0; }
.mcp-cmd-label { color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); letter-spacing: .06em; }
.mcp-cmd-row code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-client-toolbar { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
.mcp-client-toolbar .mcp-filter { flex: 1; min-width: 0; }
.mcp-client-matrix { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px; margin-bottom: 10px; }
.mcp-client-tile { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 7px; height: auto; min-height: 44px; padding: 6px 8px; text-align: left; white-space: normal; }
.mcp-client-tile-mark { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--bg-alt); color: var(--ac-hi); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-client-tile-copy { min-width: 0; }
.mcp-client-tile-copy b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-size: var(--fs-2xs); font-weight: 600; }
.mcp-client-tile-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-client-tile em { color: var(--mcp-nav); font-size: var(--fs-2xs); font-style: normal; }
.mcp-client-tile.active { border-color: color-mix(in srgb, var(--mcp-nav) 46%, var(--line)); background: color-mix(in srgb, var(--mcp-nav) 10%, transparent); }
.mcp-dbx-note { margin-top: 10px; padding: 10px 12px; border: 1px dashed color-mix(in srgb, var(--mcp-write) 30%, var(--line)); border-radius: var(--r-s); background: color-mix(in srgb, var(--mcp-write) 5%, transparent); }
.mcp-dbx-note p { margin: 4px 0 0; color: var(--tx2); font-size: var(--fs-2xs); line-height: 1.6; }
.mcp-dbx-note b { color: var(--tx0); }
.mcp-issue-ledger { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1px; margin: 10px 0 12px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--line); overflow: hidden; }
.mcp-issue-ledger > div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; background: var(--bg); }
.mcp-issue-ledger span { color: var(--tx3); font-size: var(--fs-2xs); letter-spacing: .08em; text-transform: uppercase; }
.mcp-issue-ledger b { color: var(--tx0); font-size: var(--fs-xs); font-weight: 600; }
.mcp-issue-ledger em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx3); font-size: var(--fs-2xs); font-style: normal; }
.mcp-issue-ledger > div.warn b { color: var(--mcp-write); }
.mcp-key-scope-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.mcp-scope-chip { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 6px; border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--bg); color: var(--tx2); font-size: var(--fs-2xs); white-space: nowrap; }
.mcp-scope-chip em { color: var(--mcp-nav); font-family: var(--mono); font-size: var(--fs-2xs); font-style: normal; }
.mcp-scope-chip.write { border-color: color-mix(in srgb, var(--mcp-write) 40%, var(--line)); }
.mcp-scope-chip.write em { color: var(--mcp-write); }
.mcp-scope-chip.muted { color: var(--tx3); }
.mcp-audit-row { cursor: pointer; }
.mcp-audit-row:hover td { background: color-mix(in srgb, var(--bg-alt) 55%, transparent); }
.mcp-audit-row.open td { background: color-mix(in srgb, var(--mcp-nav) 5%, transparent); }
.mcp-transport { padding: 1px 6px; border: 1px solid var(--line); border-radius: 99px; color: var(--tx2); font-family: var(--mono); font-size: var(--fs-2xs); text-transform: uppercase; }
.mcp-transport.t-browser { color: var(--warn); border-color: var(--warn-line); }
.mcp-transport.t-stdio { color: var(--violet); border-color: var(--violet-line); }
.mcp-transport.t-sse { color: var(--info); border-color: var(--info-line); }
.mcp-audit-detail-row td { padding: 0 10px 10px; background: color-mix(in srgb, var(--bg-alt) 40%, transparent); }
.mcp-audit-detail { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px 14px; padding: 10px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); }
.mcp-audit-detail > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mcp-audit-detail span { color: var(--tx3); font-size: var(--fs-2xs); letter-spacing: .06em; text-transform: uppercase; }
.mcp-audit-detail code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-audit-detail-actions { grid-column: 1 / -1; }
@media (max-width: 1100px) {
  .mcp-access-top { grid-template-columns: 1fr; }
  .mcp-signal-bar { grid-template-columns: repeat(4, minmax(0,1fr)); }
  .mcp-signal-arrow, .mcp-signal-audit { display: none; }
  .mcp-client-matrix { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .mcp-issue-ledger { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .mcp-tabs-meta { display: none; }
}
@media (max-width: 760px) {
  .mcp-console-head { flex-direction: column; gap: 10px; }
  .mcp-console-status { flex-wrap: wrap; }
  .mcp-endpoint-chip { max-width: 100%; }
  .mcp-signal-bar { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; padding: 10px 14px; }
  .mcp-signal-node.live { padding-left: 0; border-left: 0; }
  .mcp-tabs { overflow-x: auto; padding: 0 6px; }
  .mcp-tabs .mcp-rail-item { padding: 0 9px; }
  .mcp-client-matrix { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .mcp-issue-ledger { grid-template-columns: 1fr 1fr; }
  .mcp-audit-detail { grid-template-columns: 1fr; }
  .mcp-cmd-row { grid-template-columns: 44px minmax(0,1fr) auto; }
}

.mcp-perm-matrix { display: block; padding: 10px 11px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); }
.mcp-perm-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 7px; }
.mcp-perm-head, .mcp-perm-row { display: grid; grid-template-columns: minmax(0,1fr) 54px 84px; align-items: center; gap: 8px; }
.mcp-perm-head { padding: 3px 8px; color: var(--tx3); font-size: var(--fs-2xs); letter-spacing: .08em; }
.mcp-perm-head span:nth-child(2), .mcp-perm-head span:nth-child(3) { text-align: center; }
.mcp-perm-row { min-height: 32px; padding: 3px 8px; border-top: 1px dashed var(--line); cursor: pointer; }
.mcp-perm-row:hover { background: color-mix(in srgb, var(--bg-alt) 55%, transparent); }
.mcp-perm-row.on { background: color-mix(in srgb, var(--ac) 4%, transparent); }
.mcp-perm-row.readonly { opacity: .72; }
.mcp-perm-row.blocked { background: color-mix(in srgb, var(--warn) 3%, transparent); }
.mcp-perm-na { color: var(--tx3); font-size: var(--fs-2xs); font-style: normal; white-space: nowrap; }
.mcp-perm-row.blocked .mcp-perm-na { color: var(--warn); }
.mcp-perm-conn { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--tx1); font-size: var(--fs-2xs); }
.mcp-perm-conn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-perm-conn code { flex: 0 0 auto; color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-perm-cell { display: flex; align-items: center; justify-content: center; gap: 4px; }
.mcp-perm-cell em { color: var(--tx3); font-size: var(--fs-2xs); font-style: normal; }
.mcp-perm-cell em.on { color: var(--ac-hi); font-family: var(--mono); font-weight: 600; }

@media (max-width: 760px) {
  .mcp-console-title h2 { font-size: 1.2rem; }
  .mcp-head-sub { font-size: var(--fs-2xs); }
  .mcp-endpoint-chip { width: 100%; max-width: none; }
  .mcp-endpoint-chip code { flex: 1; }
  .mcp-mode-table { min-width: 0; }
  .mcp-mode-table thead { display: none; }
  .mcp-mode-table tbody, .mcp-mode-table tr, .mcp-mode-table td { display: block; width: 100%; }
  .mcp-mode-table tr { padding: 7px 0; border-bottom: 1px solid var(--line); }
  .mcp-mode-table tr:last-child { border-bottom: 0; }
  .mcp-mode-table td { display: grid; grid-template-columns: 86px minmax(0,1fr); gap: 8px; padding: 4px 10px; border: 0; }
  .mcp-mode-table td::before { content: attr(data-label); color: var(--tx3); font-size: var(--fs-2xs); letter-spacing: .06em; }
  .mcp-mode-table td small { grid-column: 2; }
  .mcp-ready-list li { grid-template-columns: 20px minmax(0,1fr) auto; }
}

@media (max-width: 760px) {
  .mcp-console-status { width: 100%; }
  .mcp-console-status .mcp-endpoint-chip { width: 100%; }
  .mcp-console-status .mcp-endpoint-chip code { display: inline-block; max-width: none; flex: 1; }
  .mcp-tabs .mcp-rail-item { flex: 1 1 0; min-width: 0; padding: 0 3px; justify-content: center; }
  .mcp-tabs .mcp-rail-index, .mcp-tabs .mcp-rail-item em { display: none; }
  .mcp-tabs .mcp-rail-label { font-size: var(--fs-2xs); }
  .mcp-mode-table-wrap { overflow: visible; }
  .mcp-mode-table { width: 100%; }
  .mcp-mode-table td { grid-template-columns: 72px minmax(0,1fr); }
}

@media (max-width: 760px) {
  .mcp-tabs .mcp-rail-label { font-size: var(--fs-2xs); letter-spacing: -0.02em; white-space: normal; line-height: 1.15; text-align: center; }
  .mcp-mode-table td code { overflow-wrap: anywhere; word-break: break-all; }
  .mcp-mode-table td small { overflow-wrap: anywhere; }
}

.mcp-console-body, .mcp-stage { min-height: 0; }
.mcp-stage-scroll { flex: 1 1 0; min-height: 0; overflow: auto; }

@media (max-width: 900px) {
  .mcp-mode-table { min-width: 0; }
  .mcp-mode-table thead { display: none; }
  .mcp-mode-table tbody, .mcp-mode-table tr, .mcp-mode-table td { display: block; width: 100%; }
  .mcp-mode-table tr { padding: 7px 0; border-bottom: 1px solid var(--line); }
  .mcp-mode-table tr:last-child { border-bottom: 0; }
  .mcp-mode-table td { display: grid; grid-template-columns: 86px minmax(0,1fr); gap: 8px; padding: 4px 10px; border: 0; }
  .mcp-mode-table td::before { content: attr(data-label); color: var(--tx3); font-size: var(--fs-2xs); letter-spacing: .06em; }
  .mcp-mode-table td small { grid-column: 2; }
}

.mcp-key-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(560px, .95fr); gap: 12px; align-items: start; }
.mcp-key-ledger { min-width: 0; }
.mcp-key-inspector { position: sticky; top: 0; max-height: calc(100vh - var(--vh-offset) - 110px); overflow: auto; }
.mcp-key-inspector-tabs { display: flex; gap: 2px; margin-bottom: 10px; padding: 2px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg-alt); }
.mcp-key-inspector-tab { flex: 1 1 0; min-width: 0; height: 26px; padding: 0 6px; border: 0; border-radius: calc(var(--r-s) - 2px); background: transparent; color: var(--tx2); font-size: var(--fs-2xs); cursor: pointer; white-space: nowrap; }
.mcp-key-inspector-tab:hover { color: var(--tx0); }
.mcp-key-inspector-tab.active { background: color-mix(in srgb, var(--ac) 14%, transparent); color: var(--ac-hi); font-weight: 600; }
.mcp-key-inspector-tab em { margin-left: 3px; color: var(--tx3); font-style: normal; font-weight: 400; }
.mcp-key-inspector-tab.active em { color: var(--ac-hi); }
.mcp-key-pane { display: flex; flex-direction: column; gap: 12px; }
.mcp-key-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.mcp-key-stat { padding: 7px 9px; border: 1px solid var(--line); border-radius: var(--r-s); }
.mcp-key-stat b { display: block; color: var(--tx0); font-size: var(--fs-md); font-weight: 650; line-height: 1.2; }
.mcp-key-stat span { color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-key-inspector-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding-bottom: 10px; margin-bottom: 8px; border-bottom: 1px solid var(--line); }
.mcp-key-inspector-head h3 { margin: 3px 0 2px; color: var(--tx0); font-size: var(--fs-md); font-weight: 650; }
.mcp-key-inspector-head p { margin: 0; color: var(--tx2); font-size: var(--fs-2xs); overflow-wrap: anywhere; }
.mcp-key-inspector-head code { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-key-inspector-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.mcp-key-inspector-empty h3 { margin: 4px 0 2px; color: var(--tx1); font-size: var(--fs-sm); }
.mcp-key-inspector .mcp-key-detail { padding-top: 0; border-top: 0; }
.mcp-key-inspector .mcp-key-detail .mcp-detail-grid { grid-template-columns: 1fr; }
.mcp-key-card { cursor: pointer; }
.mcp-key-card:hover { border-color: color-mix(in srgb, var(--mcp-nav) 30%, var(--line)); }
@media (max-width: 1100px) {
  .mcp-key-workspace { grid-template-columns: 1fr; }
  .mcp-key-inspector { position: static; max-height: none; }
}

@media (max-width: 760px) {
  .mcp-label-extra { display: none; }
  .mcp-tabs .mcp-rail-label { white-space: nowrap; }
}

.mcp-key-notice { margin-bottom: 10px; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--ac) 35%, var(--line)); border-radius: var(--r-s); background: color-mix(in srgb, var(--ac) 7%, transparent); color: var(--tx1); font-size: var(--fs-2xs); line-height: 1.55; }
.mcp-audit-error { margin: 0 0 8px; }
.mcp-copy-key-btn { border-color: color-mix(in srgb, var(--ac) 34%, var(--line)); color: var(--ac-hi); }
@media (max-width: 760px) {
  .mcp-key-card-actions { width: 100%; justify-content: flex-start; }
  .mcp-key-inspector-actions { width: 100%; }
}

.mcp-client-workbench { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 14px; align-items: start; }
.mcp-client-picker { min-width: 0; position: sticky; top: 0; max-height: calc(100vh - var(--vh-offset) - 170px); overflow: auto; padding-right: 4px; }
.mcp-client-picker .mcp-client-matrix { grid-template-columns: 1fr; gap: 4px; }
.mcp-client-picker .mcp-client-tile { min-height: 40px; }
.mcp-client-detail { min-width: 0; }
.mcp-client-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.mcp-client-detail-head h3 { margin: 2px 0 0; color: var(--tx0); font-size: var(--fs-lg); font-weight: 650; }
.mcp-client-detail .mcp-client-note { margin-top: 2px; }
.mcp-client-code { max-height: min(56vh, 620px); overflow: auto; font-size: var(--fs-xs); line-height: 1.55; }
.mcp-client-detail .mcp-client-head { margin-top: 10px; }
@media (max-width: 1000px) {
  .mcp-client-workbench { grid-template-columns: 1fr; }
  .mcp-client-picker { position: static; max-height: none; }
  .mcp-client-picker .mcp-client-matrix { grid-template-columns: repeat(2, minmax(0,1fr)); }
}

@media (max-width: 1180px) {
  .mcp-access-top { grid-template-columns: 1fr; }
  .mcp-ready-card { max-width: none; }
}

.mcp-client-keyline { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; padding: 7px 8px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg-alt); }
.mcp-client-key-select { min-width: 260px; flex: 1 1 260px; max-width: 460px; }
.mcp-key-ready { color: var(--ok); font-size: var(--fs-2xs); white-space: nowrap; }

/* ═══════════════════════════════════════════════════════════════════════════
   1.0.45 · 可视区重塑：MCP 控制台填满宿主内容区，不再用 86vh/210px 猜高度。
   2026-11-11 现场反馈：嵌入 QuoteHub 后下方操作区只剩 ~390px，表格/表单看不全。
   策略：外壳 height:100% 由 .page 的确定高度驱动；头部只留标题+状态一行，
   信号条压成 34px，阶段头只留标题；所有释放的高度归还 .mcp-stage-scroll。
   ═══════════════════════════════════════════════════════════════════════════ */
.mcp-console.mcp-inline { height: 100%; min-height: 0; max-height: none; border: 0; border-radius: 0; }
.mcp-console.mcp-inline .mcp-console-body { min-height: 0; }
.mcp-console.mcp-inline .mcp-console-head { padding: 8px 16px; align-items: center; }
.mcp-console.mcp-inline .mcp-console-title { flex-direction: row; align-items: baseline; flex-wrap: wrap; gap: 2px 10px; min-width: 0; }
.mcp-console.mcp-inline .mcp-console-title h2 { font-size: 1.35rem; letter-spacing: -.025em; }
.mcp-console.mcp-inline .mcp-head-sub { display: none; }
.mcp-console.mcp-inline .mcp-eyebrow { font-size: var(--fs-2xs); letter-spacing: .12em; line-height: 1.2; }
.mcp-console.mcp-inline .mcp-console-status { gap: 6px; flex-wrap: nowrap; }
.mcp-console.mcp-inline .mcp-mode-pill,
.mcp-console.mcp-inline .mcp-endpoint-chip { height: 24px; }
.mcp-console.mcp-inline .mcp-head-cta { height: 26px; padding: 0 10px; font-size: var(--fs-2xs); }
@media (max-width: 1180px) {
  .mcp-console.mcp-inline .mcp-head-cta { display: none; }
}
.mcp-console.mcp-inline .mcp-signal-bar { padding: 5px 16px; border-bottom: 1px solid var(--line); grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr) minmax(128px, .7fr); gap: 4px 14px; }
.mcp-console.mcp-inline .mcp-signal-node { gap: 0; min-width: 0; }
.mcp-console.mcp-inline .mcp-signal-node strong { font-size: var(--fs-xs); }
.mcp-console.mcp-inline .mcp-signal-node small { display: none; }
.mcp-console.mcp-inline .mcp-signal-arrow { display: none; }
.mcp-console.mcp-inline .mcp-signal-audit { flex-direction: row; align-items: baseline; gap: 6px; }
.mcp-console.mcp-inline .mcp-signal-audit b { font-size: 1rem; }
.mcp-console.mcp-inline .mcp-tabs { padding: 0 10px; }
.mcp-console.mcp-inline .mcp-tabs .mcp-rail-item { min-height: 34px; padding: 0 10px; }
/* 阶段标题与 tab 重复，内联控制台直接收起，把整行高度还给表格/表单。 */
.mcp-console.mcp-inline .mcp-stage-head { display: none; }
.mcp-console.mcp-inline .mcp-stage-scroll { padding: 0; }
/* 扁平工作台：去掉「大圆角卡片里再套卡片」的双层壳，分节只用 1px 分隔线；
   页面宽度和高度都留给内容，不再用内层卡片的白底/描边反复收边。 */
.mcp-console.mcp-inline .mcp-card { border: 0; border-radius: 0; background: transparent; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.mcp-console.mcp-inline .mcp-access-top { gap: 0; align-items: stretch; }
.mcp-console.mcp-inline .mcp-access-top > .mcp-card { border-bottom: 0; }
.mcp-console.mcp-inline .mcp-onboard { border-bottom: 0; padding: 14px 18px; }
.mcp-console.mcp-inline .mcp-client-workbench { gap: 0; }
.mcp-console.mcp-inline .mcp-client-picker { padding-right: 14px; border-right: 1px solid var(--line); }
@media (max-width: 1000px) {
  .mcp-console.mcp-inline .mcp-client-picker { border-right: 0; padding-right: 0; }
}
.mcp-console.mcp-inline .mcp-audit-kpis { gap: 6px; margin-bottom: 8px; }
.mcp-console.mcp-inline .mcp-audit-kpis > div { flex-direction: row; align-items: baseline; gap: 6px; padding: 7px 10px; }
.mcp-console.mcp-inline .mcp-audit-kpis b { font-size: 1.05rem; }
.mcp-console.mcp-inline .mcp-audit-kpis em { font-size: var(--fs-2xs); }
.mcp-console.mcp-inline .mcp-audit-toolbar { margin-bottom: 6px; }
@media (max-height: 820px) {
  .mcp-console.mcp-inline .mcp-stage-head p { display: none; }
  .mcp-console.mcp-inline .mcp-signal-bar { padding: 3px 14px; }
  .mcp-console.mcp-inline .mcp-console-head { padding: 6px 14px; }
  .mcp-console.mcp-inline .mcp-tabs .mcp-rail-item { min-height: 30px; }
  .mcp-console.mcp-inline .mcp-stage-head { padding: 6px 14px 5px; }
}
@media (max-width: 760px) {
  .mcp-console.mcp-inline { height: min(90vh, 820px); min-height: 0; }
  .mcp-console.mcp-inline .mcp-signal-bar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 10px; padding: 5px 12px; }
  .mcp-console.mcp-inline .mcp-signal-node strong { font-size: var(--fs-2xs); }
  .mcp-console.mcp-inline .mcp-signal-audit { align-items: flex-start; border-left: 0; padding-left: 0; }
  .mcp-console.mcp-inline .mcp-tabs { padding: 0 4px; gap: 0; }
  .mcp-console.mcp-inline .mcp-tabs .mcp-rail-item { flex: 1 1 0; min-width: 0; min-height: 32px; padding: 0 3px; justify-content: center; }
  .mcp-console.mcp-inline .mcp-tabs .mcp-rail-index,
  .mcp-console.mcp-inline .mcp-tabs .mcp-rail-item em { display: none; }
  .mcp-console.mcp-inline .mcp-tabs .mcp-rail-label { font-size: var(--fs-2xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}

/* ═══ MCP 2.1 · 权限链路 / 体检台 / 首把密钥 / 审计排障 ═══ */
.mcp-signal-bar { position: relative; overflow: hidden; }
.mcp-signal-node {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  min-width: 0; padding: 0; border: 0; background: transparent; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
}
.mcp-signal-node:hover strong { color: var(--mcp-nav); }
.mcp-signal-node:focus-visible { outline: 1px solid var(--mcp-nav); outline-offset: 3px; border-radius: 2px; }
.mcp-signal-node.live { padding-left: 9px; border-left: 2px solid var(--mcp-nav); }
.mcp-signal-node.live strong { color: var(--mcp-nav); }
.mcp-signal-audit { align-items: flex-end; border-left: 1px solid var(--line); padding-left: 12px; }
.mcp-signal-audit b { color: var(--tx0); font-family: var(--mono); font-size: 1.15rem; font-weight: 650; line-height: 1.1; }
.mcp-signal-bar.busy::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--mcp-nav), transparent);
  animation: mcp-trace-sweep 1.4s ease-in-out infinite;
}
@keyframes mcp-trace-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.mcp-doctor-keyline { display: flex; align-items: center; gap: 8px; padding: 8px 0 2px; }
.mcp-doctor-keyline .mcp-field-label { flex: 0 0 auto; }
.mcp-doctor-key-select { flex: 1 1 auto; min-width: 0; width: auto; }
.mcp-doctor-status {
  display: flex; align-items: flex-start; gap: 8px; margin-top: 8px;
  padding: 9px 10px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg);
}
.mcp-doctor-status b { display: block; color: var(--tx1); font-size: var(--fs-xs); font-weight: 600; }
.mcp-doctor-status small { display: block; margin-top: 2px; color: var(--tx3); font-size: var(--fs-2xs); line-height: 1.45; }
.mcp-doctor-status.ok { border-color: color-mix(in srgb, var(--ok) 38%, var(--line)); }
.mcp-doctor-status.ok b { color: var(--ok); }
.mcp-doctor-status.bad { border-color: color-mix(in srgb, var(--warn) 38%, var(--line)); }
.mcp-doctor-status.bad b { color: var(--warn); }
.mcp-doctor-readout { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin-top: 8px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--line); overflow: hidden; }
.mcp-doctor-readout > div { display: flex; flex-direction: column; gap: 2px; padding: 7px 8px; background: var(--bg); }
.mcp-doctor-readout span { color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-doctor-readout b { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-xs); font-weight: 600; font-variant-numeric: tabular-nums; }
.mcp-doctor-error { margin: 8px 0 0; }
.mcp-play-keyline { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; padding: 6px 0 2px; }
.mcp-play-keyline .mcp-field-label { flex: 0 0 auto; }
.mcp-trial-key-select { width: min(280px, 100%); flex: 0 1 280px; }
.mcp-onboard-steps { display: flex; margin: 0 0 12px; border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; }
.mcp-onboard-step { display: flex; flex: 1 1 0; align-items: center; gap: 8px; min-width: 0; padding: 8px 10px; border-right: 1px solid var(--line); }
.mcp-onboard-step:last-child { border-right: 0; }
.mcp-onboard-step > span { display: grid; place-items: center; width: 20px; height: 20px; flex: 0 0 auto; border: 1px solid var(--line); border-radius: 50%; color: var(--tx3); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-onboard-step b { display: block; color: var(--tx1); font-size: var(--fs-xs); font-weight: 600; }
.mcp-onboard-step small { display: block; overflow: hidden; color: var(--tx3); font-size: var(--fs-2xs); text-overflow: ellipsis; white-space: nowrap; }
.mcp-onboard-step.done > span { border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); color: var(--ok); }
.mcp-onboard-step.done b { color: var(--ok); }
.mcp-client-test { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin-top: 8px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--ok) 36%, var(--line)); border-radius: var(--r-s); background: color-mix(in srgb, var(--ok) 5%, transparent); }
.mcp-client-test b { color: var(--ok); font-size: var(--fs-xs); }
.mcp-client-test span { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-client-test small { flex: 1 0 100%; color: var(--tx3); font-size: var(--fs-2xs); }
.mcp-client-test.bad { border-color: color-mix(in srgb, var(--warn) 38%, var(--line)); background: color-mix(in srgb, var(--warn) 5%, transparent); }
.mcp-client-test.bad b, .mcp-client-test.bad span { color: var(--warn); }

.mcp-key-zero { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, .65fr); gap: 20px; padding: 10px 0 4px; }
.mcp-zero-main h3 { margin: 5px 0 0; color: var(--tx0); font-size: 1.05rem; font-weight: 650; letter-spacing: -.01em; }
.mcp-zero-main > p { max-width: 720px; margin: 6px 0 0; color: var(--tx2); font-size: var(--fs-xs); line-height: 1.65; }
.mcp-zero-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 14px 0 12px; }
.mcp-zero-preset { display: flex; flex-direction: column; gap: 5px; min-height: 108px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); text-align: left; cursor: pointer; }
.mcp-zero-preset:hover { border-color: color-mix(in srgb, var(--mcp-nav) 42%, var(--line)); background: color-mix(in srgb, var(--mcp-nav) 4%, var(--bg)); }
.mcp-zero-preset.disabled { opacity: .55; cursor: not-allowed; }
.mcp-zero-preset.disabled:hover { border-color: var(--line); background: var(--bg); }
.mcp-zero-preset.disabled .mcp-zero-preset-top em { color: var(--tx3); }
.mcp-zero-preset-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.mcp-zero-preset-top b { color: var(--tx0); font-size: var(--fs-sm); font-weight: 600; }
.mcp-zero-preset-top em { color: var(--mcp-nav); font-size: var(--fs-2xs); font-style: normal; white-space: nowrap; }
.mcp-zero-preset-scope { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-zero-preset-tools { color: var(--tx2); font-size: var(--fs-2xs); }
.mcp-zero-preset small { margin-top: auto; color: var(--tx3); font-size: var(--fs-2xs); line-height: 1.45; }
.mcp-zero-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.mcp-zero-model { padding-left: 20px; border-left: 1px solid var(--line); }
.mcp-zero-model h4 { margin: 6px 0 10px; color: var(--tx0); font-size: var(--fs-sm); font-weight: 600; }
.mcp-zero-model ol { display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; list-style: none; }
.mcp-zero-model li { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 8px; padding: 8px 0; border-bottom: 1px dashed var(--line); }
.mcp-zero-model li:last-child { border-bottom: 0; }
.mcp-zero-model li > span { color: var(--mcp-nav); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-zero-model b { display: block; color: var(--tx1); font-size: var(--fs-xs); font-weight: 600; }
.mcp-zero-model small { display: block; margin-top: 2px; color: var(--tx3); font-size: var(--fs-2xs); line-height: 1.5; }

.mcp-audit-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.mcp-live-toggle { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); color: var(--tx2); font-size: var(--fs-2xs); cursor: pointer; white-space: nowrap; }
.mcp-live-toggle.on { border-color: color-mix(in srgb, var(--ok) 40%, var(--line)); color: var(--ok); }
.mcp-live-toggle .mcp-live-dot.browser { background: var(--tx3); box-shadow: none; animation: none; }
.mcp-audit-key-filter { width: 190px; }
.mcp-audit-window-filter { width: 128px; }

@media (max-width: 1100px) {
  .mcp-key-zero { grid-template-columns: 1fr; }
  .mcp-zero-model { padding-left: 0; padding-top: 14px; border-left: 0; border-top: 1px solid var(--line); }
  .mcp-audit-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .mcp-audit-table { min-width: 760px; }
  .mcp-audit-table th, .mcp-audit-table td { padding: 7px; }
  .mcp-audit-table .mcp-audit-ua { max-width: 120px; }
}
@media (max-width: 900px) {
  .mcp-audit-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .mcp-signal-bar { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 0 !important; padding: 0 !important; }
  .mcp-signal-node { padding: 8px 12px !important; border-bottom: 1px solid var(--line); }
  .mcp-signal-node:nth-of-type(odd) { border-right: 1px solid var(--line); }
  .mcp-signal-node.live { border-left: 0; }
  .mcp-signal-audit { grid-column: 1 / -1; align-items: flex-start; border-left: 0; padding-left: 12px; border-bottom: 0; }
  .mcp-signal-node strong { max-width: 100%; }
  .mcp-signal-arrow { display: none; }
  .mcp-doctor-readout { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mcp-play-keyline .mcp-trial-key-select { flex: 1 1 100%; width: 100%; }
  .mcp-onboard-steps { flex-direction: column; }
  .mcp-onboard-step { border-right: 0; border-bottom: 1px solid var(--line); }
  .mcp-onboard-step:last-child { border-bottom: 0; }
  .mcp-zero-presets { grid-template-columns: 1fr; }
  .mcp-zero-preset { min-height: 0; }
  .mcp-audit-kpis { grid-template-columns: 1fr 1fr; }
  .mcp-audit-kpis > div:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .mcp-audit-key-filter, .mcp-audit-window-filter { width: 100%; }
}
@media (max-width: 760px) {
  .mcp-audit-scroll-hint { display: block; }
  .mcp-console-status { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; width: 100%; }
  .mcp-console-status .mcp-mode-pill { grid-column: 1; grid-row: 1; justify-self: start; }
  .mcp-console-status .mcp-strip-check { grid-column: 2; grid-row: 1; justify-self: end; }
  .mcp-console-status .mcp-endpoint-chip { grid-column: 1 / -1; grid-row: 2; width: 100%; max-width: none; height: auto; min-height: 27px; padding: 5px 9px; }
  .mcp-console-status .mcp-endpoint-chip code { display: block; max-width: none; overflow: visible; white-space: normal; overflow-wrap: anywhere; text-overflow: clip; line-height: 1.35; }
}
@media (max-width: 760px) {
  .mcp-key-card-actions { display: grid; grid-template-columns: repeat(4, minmax(0, auto)); gap: 5px; }
  .mcp-key-card-actions .mcp-prefix-copy { grid-column: 1 / -1; }
  .mcp-key-card-actions > .btn { justify-content: center; padding: 0 6px; }
}
/* ═══ MCP 2.2 · 紧凑版：收紧标题字号、卡片内衬与段间距 ═══ */
.mcp-console.mcp-inline .mcp-console-head { padding: 5px 14px; }
.mcp-console.mcp-inline .mcp-console-title h2 { font-size: 1.15rem; line-height: 1.25; }
.mcp-console.mcp-inline .mcp-console-title .mcp-eyebrow { line-height: 1.1; }
.mcp-console.mcp-inline .mcp-mode-pill,
.mcp-console.mcp-inline .mcp-endpoint-chip { height: 23px; }
.mcp-console.mcp-inline .mcp-signal-bar { padding: 3px 14px; min-height: 31px; }
.mcp-console.mcp-inline .mcp-signal-node strong { font-size: var(--fs-2xs); }
.mcp-console.mcp-inline .mcp-signal-audit b { font-size: .95rem; }
.mcp-console.mcp-inline .mcp-tabs .mcp-rail-item { min-height: 29px; padding: 0 9px; }
.mcp-console.mcp-inline .mcp-card { padding: 9px 16px; }
.mcp-card-head-row { margin-bottom: 6px; }
.mcp-card-head-row h3 { margin-bottom: 0; padding-bottom: 2px; }
.mcp-console.mcp-inline .mcp-card h3 { margin-bottom: 4px; padding-bottom: 3px; }
.mcp-console.mcp-inline .mcp-hint { margin-top: 4px; line-height: 1.5; }
.mcp-console.mcp-inline .mcp-head-sub { display: none; }
.mcp-mode-table th { padding: 5px 8px; }
.mcp-mode-table td { padding: 7px 8px; }
.mcp-mode-table td small { line-height: 1.35; }
.mcp-doctor-status { margin-top: 6px; padding: 6px 9px; }
.mcp-doctor-status small { margin-top: 1px; line-height: 1.35; }
.mcp-doctor-readout { margin-top: 5px; }
.mcp-doctor-readout > div { padding: 5px 7px; }
.mcp-ready-list li { padding: 5px 0; }
.mcp-ready-actions { margin-top: 6px; }
.mcp-cmd-row { padding: 5px 0; }
.mcp-access-commands { margin-top: 8px; }
.mcp-protocol-baseline { margin: 4px 0 8px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg); }
.mcp-protocol-baseline summary { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; list-style: none; }
.mcp-protocol-baseline summary::-webkit-details-marker { display: none; }
.mcp-protocol-baseline summary::before { content: '+'; width: 14px; color: var(--mcp-nav); font-family: var(--mono); font-size: var(--fs-sm); text-align: center; }
.mcp-protocol-baseline[open] summary::before { content: '−'; }
.mcp-protocol-baseline summary b { color: var(--tx1); font-size: var(--fs-xs); font-weight: 600; }
.mcp-protocol-baseline summary > span:last-child { margin-left: auto; color: var(--mcp-nav); font-family: var(--mono); font-size: var(--fs-2xs); }
.mcp-protocol-matrix { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; padding: 4px 12px 8px 34px; border-top: 1px dashed var(--line); }
.mcp-protocol-matrix > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 5px 0; }
.mcp-protocol-matrix span { color: var(--tx3); font-size: var(--fs-2xs); letter-spacing: .06em; text-transform: uppercase; }
.mcp-protocol-matrix code { color: var(--tx1); font-family: var(--mono); font-size: var(--fs-2xs); overflow-wrap: anywhere; }
.mcp-protocol-matrix em { color: var(--tx3); font-size: var(--fs-2xs); font-style: normal; line-height: 1.45; }
@media (max-width: 760px) { .mcp-protocol-matrix { grid-template-columns: 1fr; padding-left: 30px; } }
.mcp-key-head { gap: 8px; }
.mcp-key-head h3 { line-height: 1.3; }
.mcp-key-head .mcp-hint { margin-top: 3px; line-height: 1.45; }
.mcp-kpis { padding-bottom: 4px; }
.mcp-key-zero { gap: 14px; padding: 4px 0 2px; }
.mcp-zero-main h3 { margin-top: 3px; font-size: var(--fs-lg); line-height: 1.25; }
.mcp-zero-main > p { margin-top: 4px; line-height: 1.5; }
.mcp-zero-presets { margin: 9px 0 8px; gap: 7px; }
.mcp-zero-preset { min-height: 88px; padding: 9px 10px; gap: 4px; }
.mcp-zero-model h4 { margin: 4px 0 7px; }
.mcp-zero-model li { padding: 6px 0; }
.mcp-console.mcp-inline .mcp-key-notice { margin-bottom: 4px; padding: 7px 10px; line-height: 1.4; }
.mcp-console.mcp-inline .mcp-onboard { margin-top: 4px; }
.mcp-console.mcp-inline .mcp-onboard-head { margin-bottom: 5px; padding-bottom: 4px; }
.mcp-console.mcp-inline .mcp-onboard-steps { margin-bottom: 5px; }
.mcp-console.mcp-inline .mcp-onboard-step { padding: 3px 8px; gap: 6px; }
.mcp-console.mcp-inline .mcp-onboard-step > span { width: 16px; height: 16px; }
.mcp-console.mcp-inline .mcp-onboard-step small { display: none; }
.mcp-onboard-step small { line-height: 1.35; }
.mcp-client-note { margin-top: 3px; line-height: 1.45; }
.mcp-client-head { margin-top: 6px; }
.mcp-client-code { margin-top: 5px; }
.mcp-troubleshoot { margin-top: 7px; padding-top: 7px; }
.mcp-audit-kpis { margin-bottom: 8px; }
.mcp-audit-kpis > div { padding: 6px 9px; }
.mcp-audit-toolbar { margin-bottom: 6px; gap: 5px; }
.mcp-key-card { padding: 10px 12px; gap: 7px; }
.mcp-key-card-actions { gap: 4px; }
.mcp-key-metrics { gap: 10px; }
.mcp-key-foot { padding-top: 6px; }
.mcp-play-grid { gap: 8px; }
.mcp-play-head h3 { margin-bottom: 2px; }
.mcp-play-result .mcp-result { max-height: 280px; }
.mcp-client-workbench { gap: 10px; }
.mcp-protocol { margin-top: 10px; padding-top: 10px; }

@media (max-width: 600px) {
  .mcp-client-tile-copy b, .mcp-client-tile-copy small { overflow: visible; white-space: normal; text-overflow: clip; line-height: 1.3; }
}

@media (prefers-reduced-motion: reduce) {
  .mcp-signal-bar.busy::after { animation: none; }
}
</style>
