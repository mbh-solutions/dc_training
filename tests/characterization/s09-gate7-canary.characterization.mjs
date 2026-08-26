process.stdout.write(
  JSON.stringify({
    behavior: {
      quality_canary: "s09-gate7-quality",
    },
    scenario: "s09-gate7-canary",
    schema_version: "1.0",
  }),
);
