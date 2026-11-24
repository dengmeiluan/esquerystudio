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

package io.github.dengmeiluan.esquerystudio.console.mapping;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;

public class MappingDeltaCalculatorTest {

    private static final List<String> MAPPING_PARAMETERS = Arrays.asList(
            "analyzer", "search_analyzer", "normalizer", "format", "index",
            "doc_values", "store", "ignore_above", "dynamic");

    @Test
    public void addsMissingNestedChildAndKeepsExistingFields() {
        String desired = "{\"properties\":{\"code\":{\"type\":\"keyword\"},"
                + "\"legs\":{\"type\":\"nested\",\"properties\":{\"id\":{\"type\":\"keyword\"}}}}}";
        String actual = "{\"properties\":{\"code\":{\"type\":\"keyword\"},"
                + "\"legs\":{\"type\":\"nested\"}}}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.isUnparsed()).isFalse();
        assertThat(delta.getUnchanged()).containsExactly("properties.code", "properties.legs");
        assertThat(delta.getConflicts()).isEmpty();
        assertThat(fieldDefinition(delta, "legs", "id"))
                .containsEntry("type", "keyword");
    }

    @Test
    public void preservesCompleteDefinitionForDesiredOnlyField() {
        String desired = "{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\","
                + "\"fields\":{\"raw\":{\"type\":\"keyword\",\"ignore_above\":256}}}}}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, "{\"properties\":{}}");

        assertThat(topLevelField(delta, "title"))
                .containsEntry("type", "text")
                .containsEntry("analyzer", "ik_max_word")
                .containsKey("fields");
    }

    @Test
    public void reportsTextToKeywordAsTypeConflict() {
        assertTypeConflict("text", "keyword");
    }

    @Test
    public void reportsObjectToNestedAsTypeConflict() {
        assertTypeConflict("object", "nested");
    }

    @Test
    public void reportsDateToLongAsTypeConflict() {
        assertTypeConflict("date", "long");
    }

    @Test
    public void reportsAnalyzerChangeAtParameterPath() {
        MappingConflict conflict = singleParameterConflict(
                "{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}",
                "{\"type\":\"text\",\"analyzer\":\"standard\"}");

        assertThat(conflict.getPath()).isEqualTo("properties.value.analyzer");
        assertThat(conflict.getActualSummary()).isEqualTo("standard");
        assertThat(conflict.getDesiredSummary()).isEqualTo("ik_max_word");
    }

    @Test
    public void reportsNormalizerChangeAtParameterPath() {
        MappingConflict conflict = singleParameterConflict(
                "{\"type\":\"keyword\",\"normalizer\":\"lowercase\"}",
                "{\"type\":\"keyword\",\"normalizer\":\"uppercase\"}");

        assertThat(conflict.getPath()).isEqualTo("properties.value.normalizer");
    }

    @Test
    public void reportsFormatChangeAtParameterPath() {
        MappingConflict conflict = singleParameterConflict(
                "{\"type\":\"date\",\"format\":\"epoch_millis\"}",
                "{\"type\":\"date\",\"format\":\"strict_date_optional_time\"}");

        assertThat(conflict.getPath()).isEqualTo("properties.value.format");
    }

    @Test
    public void allExplicitMappingParametersConflictWhenActualDiffersOrIsMissing() {
        for (String parameter : MAPPING_PARAMETERS) {
            String desiredDefinition = parameterDefinition(parameter, desiredParameterValue(parameter));
            String differentActual = parameterDefinition(parameter, actualParameterValue(parameter));

            assertSingleParameterConflict(parameter, desiredDefinition, differentActual);
            assertSingleParameterConflict(parameter, desiredDefinition, baseDefinition(parameter));
        }
    }

    @Test
    public void omittedDesiredMappingParametersPreserveActualValues() {
        for (String parameter : MAPPING_PARAMETERS) {
            MappingDelta delta = MappingDeltaCalculator.calculate(
                    mappingWithValue(baseDefinition(parameter)),
                    mappingWithValue(parameterDefinition(parameter, actualParameterValue(parameter))));

            assertThat(delta.getConflicts()).as(parameter).isEmpty();
            assertThat(delta.getAdditions()).as(parameter).isEmpty();
            assertThat(delta.getUnchanged()).as(parameter).containsExactly("properties.value");
        }
    }

