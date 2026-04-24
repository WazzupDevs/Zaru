import { SlugSchema } from "@event-fleet/shared-types";

import { InvalidSlugError } from "../errors/invalid-slug.error";

/**
 * Lowercase kebab-case slug. Used for URL path segments
 * (`/catalog/categories/wedding-car`).
 */
export class SlugVO {
  private constructor(readonly value: string) {}

  static create(raw: string): SlugVO {
    const result = SlugSchema.safeParse(raw);
    if (!result.success) {
      throw new InvalidSlugError(`Invalid slug: ${raw}`, { issues: result.error.issues });
    }
    return new SlugVO(result.data);
  }

  toString(): string {
    return this.value;
  }
}
