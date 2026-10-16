export const dynamic = "force-dynamic";

// Reachability only; does not claim database/payment-provider health.
export function GET() {
  return Response.json({ reachable: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