    @Test
    public void explicitNullMappingParameterIsUnparsedInsteadOfOmitted() {
        for (String parameter : MAPPING_PARAMETERS) {
            assertThat(MappingDeltaCalculator.calculate(
                    mappingWithValue(parameterDefinition(parameter, "null")),
                    mappingWithValue(baseDefinition(parameter))).isUnparsed())
                    .as(parameter)
                    .isTrue();
            assertThat(MappingDeltaCalculator.calculate(
                    mappingWithValue(baseDefinition(parameter)),
                    mappingWithValue(parameterDefinition(parameter, "null"))).isUnparsed())
                    .as(parameter)
                    .isTrue();
        }
    }

    @Test
    public void booleanParameterStringAndNativeFormsConverge() {
        String[] parameters = {"index", "doc_values", "store", "dynamic"};
        String[] values = {"false", "true", "false", "true"};

        for (int i = 0; i < parameters.length; i++) {
            String textual = parameterDefinition(parameters[i], "\"" + values[i] + "\"");
            String nativeValue = parameterDefinition(parameters[i], values[i]);

            assertNoFieldConflict(parameters[i], textual, nativeValue);
            assertNoFieldConflict(parameters[i], nativeValue, textual);
        }
    }

    @Test
    public void explicitFieldDefaultsConflictWhenActualIsOmitted() {
        String[] parameters = {"index", "doc_values", "store", "dynamic"};
        String[] defaults = {"true", "true", "false", "true"};

        for (int i = 0; i < parameters.length; i++) {
            assertSingleParameterConflict(parameters[i],
                    parameterDefinition(parameters[i], defaults[i]),
                    baseDefinition(parameters[i]));
        }
    }

    @Test
    public void ignoreAboveStringAndNativeIntegerFormsConverge() {
        assertNoFieldConflict("ignore_above",
                parameterDefinition("ignore_above", "\"256\""),
                parameterDefinition("ignore_above", "256"));
        assertNoFieldConflict("ignore_above",
                parameterDefinition("ignore_above", "256"),
                parameterDefinition("ignore_above", "\"256\""));
    }

    @Test
    public void invalidBooleanIntegerAndDynamicDomainsAreUnparsed() {
        String[] booleanParameters = {"index", "doc_values", "store"};
        String[] invalidBooleans = {"\"yes\"", "1"};
        for (String parameter : booleanParameters) {
            for (String invalid : invalidBooleans) {
                assertParameterUnparsedBothDirections(parameter, invalid);
            }
        }

        String[] invalidDynamic = {"\"yes\"", "\"runtime\"", "1"};
        for (String invalid : invalidDynamic) {
            assertParameterUnparsedBothDirections("dynamic", invalid);
            assertUnparsed("{\"properties\":{},\"dynamic\":" + invalid + "}", "{\"properties\":{}}");
            assertUnparsed("{\"properties\":{}}", "{\"properties\":{},\"dynamic\":" + invalid + "}");
        }

        String[] invalidIgnoreAbove = {
                "-1", "1.5", "2147483648", "\"-1\"", "\"1.5\"",
                "\"2147483648\"", "\"not-a-number\""
        };
        for (String invalid : invalidIgnoreAbove) {
            assertParameterUnparsedBothDirections("ignore_above", invalid);
        }
    }

    @Test
    public void treatsMissingTypeWithPropertiesAsObjectAndRecurses() {
        String desired = "{\"properties\":{\"owner\":{\"properties\":{\"id\":{\"type\":\"keyword\"}}}}}";
        String actual = "{\"properties\":{\"owner\":{\"type\":\"object\",\"properties\":{}}}}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.getUnchanged()).containsExactly("properties.owner");
        assertThat(fieldDefinition(delta, "owner", "id")).containsEntry("type", "keyword");
        assertThat(delta.getConflicts()).isEmpty();
    }

