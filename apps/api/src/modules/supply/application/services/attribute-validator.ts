import { z, type ZodTypeAny } from "zod";

import type { AttributeScope } from "@event-fleet/shared-types";

import { InvalidAttributesError } from "../../domain/errors/invalid-attributes.error";

import type { AttributeDefinitionRecord } from "../../../catalog/application/ports/service-category.repository.port";

interface NumberValidationRules {
  min?: number;
  max?: number;
}

/**
 * Builds a Zod schema from CategoryAttributeDefinition rows and validates a
 * payload. Strict — extra keys are rejected so a typo doesn't silently land
 * in the JSONB blob.
 */
export class AttributeValidator {
  validate(
    definitions: AttributeDefinitionRecord[],
    scope: AttributeScope,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const scoped = definitions.filter((d) => d.scope === scope);
    const shape: Record<string, ZodTypeAny> = {};
    for (const def of scoped) {
      let schema: ZodTypeAny = this.baseSchemaFor(def);
      if (!def.isRequired) schema = schema.optional();
      shape[def.key] = schema;
    }
    const validator = z.object(shape).strict();
    const result = validator.safeParse(payload);
    if (!result.success) throw new InvalidAttributesError(result.error.issues);
    return result.data;
  }

  private baseSchemaFor(def: AttributeDefinitionRecord): ZodTypeAny {
    switch (def.dataType) {
      case "STRING":
        return z.string();
      case "NUMBER": {
        const rules = (def.validationRules ?? {}) as NumberValidationRules;
        let s = z.number();
        if (typeof rules.min === "number") s = s.min(rules.min);
        if (typeof rules.max === "number") s = s.max(rules.max);
        return s;
      }
      case "BOOLEAN":
        return z.boolean();
      case "ENUM": {
        const opts = def.enumOptions ?? [];
        if (opts.length === 0) return z.string();
        return z.enum(opts as [string, ...string[]]);
      }
      case "DATE":
        return z.string().regex(/^\d{4}-\d{2}-\d{2}/, "must be ISO date string");
    }
  }
}
