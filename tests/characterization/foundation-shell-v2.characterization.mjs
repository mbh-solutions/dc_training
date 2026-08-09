const write = process.stdout.write.bind(process.stdout);
let captured = "";

process.stdout.write = (chunk) => {
  captured += String(chunk);
  return true;
};

try {
  await import("./foundation-shell.characterization.mjs");
} finally {
  process.stdout.write = write;
}

const result = JSON.parse(captured);
result.scenario = "foundation-shell-v2";
write(JSON.stringify(result));