    @Test
    public void recursiveChildAdditionPreservesEqualExplicitEnabledFalse() {
        String desired = "{\"properties\":{\"payload\":{\"enabled\":false,\"properties\":{"
                + "\"id\":{\"type\":\"keyword\"}}}}}";
        String actual = "{\"properties\":{\"payload\":{\"enabled\":\"false\",\"properties\":{}}}}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.getConflicts()).isEmpty();
        assertThat(topLevelField(delta, "payload"))
                .containsEntry("enabled", false)
                .containsKey("properties");
        assertThat(fieldDefinition(delta, "payload", "id")).containsEntry("type", "keyword");
    }

    @Test
    public void recursiveChildAdditionDoesNotCopyConflictingEnabled() {
        String desired = "{\"properties\":{\"payload\":{\"enabled\":false,\"properties\":{"
                + "\"id\":{\"type\":\"keyword\"}}}}}";
        String actual = "{\"properties\":{\"payload\":{\"enabled\":true,\"properties\":{}}}}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.getConflicts()).extracting(MappingConflict::getPath)
                .containsExactly("properties.payload.enabled");
        assertThat(topLevelField(delta, "payload"))
                .doesNotContainKey("enabled")
                .containsKey("properties");
    }

    @Test
    public void missingDynamicTemplatesRequireManualResolution() {
        String templates = "[{\"strings\":{\"match_mapping_type\":\"string\","
                + "\"mapping\":{\"type\":\"keyword\"}}}]";

        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic_templates\":" + templates + "}",
                "{\"properties\":{}}");

