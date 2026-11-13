import { sante } from "@/lib/sante";

export function GET() {
  return Response.json(sante());
}
