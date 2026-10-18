// routes/health.mjs - GET /api/healthz

export async function healthRoutes(app) {
  app.get("/api/healthz", async (_request, reply) => {
    reply.type("text/plain; charset=utf-8");
    return reply.send("ok\n");
  });
}
