// Prints "resolved" when this project can import the specifier in argv[2], else "unresolved".

const specifier = process.argv[2] ?? "";
try {
  import.meta.resolve(specifier);
  console.log("resolved");
} catch {
  console.log("unresolved");
}
