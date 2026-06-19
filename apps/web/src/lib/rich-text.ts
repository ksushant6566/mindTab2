const allowedTags = new Set([
  "A",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "EM",
  "H1",
  "H2",
  "H3",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SPAN",
  "STRIKE",
  "STRONG",
  "UL",
]);

const allowedClasses = new Set(["mention"]);

const entityMap: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
};

export function looksLikeHtml(value?: string | null) {
  return !!value && /<\/?[a-z][\s\S]*>/i.test(value);
}

export function plainTextToHtml(value?: string | null) {
  if (!value) return "";

  return value
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function normalizeRichTextInput(value?: string | null) {
  if (!value) return "";
  return looksLikeHtml(value) ? value : plainTextToHtml(value);
}

export function sanitizeRichText(value?: string | null) {
  const html = normalizeRichTextInput(value);
  if (!html) return "";

  if (typeof DOMParser === "undefined") {
    return stripDisallowedHtml(html);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}

export function richTextToPlainText(value?: string | null) {
  const html = normalizeRichTextInput(value);
  if (!html) return "";

  if (typeof DOMParser !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return normalizeText(doc.body.textContent ?? "");
  }

  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => entityMap[entity] ?? " ")
  );
}

export function isRichTextEmpty(value?: string | null) {
  return richTextToPlainText(value).length === 0;
}

function sanitizeNode(node: Node) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = child as HTMLElement;
    sanitizeNode(element);

    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    sanitizeAttributes(element);
  });
}

function sanitizeAttributes(element: HTMLElement) {
  let safeHref: string | null = null;

  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    if (name === "class") {
      const classes = value.split(/\s+/).filter((className) => allowedClasses.has(className));
      if (classes.length) {
        element.setAttribute("class", classes.join(" "));
      } else {
        element.removeAttribute(attribute.name);
      }
      return;
    }

    if (element.tagName === "A" && name === "href" && isSafeHref(value)) {
      safeHref = value;
      return;
    }

    if (
      element.classList.contains("mention") &&
      ["data-id", "data-label", "data-type"].includes(name)
    ) {
      return;
    }

    element.removeAttribute(attribute.name);
  });

  if (element.tagName === "A" && safeHref) {
    element.setAttribute("href", safeHref);
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
  }
}

function isSafeHref(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function stripDisallowedHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
