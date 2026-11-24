/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.console.mcp;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.StructureSyncService;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Console binding of the shared MCP core: adds the servlet request fallback (standalone tests do
 * not run the filter) and the console-built structure-sync service (plan store + remote factory).
 * All protocol/tool behavior lives in {@link McpServerCore}.
 */
public class McpController extends McpServerCore {

    private final EsClientRouter consoleRouter;
    private RemoteEsClientFactory remoteEsClientFactory;

    public McpController(EsIndexAdmin esIndexAdmin, String token) {
        super(esIndexAdmin, token);
        this.consoleRouter = null;
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService) {
        super(esIndexAdmin, token, accessService);
        this.consoleRouter = null;
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         EsClientRouter clientRouter) {
        super(esIndexAdmin, token, accessService, clientRouter);
        this.consoleRouter = clientRouter;
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         EsClientRouter clientRouter, ConnStore connStore) {
        super(esIndexAdmin, token, accessService, clientRouter, connStore);
        this.consoleRouter = clientRouter;
    }

    public McpController(EsIndexAdmin esIndexAdmin, String token, McpAccessService accessService,
                         EsClientRouter clientRouter, ConnStore connStore, long callTimeoutMs) {
        super(esIndexAdmin, token, accessService, clientRouter, connStore, callTimeoutMs);
        this.consoleRouter = clientRouter;
    }

    @Autowired(required = false)
    public void setRemoteEsClientFactory(RemoteEsClientFactory remoteEsClientFactory) {
        this.remoteEsClientFactory = remoteEsClientFactory;
    }

    /** Console 形态的懒建单例：与 REST 侧共用同一份进程级计划存储。 */
    @Override
    protected McpStructureSyncService structureSync() {
        if (structureSyncService != null) return structureSyncService;
        synchronized (this) {
            if (structureSyncService == null) {
                StructureSyncService built = new StructureSyncService(
                        () -> consoleRouter == null ? null : consoleRouter.host(),
                        esIndexAdmin, remoteEsClientFactory);
                built.setPlanStore(PlanStore.sharedInstance(
                        () -> consoleRouter == null ? null : consoleRouter.host()));
                structureSyncService = built;
            }
            return structureSyncService;
        }
    }
}
