export const LOAD_POSTGRES_MIGRATION_SAMPLE_EVENT =
  "authos:postgres-migration-checker:load-sample";

export type LoadPostgresMigrationSampleDetail = {
  sampleId: string;
};

export function dispatchLoadPostgresMigrationSample(
  detail: LoadPostgresMigrationSampleDetail,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<LoadPostgresMigrationSampleDetail>(
      LOAD_POSTGRES_MIGRATION_SAMPLE_EVENT,
      { detail },
    ),
  );
}
