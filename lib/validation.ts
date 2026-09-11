export function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

export function apiError(error: unknown, context: string) {
  console.error(context, error);
  return Response.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
}

export const stageLevels: Record<string, string[]> = {
  high_school: ["first_secondary", "second_secondary", "third_secondary"],
  university: ["year_1", "year_2", "year_3", "year_4", "year_5", "year_6"],
  graduate: [],
};

export function validateStageLevel(stage: string, level: string) {
  if (!Object.keys(stageLevels).includes(stage)) return false;
  if (stage === "graduate") return true;
  return stageLevels[stage].includes(level);
}