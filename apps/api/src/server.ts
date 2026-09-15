import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { registerCheckIn } from "./check-in.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ["http://localhost:5173"],
});

app.get("/health", async () => ({
  status: "ok",
  service: "openevents-api",
  timestamp: new Date().toISOString(),
}));

app.get("/api/events/current", async () => ({
  id: "devopsdays-lima-2027",
  name: "DevOpsDays Lima 2027",
  venue: "Centro de Convenciones de Lima",
  date: "27 de agosto de 2027",
  stats: {
    registered: 240,
    checkedIn: 168,
  },
}));

const checkInBody = z.object({
  code: z.string().min(1).max(120),
});

app.post("/api/check-ins", async (request, reply) => {
  const parsed = checkInBody.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      status: "invalid",
      message: "Ingresa un código QR válido.",
    });
  }

  const result = registerCheckIn(parsed.data.code);
  return reply.code(result.status === "invalid" ? 404 : 200).send(result);
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

await app.listen({ port, host });