        assertThat(delta.getAdditions()).isEmpty();
        assertThat(delta.getConflicts()).hasSize(1);
        MappingConflict conflict = delta.getConflicts().get(0);
        assertThat(conflict.getPath()).isEqualTo("dynamic_templates");
        assertThat(conflict.getCode()).isEqualTo("DYNAMIC_TEMPLATE_CONFLICT");
        assertThat(conflict.getActualSummary()).isEqualTo("<missing>");
        assertThat(conflict.getDesiredSummary()).isEqualTo(templates);
    }

    @Test
    public void missingDynamicTemplatesDoNotBlockSafePropertyDeltaCalculation() {
        String desired = "{\"properties\":{\"safe\":{\"type\":\"keyword\"}},"
                + "\"dynamic_templates\":[{\"strings\":{\"mapping\":{\"type\":\"keyword\"}}}]}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, "{\"properties\":{}}");

        assertThat(topLevelField(delta, "safe")).containsEntry("type", "keyword");
        assertThat(delta.getAdditions()).doesNotContainKey("dynamic_templates");
        assertThat(delta.getConflicts()).extracting(MappingConflict::getPath)
                .containsExactly("dynamic_templates");
    }

    @Test
    public void concurrentDesiredTemplateListsAgainstAbsentActualBothRemainManualOnly() {
        String desiredA = "{\"dynamic_templates\":[{\"strings_v1\":{\"mapping\":{\"type\":\"keyword\"}}}]}";
        String desiredB = "{\"dynamic_templates\":[{\"strings_v2\":{\"mapping\":{\"type\":\"text\"}}}]}";

        MappingDelta deltaA = MappingDeltaCalculator.calculate(desiredA, "{\"properties\":{}}");
        MappingDelta deltaB = MappingDeltaCalculator.calculate(desiredB, "{\"properties\":{}}");

        for (MappingDelta delta : Arrays.asList(deltaA, deltaB)) {
            assertThat(delta.getAdditions()).doesNotContainKey("dynamic_templates").isEmpty();
            assertThat(delta.getConflicts()).hasSize(1);
            assertThat(delta.getConflicts().get(0).getCode()).isEqualTo("DYNAMIC_TEMPLATE_CONFLICT");
            assertThat(delta.getConflicts().get(0).getActualSummary()).isEqualTo("<missing>");
        }
    }

    @Test
    public void recordsEqualDynamicTemplatesAsUnchanged() {
        String mapping = "{\"dynamic_templates\":[{\"strings\":{\"mapping\":{\"type\":\"keyword\"}}}]}";

        MappingDelta delta = MappingDeltaCalculator.calculate(mapping, mapping);

        assertThat(delta.getUnchanged()).containsExactly("dynamic_templates");
        assertThat(delta.getAdditions()).isEmpty();
        assertThat(delta.getConflicts()).isEmpty();
    }

    @Test
    public void reportsDifferentDynamicTemplatesAsDedicatedConflict() {
        String desired = "{\"dynamic_templates\":[{\"strings\":{\"mapping\":{\"type\":\"keyword\"}}}]}";
        String actual = "{\"dynamic_templates\":[{\"strings\":{\"mapping\":{\"type\":\"text\"}}}]}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.getConflicts()).hasSize(1);
        assertThat(delta.getConflicts().get(0).getPath()).isEqualTo("dynamic_templates");
        assertThat(delta.getConflicts().get(0).getCode()).isEqualTo("DYNAMIC_TEMPLATE_CONFLICT");
        assertThat(delta.getAdditions()).isEmpty();
    }

    @Test
    public void recordsActualOnlyFieldsAndTemplatesAsIgnored() {
        String desired = "{\"properties\":{\"code\":{\"type\":\"keyword\"}}}";
        String actual = "{\"properties\":{\"code\":{\"type\":\"keyword\"},"
                + "\"legacy\":{\"type\":\"long\"}},\"dynamic_templates\":[]}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.getIgnored()).containsExactly("properties.legacy", "dynamic_templates");
        assertThat(delta.getAdditions()).isEmpty();
        assertThat(delta.getConflicts()).isEmpty();
    }

    @Test
    public void actualOnlyRootDynamicIsPreservedAndIgnored() {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{}}", "{\"properties\":{},\"dynamic\":\"strict\"}");

        assertThat(delta.getConflicts()).isEmpty();
        assertThat(delta.getAdditions()).doesNotContainKey("dynamic");
        assertThat(delta.getIgnored()).containsExactly("dynamic");
    }

    @Test
    public void equalRootDynamicIsUnchanged() {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic\":\"strict\"}",
                "{\"properties\":{},\"dynamic\":\"strict\"}");

        assertThat(delta.getConflicts()).isEmpty();
        assertThat(delta.getAdditions()).doesNotContainKey("dynamic");
        assertThat(delta.getUnchanged()).containsExactly("dynamic");
    }

    @Test
    public void dynamicOnlyActualMappingSupportsSafePropertyAdditionWhenDynamicMatches() {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}},\"dynamic\":\"strict\"}",
                "{\"dynamic\":\"strict\"}");

        assertThat(delta.isUnparsed()).isFalse();
        assertThat(delta.getUnchanged()).containsExactly("dynamic");
        assertThat(topLevelField(delta, "new_field")).containsEntry("type", "keyword");
        assertThat(delta.getConflicts()).isEmpty();
    }

    @Test
    public void dynamicOnlyActualMappingReportsConflictAndRetainsSafePropertyAddition() {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}},\"dynamic\":true}",
                "{\"dynamic\":\"strict\"}");

        assertThat(delta.isUnparsed()).isFalse();
        assertRootDynamicConflict(delta, "strict", "true");
        assertThat(topLevelField(delta, "new_field")).containsEntry("type", "keyword");
    }

    @Test
    public void desiredRootDynamicMissingOrDifferentInActualIsAParameterConflict() {
        MappingDelta missing = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic\":\"strict\"}", "{\"properties\":{}}");
        MappingDelta different = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic\":\"strict\"}",
                "{\"properties\":{},\"dynamic\":true}");

        assertRootDynamicConflict(missing, "<missing>", "strict");
        assertRootDynamicConflict(different, "true", "strict");
    }

    @Test
    public void rootDynamicCanonicalBooleanFormsConvergeButOmissionConflicts() {
        MappingDelta stringVsNative = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic\":\"true\"}",
                "{\"properties\":{},\"dynamic\":true}");
        MappingDelta nativeVsString = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic\":true}",
                "{\"properties\":{},\"dynamic\":\"true\"}");
        MappingDelta actualDefaultOmitted = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic\":true}", "{\"properties\":{}}");

        assertRootDynamicConverged(stringVsNative);
        assertRootDynamicConverged(nativeVsString);
        assertRootDynamicConflict(actualDefaultOmitted, "<missing>", "true");
    }

    @Test
    public void dynamicStrictComparisonIsCaseInsensitiveAndAdditionsPreserveOriginalText() {
        MappingDelta root = MappingDeltaCalculator.calculate(
                "{\"properties\":{},\"dynamic\":\"STRICT\"}",
                "{\"properties\":{},\"dynamic\":\"strict\"}");
        MappingDelta field = MappingDeltaCalculator.calculate(
                mappingWithValue("{\"properties\":{},\"dynamic\":\"Strict\"}"),
                mappingWithValue("{\"properties\":{},\"dynamic\":\"strict\"}"));
        MappingDelta desiredOnly = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"payload\":{\"properties\":{},\"dynamic\":\"STRICT\"}}}",
                "{\"properties\":{}}");

        assertRootDynamicConverged(root);
        assertThat(field.getConflicts()).isEmpty();
        assertThat(topLevelField(desiredOnly, "payload"))
                .containsEntry("dynamic", "STRICT");
    }

    @Test
    public void enabledOnlyObjectIsAddedAndComparedAsAnObjectParameter() {
        MappingDelta desiredOnly = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"payload\":{\"enabled\":false}}}",
                "{\"properties\":{}}");
        assertThat(desiredOnly.isUnparsed()).isFalse();
        assertThat(topLevelField(desiredOnly, "payload"))
                .containsExactly(entry("enabled", false));

        assertNoFieldConflict("enabled",
                "{\"enabled\":\"false\"}", "{\"enabled\":false}");
        assertNoFieldConflict("enabled",
                "{\"type\":\"object\"}", "{\"enabled\":false}");

        MappingConflict omittedActualConflict = singleParameterConflict(
                "{\"enabled\":true}", "{\"type\":\"object\"}");
        assertThat(omittedActualConflict.getPath()).isEqualTo("properties.value.enabled");

        MappingConflict conflict = singleParameterConflict(
                "{\"enabled\":false}", "{\"type\":\"object\"}");
        assertThat(conflict.getPath()).isEqualTo("properties.value.enabled");
        assertThat(conflict.getCode()).isEqualTo("PARAMETER_CONFLICT");
    }

    @Test
    public void enabledAndObjectDynamicAreRejectedOutsideObjectDefinitions() {
        String emptyActual = "{\"properties\":{}}";

        assertUnparsed("{\"properties\":{\"x\":{\"enabled\":false,\"dynamic\":\"strict\"}}}",
                emptyActual);
        assertUnparsed("{\"properties\":{\"x\":{\"type\":\"keyword\",\"enabled\":false}}}",
                emptyActual);
        assertUnparsed("{\"properties\":{\"x\":{\"type\":\"keyword\",\"dynamic\":true}}}",
                emptyActual);

        MappingDelta validPropertiesObject = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"x\":{\"properties\":{},\"enabled\":false,\"dynamic\":\"strict\"}}}",
                emptyActual);
        MappingDelta validNested = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"x\":{\"type\":\"nested\",\"enabled\":false,"
                        + "\"dynamic\":\"strict\",\"properties\":{}}}}",
                emptyActual);

        assertThat(validPropertiesObject.isUnparsed()).isFalse();
        assertThat(validNested.isUnparsed()).isFalse();
    }

    @Test
    public void invalidEnabledValuesAreUnparsed() {
        String[] invalidEnabled = {"null", "1", "\"yes\""};
        for (String invalid : invalidEnabled) {
            assertParameterUnparsedBothDirections("enabled", invalid);
        }
    }

    @Test
    public void treatsExplicitEmptyPropertiesAsParsedNoOp() {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{}}", "{\"properties\":{}}");

        assertThat(delta.isUnparsed()).isFalse();
        assertThat(delta.getAdditions()).isEmpty();
        assertThat(delta.getConflicts()).isEmpty();
        assertThat(delta.getUnchanged()).isEmpty();
        assertThat(delta.getIgnored()).isEmpty();
    }

    @Test
    public void returnsUnparsedForInvalidDesiredInputs() {
        assertUnparsed(null, "{}");
        assertUnparsed("", "{}");
        assertUnparsed("not-json", "{}");
        assertUnparsed("[]", "{}");
        assertUnparsed("{}", "{}");
        assertUnparsed("{\"properties\":[]}", "{}");
        assertUnparsed("{\"dynamic_templates\":{}}", "{}");
    }

    @Test
    public void returnsUnparsedForEmptyOrBlankDesiredFieldDefinitions() {
        assertUnparsed("{\"properties\":{\"x\":{}}}", "{\"properties\":{}}");
        assertUnparsed("{\"properties\":{\"x\":{\"type\":\"\"}}}", "{\"properties\":{}}");
        assertUnparsed("{\"properties\":{\"x\":{\"type\":\"   \"}}}", "{\"properties\":{}}");
    }

    @Test
    public void returnsUnparsedForInvalidActualInputs() {
        String desired = "{\"properties\":{\"code\":{\"type\":\"keyword\"}}}";

        assertUnparsed(desired, null);
        assertUnparsed(desired, "");
        assertUnparsed(desired, "not-json");
        assertUnparsed(desired, "[]");
        assertUnparsed(desired, "{\"properties\":[]}");
    }

    @Test
    public void ambiguousMultiTypeActualMappingFailsClosedWithoutDiffs() {
        String desired = "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}}}";
        String actual = "{\"type_a\":{\"properties\":{\"a\":{\"type\":\"keyword\"}}},"
                + "\"type_b\":{\"properties\":{\"b\":{\"type\":\"long\"}}}}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.isUnparsed()).isTrue();
        assertThat(delta.getAdditions()).isEmpty();
        assertThat(delta.getConflicts()).isEmpty();
    }

    @Test
    public void dynamicTemplateEntriesMustBeNonEmptyObjects() {
        String validDesired = "{\"dynamic_templates\":[{\"strings\":{\"mapping\":{\"type\":\"keyword\"}}}]}";
        String[] invalidEntries = {"null", "1", "\"template\"", "{}"};

        for (String invalidEntry : invalidEntries) {
            assertUnparsed("{\"dynamic_templates\":[" + invalidEntry + "]}", "{\"properties\":{}}");
            assertUnparsed(validDesired, "{\"dynamic_templates\":[" + invalidEntry + "]}");
        }
    }

    @Test
    public void returnsUnparsedForEmptyOrBlankActualFieldDefinitions() {
        String desired = "{\"properties\":{\"x\":{\"type\":\"keyword\"}}}";

        assertUnparsed(desired, "{\"properties\":{\"x\":{}}}");
        assertUnparsed(desired, "{\"properties\":{\"x\":{\"type\":\"\"}}}");
        assertUnparsed(desired, "{\"properties\":{\"x\":{\"type\":\"   \"}}}");
    }

    @Test
    public void normalizesSingleElasticsearchSixTypeWrapper() {
        String desired = "{\"_doc\":{\"properties\":{\"code\":{\"type\":\"keyword\"},"
                + "\"createdAt\":{\"type\":\"date\"}}}}";
        String actual = "{\"_doc\":{\"properties\":{\"code\":{\"type\":\"keyword\"}}}}";

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.isUnparsed()).isFalse();
        assertThat(delta.getUnchanged()).containsExactly("properties.code");
        assertThat(topLevelField(delta, "createdAt")).containsEntry("type", "date");
    }

    @Test
    public void normalizesSingleElasticsearchSixTypeWrapperWithOnlyRootDynamic() {
        String actual = "{\"legacy_type\":{\"dynamic\":\"strict\"}}";

        MappingDelta matching = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}},\"dynamic\":\"strict\"}",
                actual);
        MappingDelta conflicting = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}},\"dynamic\":true}",
                actual);

        assertThat(matching.isUnparsed()).isFalse();
        assertThat(matching.getUnchanged()).containsExactly("dynamic");
        assertThat(topLevelField(matching, "new_field")).containsEntry("type", "keyword");
        assertThat(matching.getConflicts()).isEmpty();
        assertThat(conflicting.isUnparsed()).isFalse();
        assertRootDynamicConflict(conflicting, "strict", "true");
        assertThat(topLevelField(conflicting, "new_field")).containsEntry("type", "keyword");
    }

    @Test
    public void unrelatedSingleWrapperActualMappingRemainsUnparsed() {
        assertUnparsed(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}}}",
                "{\"legacy_type\":{\"meta\":\"unrelated\"}}");
    }

    @Test
    public void resultCollectionsAreDefensiveAndDeeplyUnmodifiable() {
        Map<String, Object> field = new LinkedHashMap<String, Object>();
        field.put("type", "keyword");
        List<Object> copyTo = new ArrayList<Object>();
        copyTo.add("search_text");
        field.put("copy_to", copyTo);
        Map<String, Object> properties = new LinkedHashMap<String, Object>();
        properties.put("code", field);
        Map<String, Object> additions = new LinkedHashMap<String, Object>();
        additions.put("properties", properties);
        List<MappingConflict> conflicts = new ArrayList<MappingConflict>();
        conflicts.add(new MappingConflict("properties.code", "text", "keyword", "TYPE_CONFLICT"));
        List<String> unchanged = new ArrayList<String>(Collections.singletonList("properties.same"));
        List<String> ignored = new ArrayList<String>(Collections.singletonList("properties.legacy"));

        MappingDelta delta = new MappingDelta(additions, conflicts, unchanged, ignored, false);
        field.put("type", "long");
        copyTo.clear();
        properties.clear();
        additions.clear();
        conflicts.clear();
        unchanged.clear();
        ignored.clear();

        assertThat(delta.getAdditions()).containsKey("properties");
        assertThat(delta.getConflicts()).hasSize(1);
        assertThat(delta.getUnchanged()).containsExactly("properties.same");
        assertThat(delta.getIgnored()).containsExactly("properties.legacy");
        assertThatThrownBy(() -> delta.getAdditions().put("properties", Collections.emptyMap()))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> ((Map<String, Object>) delta.getAdditions().get("properties")).clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> ((List<Object>) ((Map<String, Object>) ((Map<String, Object>) delta
                .getAdditions().get("properties")).get("code")).get("copy_to")).clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> delta.getConflicts().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> delta.getUnchanged().add("properties.other"))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> delta.getIgnored().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    private static void assertTypeConflict(String actualType, String desiredType) {
        String desired = mappingWithValue("{\"type\":\"" + desiredType + "\"}");
        String actual = mappingWithValue("{\"type\":\"" + actualType + "\"}");

        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.getConflicts()).hasSize(1);
        MappingConflict conflict = delta.getConflicts().get(0);
        assertThat(conflict.getPath()).isEqualTo("properties.value");
        assertThat(conflict.getActualSummary()).isEqualTo(actualType);
        assertThat(conflict.getDesiredSummary()).isEqualTo(desiredType);
        assertThat(conflict.getCode()).isEqualTo("TYPE_CONFLICT");
        assertThat(delta.getAdditions()).isEmpty();
    }

    private static MappingConflict singleParameterConflict(String desiredDefinition, String actualDefinition) {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                mappingWithValue(desiredDefinition), mappingWithValue(actualDefinition));

        assertThat(delta.getConflicts()).hasSize(1);
        assertThat(delta.getConflicts().get(0).getCode()).isEqualTo("PARAMETER_CONFLICT");
        assertThat(delta.getAdditions()).isEmpty();
        return delta.getConflicts().get(0);
    }

    private static void assertSingleParameterConflict(String parameter,
                                                      String desiredDefinition,
                                                      String actualDefinition) {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                mappingWithValue(desiredDefinition), mappingWithValue(actualDefinition));

        assertThat(delta.getConflicts()).as(parameter).hasSize(1);
        MappingConflict conflict = delta.getConflicts().get(0);
        assertThat(conflict.getPath()).as(parameter).isEqualTo("properties.value." + parameter);
        assertThat(conflict.getCode()).as(parameter).isEqualTo("PARAMETER_CONFLICT");
        assertThat(delta.getAdditions()).as(parameter).isEmpty();
    }

    private static void assertNoFieldConflict(String parameter,
                                              String desiredDefinition,
                                              String actualDefinition) {
        MappingDelta delta = MappingDeltaCalculator.calculate(
                mappingWithValue(desiredDefinition), mappingWithValue(actualDefinition));

        assertThat(delta.isUnparsed()).as(parameter).isFalse();
        assertThat(delta.getConflicts()).as(parameter).isEmpty();
        assertThat(delta.getAdditions()).as(parameter).isEmpty();
        assertThat(delta.getUnchanged()).as(parameter).containsExactly("properties.value");
    }

    private static void assertParameterUnparsedBothDirections(String parameter, String invalidValue) {
        String invalidDefinition = parameterDefinition(parameter, invalidValue);
        String validDefinition = baseDefinition(parameter);
        if ("enabled".equals(parameter)) {
            validDefinition = "{\"type\":\"object\"}";
        }
        assertUnparsed(mappingWithValue(invalidDefinition), mappingWithValue(validDefinition));
        assertUnparsed(mappingWithValue(validDefinition), mappingWithValue(invalidDefinition));
    }

    private static void assertRootDynamicConflict(MappingDelta delta,
                                                  String actualSummary,
                                                  String desiredSummary) {
        assertThat(delta.getConflicts()).hasSize(1);
        MappingConflict conflict = delta.getConflicts().get(0);
        assertThat(conflict.getPath()).isEqualTo("dynamic");
        assertThat(conflict.getCode()).isEqualTo("PARAMETER_CONFLICT");
        assertThat(conflict.getActualSummary()).isEqualTo(actualSummary);
        assertThat(conflict.getDesiredSummary()).isEqualTo(desiredSummary);
        assertThat(delta.getAdditions()).doesNotContainKey("dynamic");
    }

    private static void assertRootDynamicConverged(MappingDelta delta) {
        assertThat(delta.isUnparsed()).isFalse();
        assertThat(delta.getConflicts()).isEmpty();
        assertThat(delta.getAdditions()).doesNotContainKey("dynamic");
        assertThat(delta.getUnchanged()).containsExactly("dynamic");
    }

    private static String mappingWithValue(String definition) {
        return "{\"properties\":{\"value\":" + definition + "}}";
    }

    private static String parameterDefinition(String parameter, String value) {
        String base = baseDefinition(parameter);
        return base.substring(0, base.length() - 1) + ",\"" + parameter + "\":" + value + "}";
    }

    private static String baseDefinition(String parameter) {
        if ("dynamic".equals(parameter) || "enabled".equals(parameter)) {
            return "{\"properties\":{}}";
        }
        if ("analyzer".equals(parameter) || "search_analyzer".equals(parameter)) {
            return "{\"type\":\"text\"}";
        }
        if ("format".equals(parameter)) {
            return "{\"type\":\"date\"}";
        }
        return "{\"type\":\"keyword\"}";
    }

    private static String desiredParameterValue(String parameter) {
        if ("index".equals(parameter) || "doc_values".equals(parameter)) {
            return "false";
        }
        if ("store".equals(parameter)) {
            return "true";
        }
        if ("ignore_above".equals(parameter)) {
            return "256";
        }
        if ("dynamic".equals(parameter)) {
            return "\"strict\"";
        }
        return "\"desired_" + parameter + "\"";
    }

    private static String actualParameterValue(String parameter) {
        if ("index".equals(parameter) || "doc_values".equals(parameter)) {
            return "true";
        }
        if ("store".equals(parameter)) {
            return "false";
        }
        if ("ignore_above".equals(parameter)) {
            return "128";
        }
        if ("dynamic".equals(parameter)) {
            return "true";
        }
        return "\"actual_" + parameter + "\"";
    }

    private static void assertUnparsed(String desired, String actual) {
        MappingDelta delta = MappingDeltaCalculator.calculate(desired, actual);

        assertThat(delta.isUnparsed()).isTrue();
        assertThat(delta.getAdditions()).isEmpty();
        assertThat(delta.getConflicts()).isEmpty();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> topLevelField(MappingDelta delta, String name) {
        Map<String, Object> properties = (Map<String, Object>) delta.getAdditions().get("properties");
        return (Map<String, Object>) properties.get(name);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> fieldDefinition(MappingDelta delta, String parent, String child) {
        Map<String, Object> parentDefinition = topLevelField(delta, parent);
        Map<String, Object> properties = (Map<String, Object>) parentDefinition.get("properties");
        return (Map<String, Object>) properties.get(child);
    }

}
