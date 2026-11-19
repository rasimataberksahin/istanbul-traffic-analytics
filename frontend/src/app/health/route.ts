/** Liveness probe for the container. It does not call the API, so a slow API cannot restart the dashboard. */
export function GET() {
  return Response.json({ status: "ok" });
}
