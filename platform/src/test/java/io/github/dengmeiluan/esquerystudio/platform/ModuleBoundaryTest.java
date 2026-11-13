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

package io.github.dengmeiluan.esquerystudio.platform;

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Guards the module dependency direction documented in {@code docs/architecture.md}.
 *
 * <p>Without a mechanical guard, a convenience dependency can quietly turn the platform kernel
 * into an Elasticsearch-aware module or let the console depend on the standalone server. Both
 * would make the “platform without Elasticsearch” and “library jar not a boot jar” promises
 * unverifiable.</p>
 */
public class ModuleBoundaryTest {

    private final Path root = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")))
            .toAbsolutePath().normalize();

    @Test
    public void reactorContainsOnlyTheDocumentedModules() throws IOException {
        String pom = read("pom.xml");
        assertTrue(pom.contains("<module>platform</module>"));
        assertTrue(pom.contains("<module>modules/console</module>"));
        assertTrue(pom.contains("<module>apps/server</module>"));
        assertFalse("integrations are host-owned and must not return to the reactor",
                pom.contains("<module>integrations/"));
    }

    @Test
    public void platformHasNoElasticsearchOrConsoleDependency() throws IOException {
        String pom = read("platform/pom.xml");
        assertFalse("platform must stay Elasticsearch-agnostic", pom.contains("org.elasticsearch"));
        assertFalse("platform must not depend on console", pom.contains("esquerystudio-console"));
        assertTrue("platform declares its own artifact", pom.contains("<artifactId>esquerystudio-platform</artifactId>"));
    }

    @Test
    public void consoleDependsOnPlatformButNotOnServer() throws IOException {
        String pom = read("modules/console/pom.xml");
        assertTrue(pom.contains("<artifactId>esquerystudio-platform</artifactId>"));
        assertFalse("console is the library; server depends on it, not the reverse",
                pom.contains("<artifactId>esquerystudio-server</artifactId>"));
    }

    @Test
    public void serverDependsOnConsole() throws IOException {
        String pom = read("apps/server/pom.xml");
        assertTrue(pom.contains("<artifactId>esquerystudio-console</artifactId>"));
    }

    @Test
    public void releaseVersionIsAlignedAcrossPackages() throws IOException {
        String pom = read("pom.xml");
        int start = pom.indexOf("<artifactId>esquerystudio</artifactId>");
        String version = firstVersion(pom.substring(start));
        String[] jsonFiles = {
                "ui/package.json"
        };
        for (String file : jsonFiles) {
            String json = read(file);
            java.util.regex.Matcher matcher = java.util.regex.Pattern
                    .compile("\"version\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
            assertTrue(file + " must declare a version", matcher.find());
            assertTrue(file + " version must match " + version + ", actual " + matcher.group(1),
                    version.equals(matcher.group(1)));
        }
        String citation = read("CITATION.cff");
        java.util.regex.Matcher citationVersion = java.util.regex.Pattern
                .compile("(?m)^version:\\s*(\\S+)\\s*$").matcher(citation);
        assertTrue("CITATION.cff must declare a version", citationVersion.find());
        assertTrue("CITATION.cff version must match " + version, version.equals(citationVersion.group(1)));
    }

    private static String firstVersion(String pomFragment) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("<version>([^<]+)</version>").matcher(pomFragment);
        assertTrue("missing project version", matcher.find());
        return matcher.group(1);
    }

    private String read(String relative) throws IOException {
        Path path = root.resolve(relative);
        assertTrue("missing " + path, Files.isRegularFile(path));
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }
}
