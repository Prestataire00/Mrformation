/**
 * Convert plain text template content to HTML.
 * Used for lazy migration of existing templates when opened in the rich text editor.
 */
export function plainTextToHtml(text: string): string {
  if (!text) return "";

  // Already HTML - return as-is
  const trimmed = text.trim();
  if (trimmed.startsWith("<") && (trimmed.startsWith("<p") || trimmed.startsWith("<h") || trimmed.startsWith("<div") || trimmed.startsWith("<ul") || trimmed.startsWith("<ol") || trimmed.startsWith("<table"))) {
    return text;
  }

  // Convert plain text paragraphs (double newlines) to <p> tags
  // and single newlines to <br />
  return text
    .split(/\n\n+/)
    .map((paragraph) => {
      const html = paragraph
        .replace(/\n/g, "<br />")
        // Preserve {{variable}} syntax as variable chips
        .replace(
          /\{\{([^}]+)\}\}/g,
          '<span data-variable="$1">{{$1}}</span>'
        );
      return `<p>${html}</p>`;
    })
    .join("");
}

/**
 * Detect if content is HTML or plain text.
 */
export function isHtmlContent(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  return trimmed.startsWith("<") && trimmed.includes(">");
}
