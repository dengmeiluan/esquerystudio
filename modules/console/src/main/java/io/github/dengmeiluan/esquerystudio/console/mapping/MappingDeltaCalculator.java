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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;

public final class MappingDeltaCalculator {

    private static final Logger LOG = LoggerFactory.getLogger(MappingDeltaCalculator.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** mapping 解析失败 WARN 节流间隔（同 key 节流防刷屏；endpoint 臂同款范式）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    /** 解析失败节流 WARN 计数（首败留痕；静态方法配静态计数）。 */
    private static final AtomicLong lastParseWarnAt = new AtomicLong(0);

    private static final List<String> MAPPING_PARAMETERS = Arrays.asList(
            "analyzer", "search_analyzer", "normalizer", "format", "index",
            "doc_values", "store", "ignore_above", "dynamic", "enabled");
    private static final Object INVALID_VALUE = new Object();

    private MappingDeltaCalculator() {
    }

    public static MappingDelta calculate(String desiredJson, String actualJson) {
        JsonNode desired = parse(desiredJson, true);
        JsonNode actual = parse(actualJson, false);
        if (desired == null || actual == null) {
            return MappingDelta.unparsed();
        }

        Map<String, Object> additions = new LinkedHashMap<String, Object>();
        List<MappingConflict> conflicts = new ArrayList<MappingConflict>();
        List<String> unchanged = new ArrayList<String>();
        List<String> ignored = new ArrayList<String>();

        Map<String, Object> propertyAdditions = new LinkedHashMap<String, Object>();
        compareProperties(desired.get("properties"), actual.get("properties"), "properties",
                propertyAdditions, conflicts, unchanged, ignored);
        if (!propertyAdditions.isEmpty()) {
            additions.put("properties", propertyAdditions);
        }

        compareRootDynamic(desired, actual, conflicts, unchanged, ignored);
        compareDynamicTemplates(desired, actual, conflicts, unchanged, ignored);
        return new MappingDelta(additions, conflicts, unchanged, ignored, false);
    }

    private static JsonNode parse(String json, boolean requireDesiredShape) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        try {
            JsonNode root = MAPPER.readTree(json);
            if (root == null || !root.isObject()) {
                return null;
            }
            root = unwrapType(root);
            boolean hasProperties = root.has("properties");
            boolean hasDynamicTemplates = root.has("dynamic_templates");
            boolean supportedDynamicOnlyActual = !requireDesiredShape
                    && root.size() == 1 && root.has("dynamic");
            if (!hasProperties && !hasDynamicTemplates
                    && (requireDesiredShape || (root.size() > 0 && !supportedDynamicOnlyActual))) {
                return null;
            }
            if (hasProperties && !validProperties(root.get("properties"))) {
                return null;
            }
            if (hasDynamicTemplates && !validDynamicTemplates(root.get("dynamic_templates"))) {
                return null;
            }
            if (root.has("dynamic") && !validMappingParameter("dynamic", root.get("dynamic"))) {
                return null;
            }
            return root;
        } catch (Exception e) {
            // 解析失败=delta 记 unparsed=漂移检测静默隐形（期望/实际有一侧坏 JSON，
            // 对比结果直接消失且零痕）——补节流 WARN；unparsed 返回契约不变
            long now = System.currentTimeMillis();
            long last = lastParseWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastParseWarnAt.compareAndSet(last, now)) {
                LOG.warn("[MappingDeltaCalculator] mapping JSON 解析失败（delta 记 unparsed，{}s 内不再重复告警）：{}: {}",
                        WARN_THROTTLE_MS / 1000, e.getClass().getSimpleName(), e.getMessage(), e);
            }
            return null;
        }
    }

    private static JsonNode unwrapType(JsonNode root) {
        if (root.has("properties") || root.has("dynamic_templates") || root.has("dynamic")
                || root.size() != 1) {
            return root;
        }
        JsonNode candidate = root.elements().next();
        if (candidate.isObject() && (candidate.has("properties")
                || candidate.has("dynamic_templates") || candidate.has("dynamic"))) {
            return candidate;
        }
        return root;
    }

    private static boolean validProperties(JsonNode properties) {
        if (properties == null || !properties.isObject()) {
            return false;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = properties.fields();
        while (fields.hasNext()) {
            JsonNode definition = fields.next().getValue();
            if (!definition.isObject()) {
                return false;
            }
            JsonNode type = definition.get("type");
            if (type != null && (!type.isTextual() || type.textValue().trim().isEmpty())) {
                return false;
            }
            boolean enabledOnlyObject = type == null && !definition.has("properties")
                    && definition.size() == 1 && definition.has("enabled");
            if (type == null && !definition.has("properties") && !enabledOnlyObject) {
                return false;
            }
            if (definition.has("properties") && !validProperties(definition.get("properties"))) {
                return false;
            }
            String effectiveType = effectiveType(definition);
            boolean effectiveObject = "object".equals(effectiveType) || "nested".equals(effectiveType);
            if ((definition.has("enabled") || definition.has("dynamic")) && !effectiveObject) {
                return false;
            }
            for (String parameter : MAPPING_PARAMETERS) {
                if (definition.has(parameter)
                        && !validMappingParameter(parameter, definition.get(parameter))) {
                    return false;
                }
            }
        }
        return true;
    }

    private static boolean validDynamicTemplates(JsonNode templates) {
        if (!templates.isArray()) {
            return false;
        }
        for (JsonNode template : templates) {
            if (!template.isObject() || template.size() == 0) {
                return false;
            }
        }
        return true;
    }

    private static boolean validMappingParameter(String parameter, JsonNode value) {
        return canonicalParameterValue(parameter, value) != INVALID_VALUE;
    }

    private static Object canonicalParameterValue(String parameter, JsonNode value) {
        if (value == null || value.isNull()) {
            return INVALID_VALUE;
        }
        if ("index".equals(parameter) || "doc_values".equals(parameter)
                || "store".equals(parameter) || "enabled".equals(parameter)) {
            return canonicalBoolean(value);
        }
        if ("dynamic".equals(parameter)) {
            Object bool = canonicalBoolean(value);
            if (bool != INVALID_VALUE) {
                return bool;
            }
            return value.isTextual() && "strict".equalsIgnoreCase(value.textValue())
                    ? "strict" : INVALID_VALUE;
        }
        if ("ignore_above".equals(parameter)) {
            return canonicalNonNegativeInteger(value);
        }
        return value.isTextual() && !value.textValue().trim().isEmpty()
                ? value.textValue() : INVALID_VALUE;
    }

    private static Object canonicalBoolean(JsonNode value) {
        if (value.isBoolean()) {
            return value.booleanValue();
        }
        if (value.isTextual() && "true".equals(value.textValue())) {
            return Boolean.TRUE;
        }
        if (value.isTextual() && "false".equals(value.textValue())) {
            return Boolean.FALSE;
        }
        return INVALID_VALUE;
    }

    private static Object canonicalNonNegativeInteger(JsonNode value) {
        if (value.isIntegralNumber()) {
            return value.canConvertToInt() && value.intValue() >= 0
                    ? value.intValue() : INVALID_VALUE;
        }
        if (!value.isTextual()) {
            return INVALID_VALUE;
        }
        try {
            int parsed = Integer.parseInt(value.textValue());
            return parsed >= 0 ? parsed : INVALID_VALUE;
        } catch (NumberFormatException e) {
            return INVALID_VALUE;
        }
    }

    private static void compareProperties(JsonNode desiredProperties,
                                          JsonNode actualProperties,
                                          String parentPath,
                                          Map<String, Object> additions,
                                          List<MappingConflict> conflicts,
                                          List<String> unchanged,
                                          List<String> ignored) {
        if (desiredProperties != null) {
            Iterator<Map.Entry<String, JsonNode>> desiredFields = desiredProperties.fields();
            while (desiredFields.hasNext()) {
                Map.Entry<String, JsonNode> desiredField = desiredFields.next();
                String name = desiredField.getKey();
                String path = parentPath + "." + name;
                JsonNode desiredDefinition = desiredField.getValue();
                JsonNode actualDefinition = actualProperties == null ? null : actualProperties.get(name);

                if (actualDefinition == null) {
                    additions.put(name, toObject(desiredDefinition));
                    continue;
                }

                String desiredType = effectiveType(desiredDefinition);
                String actualType = effectiveType(actualDefinition);
                if (!Objects.equals(desiredType, actualType)) {
                    conflicts.add(new MappingConflict(path, typeSummary(actualType),
                            typeSummary(desiredType), "TYPE_CONFLICT"));
                    continue;
                }

                unchanged.add(path);
                compareParameters(desiredDefinition, actualDefinition, path, conflicts);

                Map<String, Object> childAdditions = new LinkedHashMap<String, Object>();
                compareProperties(desiredDefinition.get("properties"), actualDefinition.get("properties"),
                        path + ".properties", childAdditions, conflicts, unchanged, ignored);
                if (!childAdditions.isEmpty()) {
                    Map<String, Object> parentAddition = new LinkedHashMap<String, Object>();
                    if (desiredDefinition.has("type")) {
                        parentAddition.put("type", desiredDefinition.get("type").textValue());
                    }
                    if (desiredDefinition.has("enabled") && actualDefinition.has("enabled")
                            && Objects.equals(canonicalParameterValue("enabled", desiredDefinition.get("enabled")),
                            canonicalParameterValue("enabled", actualDefinition.get("enabled")))) {
                        parentAddition.put("enabled", toObject(desiredDefinition.get("enabled")));
                    }
                    parentAddition.put("properties", childAdditions);
                    additions.put(name, parentAddition);
                }
            }
        }

        if (actualProperties != null) {
            Iterator<String> actualNames = actualProperties.fieldNames();
            while (actualNames.hasNext()) {
                String name = actualNames.next();
                if (desiredProperties == null || !desiredProperties.has(name)) {
                    ignored.add(parentPath + "." + name);
                }
            }
        }
    }

    private static void compareParameters(JsonNode desiredDefinition,
                                          JsonNode actualDefinition,
                                          String fieldPath,
                                          List<MappingConflict> conflicts) {
        for (String parameter : MAPPING_PARAMETERS) {
            if (!desiredDefinition.has(parameter)) {
                continue;
            }
            JsonNode desiredValue = desiredDefinition.get(parameter);
            JsonNode actualValue = actualDefinition.get(parameter);
            Object desiredCanonical = canonicalParameterValue(parameter, desiredValue);
            Object actualCanonical = actualValue == null
                    ? INVALID_VALUE : canonicalParameterValue(parameter, actualValue);
            if (!Objects.equals(desiredCanonical, actualCanonical)) {
                conflicts.add(new MappingConflict(fieldPath + "." + parameter,
                        valueSummary(actualValue), valueSummary(desiredValue), "PARAMETER_CONFLICT"));
            }
        }
    }

    private static void compareRootDynamic(JsonNode desired,
                                           JsonNode actual,
                                           List<MappingConflict> conflicts,
                                           List<String> unchanged,
                                           List<String> ignored) {
        JsonNode desiredDynamic = desired.get("dynamic");
        JsonNode actualDynamic = actual.get("dynamic");
        if (desiredDynamic == null && actualDynamic != null) {
            ignored.add("dynamic");
        } else if (desiredDynamic != null) {
            Object desiredCanonical = canonicalParameterValue("dynamic", desiredDynamic);
            Object actualCanonical = actualDynamic == null
                    ? INVALID_VALUE : canonicalParameterValue("dynamic", actualDynamic);
            if (Objects.equals(desiredCanonical, actualCanonical)) {
                unchanged.add("dynamic");
            } else {
                conflicts.add(new MappingConflict("dynamic", valueSummary(actualDynamic),
                        valueSummary(desiredDynamic), "PARAMETER_CONFLICT"));
            }
        }
    }

    private static void compareDynamicTemplates(JsonNode desired,
                                                JsonNode actual,
                                                List<MappingConflict> conflicts,
                                                List<String> unchanged,
                                                List<String> ignored) {
        JsonNode desiredTemplates = desired.get("dynamic_templates");
        JsonNode actualTemplates = actual.get("dynamic_templates");
        if (desiredTemplates != null && actualTemplates == null) {
            conflicts.add(new MappingConflict("dynamic_templates", "<missing>",
                    valueSummary(desiredTemplates), "DYNAMIC_TEMPLATE_CONFLICT"));
        } else if (desiredTemplates != null && desiredTemplates.equals(actualTemplates)) {
            unchanged.add("dynamic_templates");
        } else if (desiredTemplates != null) {
            conflicts.add(new MappingConflict("dynamic_templates", valueSummary(actualTemplates),
                    valueSummary(desiredTemplates), "DYNAMIC_TEMPLATE_CONFLICT"));
        } else if (actualTemplates != null) {
            ignored.add("dynamic_templates");
        }
    }

    private static String effectiveType(JsonNode definition) {
        JsonNode type = definition.get("type");
        if (type != null) {
            return type.textValue();
        }
        return definition.has("properties") || definition.has("enabled") ? "object" : null;
    }

    private static String typeSummary(String type) {
        return type == null ? "<unspecified>" : type;
    }

    private static String valueSummary(JsonNode value) {
        if (value == null) {
            return "<missing>";
        }
        return value.isValueNode() ? value.asText() : value.toString();
    }

    private static Object toObject(JsonNode value) {
        return MAPPER.convertValue(value, Object.class);
    }
}
