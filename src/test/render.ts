/**
 * All text in the tree a Server Component returned, without rendering it.
 * Enough to see which of its answers a page gave. Client components in the
 * tree are not rendered here, so their own text does not show up.
 */
export function renderedText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(renderedText).join(" ");
  }

  if (node && typeof node === "object" && "props" in node) {
    return renderedText((node as { props: { children?: unknown } }).props.children);
  }

  return "";
}
