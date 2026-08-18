import { createServerFn } from "@tanstack/react-start";

export const listEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchEvents } = await import("./eventsair.server");
  try {
    return await fetchEvents();
  } catch (error) {
    console.error("listEvents failed", error);
    return { demo: true, events: [], error: (error as Error).message };
  }
});

export const getEventDashboard = createServerFn({ method: "GET" })
  .inputValidator((data: { eventId: string }) => data)
  .handler(async ({ data }) => {
    const { fetchDashboard } = await import("./eventsair.server");
    return fetchDashboard(data.eventId);
  });
