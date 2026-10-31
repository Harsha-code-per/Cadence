import { ApiError } from "@/lib/api";

/** One readable message for a toast or an inline alert, including field errors. */
export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const details = Object.entries(error.fieldErrors).flatMap(([field, messages]) =>
      messages.map((message) => `${field}: ${message}`),
    );
    return details.length ? `${error.message} ${details.join(" ")}` : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
