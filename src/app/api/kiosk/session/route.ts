import { NextRequest } from "next/server";
import { assertOrigin, COOKIE, failure, newSession, reply, stationConfig } from "@/lib/kiosk/server";

export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const body = await request.json();
    const station = stationConfig(body.station);
    const response = reply({ stationId: station.id });
    response.cookies.set(COOKIE, newSession(station), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/kiosk", maxAge: 1800 });
    return response;
  } catch (error) { return failure(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    assertOrigin(request);
    const response = reply({ ended: true });
    response.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/kiosk", maxAge: 0 });
    return response;
  } catch (error) { return failure(error); }
}
