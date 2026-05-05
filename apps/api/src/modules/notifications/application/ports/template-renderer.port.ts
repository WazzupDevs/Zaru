export const TEMPLATE_RENDERER_PORT = Symbol("TEMPLATE_RENDERER_PORT");

export interface TemplateRendererPort {
  /**
   * Loads `templates/<locale>/<templateKey>.txt`, substitutes
   * `{{variable}}` placeholders, returns the rendered text.
   *
   * Throws:
   *   - UnknownTemplateError when the file is missing
   *   - TemplateVariableMissingError when the template references
   *     a variable not provided in `variables`
   */
  render(
    templateKey: string,
    locale: string,
    variables: Record<string, string | number>,
  ): Promise<string>;
}
