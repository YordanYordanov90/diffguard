import {
  evaluationManifestSchema,
  recordedEvaluationResultsSchema,
  type EvaluationManifest,
  type RecordedEvaluationResults,
} from "./schema";

const PRIVATE_SOURCE_MARKERS = [
  /private\s+(?:repo|repository|source)/i,
  /<private-[^>]*>/i,
  /(?:ghp_|github_pat_|sk-[a-z0-9])/i,
  /BEGIN\s+(?:RSA|OPENSSH|PRIVATE)\s+KEY/i,
  /(?:^|[\\/])(?:Users|home)[\\/]/i,
];

function containsPrivateMarker(value: string): boolean {
  return PRIVATE_SOURCE_MARKERS.some((marker) => marker.test(value));
}

export function parseEvaluationManifest(
  input: unknown,
  expectedFixtureCount = 29,
): EvaluationManifest {
  const parsed = evaluationManifestSchema.parse(input);
  const ids = new Set<string>();
  for (const fixture of parsed.fixtures) {
    if (ids.has(fixture.id)) throw new Error(`Duplicate evaluation fixture id: ${fixture.id}`);
    ids.add(fixture.id);
    if (containsPrivateMarker(fixture.source.path) || containsPrivateMarker(fixture.source.content)) {
      throw new Error(`Private-source marker found in fixture: ${fixture.id}`);
    }
  }
  if (parsed.fixtures.length !== expectedFixtureCount) {
    throw new Error(`Expected ${expectedFixtureCount} evaluation fixtures.`);
  }
  return parsed;
}

export function parseRecordedEvaluationResults(
  input: unknown,
  manifest: EvaluationManifest,
): RecordedEvaluationResults {
  const parsed = recordedEvaluationResultsSchema.parse(input);
  if (parsed.version !== manifest.version) {
    throw new Error("Recorded evaluation results do not match the manifest version.");
  }
  const expectedIds = new Set(manifest.fixtures.map((fixture) => fixture.id));
  const resultIds = new Set<string>();
  for (const result of parsed.results) {
    if (!expectedIds.has(result.fixtureId)) {
      throw new Error(`Unknown recorded fixture id: ${result.fixtureId}`);
    }
    if (resultIds.has(result.fixtureId)) {
      throw new Error(`Duplicate recorded fixture id: ${result.fixtureId}`);
    }
    resultIds.add(result.fixtureId);
  }
  if (resultIds.size !== expectedIds.size) {
    throw new Error("Recorded evaluation results are missing fixture outcomes.");
  }
  return parsed;
}
