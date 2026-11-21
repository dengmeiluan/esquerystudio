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

package io.github.dengmeiluan.esquerystudio.console.web;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the segment-visibility blind spot fix.
 *
 * <p>Two independent things are asserted here, both of which were silently missing
 * and neither of which any existing test would notice:</p>
 *
 * <ol>
 *   <li><b>_cat/indices must request segments.count and docs.deleted.</b>
 *       The optimizer wizard reads only _settings, which carries no segment
 *       information at all, so force_merge (usually the single highest-value
 *       tuning action) could never be reported. Dropping these two columns from
 *       the h= list restores the blind spot without breaking anything else.</li>
 *   <li><b>cluster/force-merge must exist and accept an arbitrary index.</b>
 *       The pre-existing force-merge endpoint routes through
 *       IndexMetaRegistry.getByKey and therefore only works for registered
 *       managed indices; 宿主 has zero @Document entities, so that path is
 *       unusable for arbitrary cluster indices. The new endpoint follows the
 *       cluster/* convention (resolveToPhysical) like cluster/inspect does.</li>
 * </ol>
 *
 * <p>Deliberately reflection/source based: force_merge is a heavyweight,
 * partially irreversible operation and must never be executed against a real
 * shared cluster from a test.</p>
 */
public class ClusterForceMergeWiringTest {

    /**
     * The h= column list is a plain string literal, so read the source to assert on it.
     * A live _cat call is not an option here.
     */
    private String readListClusterIndicesSource() throws Exception {
        java.io.File f = new java.io.File(
                "src/main/java/io/github/dengmeiluan/esquerystudio/console/core/EsIndexAdmin.java");
        assertThat(f).as("EsIndexAdmin.java must be resolvable from module dir").exists();
        String src = new String(java.nio.file.Files.readAllBytes(f.toPath()), "UTF-8");
        int at = src.indexOf("public java.util.List<Map<String, Object>> listClusterIndices(");
        assertThat(at).as("listClusterIndices must exist").isGreaterThan(0);
        // Bound the slice to this method only; a fixed window would leak into neighbours.
        int end = src.indexOf("\n    }", at);
        assertThat(end).isGreaterThan(at);
        return src.substring(at, end);
    }

    /**
     * Reads exactly one controller method's source, where the HTTP param contract lives.
     *
     * <p>The slice must stop at the method's own closing brace. A fixed-width window
     * overruns into the next handler, which also calls resolveToPhysical, and that made
     * an earlier version of this test survive deletion of the call under test.</p>
     */
    private String readControllerMethodSource(String methodName) throws Exception {
        java.io.File f = new java.io.File(
                "src/main/java/io/github/dengmeiluan/esquerystudio/console/web/InternalEsIndexRebuildController.java");
        assertThat(f).exists();
        String src = new String(java.nio.file.Files.readAllBytes(f.toPath()), "UTF-8");
        int at = src.indexOf("public Map<String, Object> " + methodName + "(");
        if (at < 0) at = src.indexOf("public void " + methodName + "(");
        assertThat(at).as(methodName + " must exist").isGreaterThan(0);
        // Method body ends at the first "\n    }" (4-space indented closing brace).
        int end = src.indexOf("\n    }", at);
        assertThat(end).as(methodName + " must have a closing brace").isGreaterThan(at);
        return src.substring(at, end);
    }

    @Test
    public void catIndicesMustRequestSegmentCount() throws Exception {
        String body = readListClusterIndicesSource();
        assertThat(body)
                .as("segments.count is the only source of segment data; without it the "
                        + "optimizer wizard cannot ever recommend force_merge")
                .contains("segments.count");
    }

    @Test
    public void catIndicesMustRequestDocsDeleted() throws Exception {
        String body = readListClusterIndicesSource();
        assertThat(body)
                .as("docs.deleted tells the operator whether force_merge will actually "
                        + "reclaim disk space or merely reduce segment count")
                .contains("docs.deleted");
    }

    @Test
    public void catIndicesMustKeepPreExistingColumns() throws Exception {
        String body = readListClusterIndicesSource();
        // pri / rep are required to normalise segment count to a per-primary-shard figure
        assertThat(body).contains("index,health,status,docs.count,store.size,pri,rep");
    }

    @Test
    public void clusterForceMergeEndpointExists() throws Exception {
        Method m = InternalEsIndexRebuildController.class
                .getDeclaredMethod("clusterForceMerge", String.class, int.class);
        PostMapping pm = m.getAnnotation(PostMapping.class);
        assertThat(pm).as("must be a POST endpoint").isNotNull();
        assertThat(pm.value()).containsExactly("cluster/force-merge");
    }

    @Test
    public void clusterForceMergeTakesIndexNotIndexKey() throws Exception {
        Method m = InternalEsIndexRebuildController.class
                .getDeclaredMethod("clusterForceMerge", String.class, int.class);
        // @RequestParam without an explicit value() resolves the name from the bytecode
        // parameter name, and this module does not compile with -parameters, so the
        // annotation carries "". The HTTP contract therefore lives in the source text.
        assertThat(((RequestParam) m.getParameterAnnotations()[1][0]).defaultValue())
                .as("maxSegments must default to 1")
                .isEqualTo("1");

        String body = readControllerMethodSource("clusterForceMerge");
        assertThat(body)
                .as("must accept an arbitrary index (resolveToPhysical), not a registry indexKey")
                .contains("@RequestParam String index")
                .contains("int maxSegments");
        assertThat(body)
                .as("indexKey would bind this to registered managed indices only")
                .doesNotContain("indexKey");
    }

    @Test
    public void preExistingManagedForceMergeMustSurvive() throws Exception {
        // The managed-index path is still in use; the new endpoint must be additive.
        Method m = InternalEsIndexRebuildController.class
                .getDeclaredMethod("forceMerge", String.class, int.class);
        assertThat(m.getAnnotation(PostMapping.class).value()).containsExactly("force-merge");
        String body = readControllerMethodSource("forceMerge");
        assertThat(body).contains("indexKey");
        assertThat(body).contains("esIndexRebuildService.forceMerge");
    }

    @Test
    public void esIndexAdminForceMergeSignatureUnchanged() throws Exception {
        // The new endpoint delegates here; it takes a physical index name.
        Method m = EsIndexAdmin.class.getDeclaredMethod("forceMerge", String.class, int.class);
        assertThat(m).isNotNull();
    }

    @Test
    public void clusterForceMergeMustResolveToPhysical() throws Exception {
        String body = readControllerMethodSource("clusterForceMerge");
        assertThat(body)
                .as("must follow the cluster/* convention so aliases and arbitrary "
                        + "indices both work, matching cluster/inspect")
                .contains("resolveToPhysical");
        assertThat(body)
                .as("must delegate to the admin helper, not the registry-bound service")
                .contains("esIndexAdmin.forceMerge");
    }
}
