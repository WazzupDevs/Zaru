import { promises as fs } from "node:fs";
import * as path from "node:path";

import { Injectable } from "@nestjs/common";

import {
  TemplateVariableMissingError,
  UnknownTemplateError,
} from "../../domain/errors/notification-errors";

import type { TemplateRendererPort } from "../../application/ports/template-renderer.port";

/**
 * File-backed template renderer. Templates live next to this file under
 * `./tr/<key>.txt`; nest-cli `assets` copies the .txt files to the dist
 * folder so production builds find them at the same relative path.
 *
 * Substitution is `{{variable}}` only — no logic, no partials. If a
 * placeholder is unmatched we throw rather than render the literal
 * (catches missing variables in code review).
 *
 * Templates are cached after first read; the cache key includes locale
 * so future en/tr/de variants don't collide.
 */
@Injectable()
export class TemplateRenderer implements TemplateRendererPort {
  private readonly cache = new Map<string, string>();
  private readonly templatesDir = path.join(__dirname);

  async render(
    templateKey: string,
    locale: string,
    variables: Record<string, string | number>,
  ): Promise<string> {
    const cacheKey = `${locale}:${templateKey}`;
    let template = this.cache.get(cacheKey);

    if (template === undefined) {
      const filePath = path.join(this.templatesDir, locale, `${templateKey}.txt`);
      try {
        template = await fs.readFile(filePath, "utf-8");
      } catch {
        throw new UnknownTemplateError(templateKey, locale);
      }
      this.cache.set(cacheKey, template);
    }

    const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in variables)) {
        throw new TemplateVariableMissingError(templateKey, key);
      }
      return String(variables[key]);
    });

    return rendered.trim();
  }

  /** Test helper — clears the in-memory cache so a spec can swap files. */
  clearCache(): void {
    this.cache.clear();
  }
}
