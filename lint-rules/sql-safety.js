// Oxlint JS plugin: SQL injection guardrails. Loaded via `jsPlugins` in
// .oxlintrc.json.
//
// `sql.raw()` splices its argument into the query text unescaped. Any value
// that is not a fixed string is an injection hole. Use the `sql` tagged
// template (`sql\`... ${value}\``), which binds values as parameters, or the
// drizzle operators (`like`, `eq`, `or`, ...).
import { definePlugin, defineRule } from "@oxlint/plugins";

const DRIZZLE_SQL_SOURCES = new Set(["drizzle-orm", "drizzle-orm/sql"]);

function isStaticString(node) {
  if (!node) return false;
  if (node.type === "Literal") return typeof node.value === "string";
  if (node.type === "TemplateLiteral") return node.expressions.length === 0;
  return false;
}

function isRawProperty(node) {
  if (node.computed) {
    return node.property.type === "Literal" && node.property.value === "raw";
  }
  return node.property.type === "Identifier" && node.property.name === "raw";
}

const noDynamicSqlRaw = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow sql.raw() only with a fixed string; dynamic text is SQL injection.",
    },
    messages: {
      dynamic:
        "sql.raw() with a dynamic value is SQL injection. Use the sql`` tagged template (it binds ${values} as parameters) or drizzle operators like like()/eq().",
      escaped:
        "sql.raw must be called directly with a fixed string; passing it around hides what it receives.",
    },
  },
  create(context) {
    const sqlNames = new Set();
    return {
      ImportDeclaration(node) {
        if (!DRIZZLE_SQL_SOURCES.has(node.source.value)) return;
        for (const spec of node.specifiers) {
          const imported =
            spec.type === "ImportSpecifier"
              ? (spec.imported.name ?? spec.imported.value)
              : null;
          if (imported === "sql") sqlNames.add(spec.local.name);
        }
      },
      MemberExpression(node) {
        if (node.object.type !== "Identifier") return;
        if (!sqlNames.has(node.object.name)) return;
        if (!isRawProperty(node)) return;
        const parent = node.parent;
        const isCallee =
          parent && parent.type === "CallExpression" && parent.callee === node;
        if (!isCallee) {
          context.report({ node, messageId: "escaped" });
          return;
        }
        const [arg] = parent.arguments;
        if (parent.arguments.length !== 1 || !isStaticString(arg)) {
          context.report({ node: parent, messageId: "dynamic" });
        }
      },
    };
  },
});

// oxlint-disable-next-line import/no-default-export -- plugin entry point
export default definePlugin({
  meta: { name: "sql-safety" },
  rules: { "no-dynamic-sql-raw": noDynamicSqlRaw },
});
