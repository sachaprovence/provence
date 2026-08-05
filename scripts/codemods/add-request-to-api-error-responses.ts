import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Codemod ponctuel (v1.3, AR-0173) — propage l'objet `Request` jusqu'à
 * chaque appel de `toApiErrorResponse(error, ctx)` dans `src/app/api/**\/
 * route.ts`, pour correspondre à la nouvelle signature
 * `toApiErrorResponse(error, request, ctx)` (voir `src/lib/errors.ts`, qui
 * en dérive désormais `requestId` automatiquement).
 *
 * Exécuté UNE FOIS (voir commit associé), conservé dans le dépôt comme
 * preuve de la méthode utilisée pour ce retrofit à grande échelle (~160
 * sites d'appel) plutôt que 160 modifications manuelles sujettes à erreur.
 * `--check` : liste les fichiers qui seraient modifiés sans les écrire.
 */

const API_ROOT = path.join(process.cwd(), "src", "app", "api");
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function listRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listRouteFiles(full));
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

function isToApiErrorResponseCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "toApiErrorResponse" &&
    node.arguments.length === 2
  );
}

function findCalls(node: ts.Node, out: ts.CallExpression[]): void {
  if (isToApiErrorResponseCall(node)) out.push(node);
  ts.forEachChild(node, (child) => findCalls(child, out));
}

function processFile(filePath: string, sourceText: string, apply: boolean): { changed: boolean; issues: string[] } {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits: Edit[] = [];
  const issues: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    if (!HTTP_METHODS.has(statement.name.text)) continue;
    const hasExport = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!hasExport) continue;

    const calls: ts.CallExpression[] = [];
    findCalls(statement.body, calls);
    if (calls.length === 0) continue;

    const params = statement.parameters;
    const firstParam = params[0];
    let requestParamOk = false;

    if (!firstParam) {
      // Aucun paramètre du tout — en insérer un nouveau juste après le "(" ouvrant.
      const openParen = sourceText.indexOf("(", statement.name.end);
      edits.push({ start: openParen + 1, end: openParen + 1, replacement: "request: Request" });
      requestParamOk = true;
    } else if (ts.isIdentifier(firstParam.name)) {
      const name = firstParam.name.text;
      if (name === "request") {
        requestParamOk = true;
      } else if (name === "_request") {
        edits.push({ start: firstParam.name.getStart(sourceFile), end: firstParam.name.getEnd(), replacement: "request" });
        requestParamOk = true;
      } else {
        issues.push(`${filePath}: ${statement.name.text} — premier paramètre inattendu "${name}", ignoré (revue manuelle requise).`);
      }
    } else {
      issues.push(`${filePath}: ${statement.name.text} — premier paramètre non identifiant (déstructuré ?), ignoré (revue manuelle requise).`);
    }

    if (!requestParamOk) continue;

    for (const call of calls) {
      const firstArg = call.arguments[0];
      const secondArg = call.arguments[1];
      edits.push({ start: firstArg.getEnd(), end: secondArg.getStart(), replacement: ", request, " });
    }
  }

  if (edits.length === 0) return { changed: false, issues };

  edits.sort((a, b) => b.start - a.start);
  let output = sourceText;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
  }

  if (apply) fs.writeFileSync(filePath, output);
  return { changed: true, issues };
}

function main() {
  const apply = !process.argv.includes("--check");
  const files = listRouteFiles(API_ROOT);
  let changedCount = 0;
  const allIssues: string[] = [];

  for (const file of files) {
    const sourceText = fs.readFileSync(file, "utf8");
    const { changed, issues } = processFile(file, sourceText, apply);
    if (changed) changedCount++;
    allIssues.push(...issues);
  }

  console.log(`${apply ? "Modifiés" : "À modifier"} : ${changedCount} / ${files.length} fichiers route.ts`);
  if (allIssues.length > 0) {
    console.log("\nProblèmes nécessitant une revue manuelle :");
    for (const issue of allIssues) console.log(`  - ${issue}`);
  }
}

main();
