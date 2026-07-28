export function normalizeRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function isSafeRepositoryPath(path: string): boolean {
  const normalized = normalizeRepositoryPath(path);
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !normalized.includes("\0") &&
    !normalized
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  );
}
