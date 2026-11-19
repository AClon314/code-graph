// @ts-check

/**
 * Node context shared by the web/VS Code HTML renderer and the Fresh text
 * renderer. Values are JSON-safe; do not rely on DOM globals.
 *
 * @typedef {Object} NodeRenderNode
 * @property {string} id
 * @property {string} [symbolId]
 * @property {string} name
 * @property {string} label
 * @property {string} qualifiedName
 * @property {string} shortName
 * @property {string} [filePath]
 * @property {string} fileTail
 * @property {number} [startLine]
 * @property {number} [startColumn]
 * @property {number} [endLine]
 * @property {string} [docstring]
 * @property {boolean} [isEntry]
 * @property {boolean} [isTest]
 * @property {boolean} [isExported]
 */

/**
 * @typedef {Object} NodeRenderContext
 * @property {NodeRenderNode} node
 * @property {{root: string, project: string, nodeCount: number, edgeCount: number}} graph
 * @property {string} project
 */

const ESCAPES = /** @type {Record<string, string>} */ ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/**
 * HTML renderer used by the browser and VS Code webview.
 * @param {NodeRenderContext} context
 * @returns {string}
 */
export function renderNodeHtml({ node }) {
  return (
    '<div class="node-card">' +
    '<span class="node-card-kind">' + escapeHtml(node.label) + '</span>' +
    '<strong class="node-card-name">' + escapeHtml(node.name) + '</strong>' +
    '<span class="node-card-path">' + escapeHtml(node.shortName) + '</span>' +
    '</div>'
  );
}

/**
 * Plain-text renderer used by the Fresh/TUI frame.
 * @param {NodeRenderContext} context
 * @returns {string}
 */
export function renderNodeText({ node }) {
  return node.name + "\n" + (node.filePath ?? node.shortName) + ":" + (node.startLine ?? 1);
}
