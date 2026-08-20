import { createServerFn } from "@tanstack/react-start";

export const listEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchEvents, demoEvents } = await import("./eventsair.server");
  try {
    return { ...(await fetchEvents()), error: null as string | null };
  } catch (error) {
    console.error("listEvents failed", error);
    return { demo: true, events: demoEvents, error: (error as Error).message };
  }
});

export const getEventDashboard = createServerFn({ method: "GET" })
  .validator((data: { eventId: string }) => data)
  .handler(async ({ data }) => {
    const { fetchDashboard } = await import("./eventsair.server");
    return fetchDashboard(data.eventId);
  });
