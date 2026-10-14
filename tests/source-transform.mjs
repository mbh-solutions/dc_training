import ts from "typescript";
// Emit source maps so the coverage collector can bind executed JavaScript back
// to TypeScript and JSX. Run coverage with Node's --enable-source-maps flag.
export function transpileForCoverage(source, fileName) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      inlineSourceMap: true,
      inlineSources: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}
