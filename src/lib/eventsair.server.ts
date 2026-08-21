/**
 * EventsAir External API access (server-only).
 *
 * Credentials (set as project secrets):
 *  - EVENTSAIR_TENANT_ID
 *  - EVENTSAIR_CLIENT_ID
 *  - EVENTSAIR_CLIENT_SECRET
 *
 * When credentials are absent the module returns demo data so the dashboard
 * is fully usable before the API is wired up.
 */

const API_URL = "https://api.eventsair.com/graphql";
const API_SCOPE =
  "https://eventsairprod.onmicrosoft.com/85d8f626-4e3d-4357-89c6-327d4e6d3d93/.default";
const tokenUrl = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

export type EventSummary = { id: string; name: string; startDate: string | null };

export type DashboardData = {
  demo: boolean;
  event: EventSummary;
  totalRegistrations: number;
  last7Days: number;
  registeredToday: number;
  byType: { type: string; count: number }[];
  byLocation: { location: string; count: number }[];
  byMembership: { membership: string; count: number }[];
  financials: {
    currency: string;
    total: number;
    streams: {
      stream: "Tickets" | "Exhibitors" | "Sponsors";
      amount: number;
      count: number;
      items: { label: string; amount: number; count: number }[];
    }[];
  };
  daily: { date: string; count: number }[];
  recent: { name: string; type: string; date: string }[];
};

function credentials() {
  const tenantId = process.env["EVENTSAIR_TENANT_ID"];
  const clientId = process.env["EVENTSAIR_CLIENT_ID"];
  const clientSecret = process.env["EVENTSAIR_CLIENT_SECRET"];
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

export function hasCredentials() {
  return credentials() !== null;
}

async function getToken(tenantId: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: API_SCOPE,
  });
  const res = await fetch(tokenUrl(tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`EventsAir auth failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("EventsAir auth returned no access token");
  return json.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * EventsAir occasionally rejects a perfectly valid token with
 * "The incoming token doesn't contain a `roles` claim" (transient auth-node
 * issue). Retry with a fresh token a few times before giving up.
 */
async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const creds = credentials();
  if (!creds) throw new Error("EventsAir credentials are not configured");

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = await getToken(creds.tenantId, creds.clientId, creds.clientSecret);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    const transient = text.includes("`roles` claim") || res.status === 502 || res.status === 503;
    if (transient) {
      lastError = new Error(`EventsAir API transient failure [${res.status}]`);
      await sleep(300 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`EventsAir API failed [${res.status}]: ${text}`);
    const json = JSON.parse(text) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`EventsAir API error: ${json.errors[0]!.message}`);
    return json.data as T;
  }
  throw lastError ?? new Error("EventsAir API failed");
}

async function paginatedRegistrations(eventId: string): Promise<LiveRegistration[]> {
  const all: LiveRegistration[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const data = await gql<{
      event: {
        registrationsPaged: {
          items: LiveRegistration[];
          pageInfo: { totalCount: number; hasNextPage: boolean };
        };
      } | null;
    }>(
      `query Registrations($eventId: ID!, $offset: NonNegativeInt!, $limit: PaginationLimit!) {
        event(id: $eventId) {
          registrationsPaged(filterInput: {}, offset: $offset, limit: $limit) {
            items {
              id
              createdAt
              fee { amount currency { code } }
              type { name }
              contact { firstName lastName }
            }
            pageInfo { totalCount hasNextPage }
          }
        }
      }`,
      { eventId, offset, limit },
    );
    const page = data.event?.registrationsPaged;
    if (!page) break;
    all.push(...page.items);
    if (!page.pageInfo.hasNextPage) break;
    offset += limit;
  }
  return all;
}

type LiveSponsorship = {
  id: string;
  quantity?: number | null;
  status?: string | null;
  fee?: { amount?: number | null; currency?: { code?: string | null } | null } | null;
  package?: { name?: string | null } | null;
  sponsor?: { organizationName?: string | null } | null;
};

type LiveExhibitionBooking = {
  id: string;
  status?: string | null;
  fee?: { amount?: number | null; currency?: { code?: string | null } | null } | null;
  standType?: { name?: string | null } | null;
  exhibitor?: { organizationName?: string | null } | null;
};

async function paginatedSponsorships(eventId: string): Promise<LiveSponsorship[]> {
  const all: LiveSponsorship[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const data = await gql<{
      event: {
        sponsorshipsPaged: {
          items: LiveSponsorship[];
          pageInfo: { hasNextPage: boolean };
        };
      } | null;
    }>(
      `query Sponsorships($eventId: ID!, $offset: NonNegativeInt!, $limit: PaginationLimit!) {
        event(id: $eventId) {
          sponsorshipsPaged(filterInput: {}, offset: $offset, limit: $limit) {
            items {
              id
              quantity
              status
              fee { amount currency { code } }
              package { name }
              sponsor { organizationName }
            }
            pageInfo { hasNextPage }
          }
        }
      }`,
      { eventId, offset, limit },
    );
    const page = data.event?.sponsorshipsPaged;
    if (!page) break;
    all.push(...page.items);
    if (!page.pageInfo.hasNextPage) break;
    offset += limit;
  }
  return all;
}

async function paginatedExhibitionBookings(eventId: string): Promise<LiveExhibitionBooking[]> {
  const all: LiveExhibitionBooking[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const data = await gql<{
      event: {
        exhibitionBookingsPaged: {
          items: LiveExhibitionBooking[];
          pageInfo: { hasNextPage: boolean };
        };
      } | null;
    }>(
      `query Exhibition($eventId: ID!, $offset: NonNegativeInt!, $limit: PaginationLimit!) {
        event(id: $eventId) {
          exhibitionBookingsPaged(filterInput: {}, offset: $offset, limit: $limit) {
            items {
              id
              status
              fee { amount currency { code } }
              standType { name }
              exhibitor { organizationName }
            }
            pageInfo { hasNextPage }
          }
        }
      }`,
      { eventId, offset, limit },
    );
    const page = data.event?.exhibitionBookingsPaged;
    if (!page) break;
    all.push(...page.items);
    if (!page.pageInfo.hasNextPage) break;
    offset += limit;
  }
  return all;
}

const isCancelled = (status?: string | null) =>
  (status ?? "").toUpperCase().startsWith("CANCEL");

/* ---------------------------------- demo ---------------------------------- */

const DEMO_EVENTS: EventSummary[] = [
  { id: "demo-1", name: "National Conference 2026", startDate: "2026-10-14" },
  { id: "demo-2", name: "Annual Members Summit", startDate: "2026-11-03" },
];

const DEMO_TYPES = [
  "Melbourne Full Delegate",
  "Auckland Full Delegate",
  "Christchurch Full Delegate",
  "Melbourne Day Delegate",
  "Auckland Student",
];

/**
 * Ticket names usually embed the city ("Melbourne Full Delegate",
 * "Symposium - Auckland"). Match a known city name anywhere in the ticket name.
 */
const KNOWN_LOCATIONS = [
  "Melbourne",
  "Sydney",
  "Brisbane",
  "Perth",
  "Adelaide",
  "Canberra",
  "Hobart",
  "Darwin",
  "Gold Coast",
  "Newcastle",
  "Auckland",
  "Christchurch",
  "Wellington",
  "Hamilton",
  "Dunedin",
  "Queenstown",
  "Singapore",
  "Online",
  "Virtual",
];

export function locationFromTicketName(name: string): string {
  const lower = name.toLowerCase();
  const match = KNOWN_LOCATIONS.find((city) => lower.includes(city.toLowerCase()));
  if (!match) return "Unspecified";
  return match === "Virtual" ? "Online" : match;
}

/**
 * Complimentary "Full Conference Access" tickets that bundle Christchurch and
 * Auckland together should not be counted as separate registrations.
 */
const EXCLUDED_TICKET_TYPES = ["full conference access christchurch & auckland"];

/**
 * Ticket names usually flag membership ("Member Full Delegate",
 * "Non-Member Day Delegate"). Check the non-member wording first so it isn't
 * swallowed by the plain "member" match.
 */
export function membershipFromTicketName(name: string): string {
  const lower = name.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (/\bnon\s?member/.test(lower) || /\bnonmember/.test(lower)) return "Non-member";
  if (/\bmembers?\b/.test(lower)) return "Member";
  if (/\bstudent\b/.test(lower)) return "Student";
  return "Unspecified";
}

export function isExcludedTicketType(name: string): boolean {
  const normalized = name.toLowerCase().replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
  return EXCLUDED_TICKET_TYPES.includes(normalized);
}

function demoDashboard(eventId: string): DashboardData {
  const event = DEMO_EVENTS.find((e) => e.id === eventId) ?? DEMO_EVENTS[0]!;
  const seedBase = event.id === "demo-2" ? 3 : 7;
  const daily: { date: string; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const wave = Math.sin((i + seedBase) / 3.5) * 6 + (90 - i) * 0.8;
    daily.push({ date: d.toISOString().slice(0, 10), count: Math.max(1, Math.round(10 + wave)) });
  }
  const total = daily.reduce((s, d) => s + d.count, 0);
  const byType = DEMO_TYPES.map((type, i) => ({
    type,
    count: Math.round((total * [0.42, 0.26, 0.12, 0.11, 0.09][i]!) as number),
  }));
  const recent = Array.from({ length: 6 }).map((_, i) => ({
    name: ["A. Nguyen", "J. Patel", "M. O'Brien", "S. Kimura", "L. Rossi", "T. Adebayo"][i]!,
    type: DEMO_TYPES[i % DEMO_TYPES.length]!,
    date: daily[daily.length - 1 - Math.floor(i / 2)]!.date,
  }));
  const demoLocationMap = new Map<string, number>();
  const demoMembershipMap = new Map<string, number>();
  for (const t of byType) {
    const loc = locationFromTicketName(t.type);
    demoLocationMap.set(loc, (demoLocationMap.get(loc) ?? 0) + t.count);
    const mem = membershipFromTicketName(t.type);
    demoMembershipMap.set(mem, (demoMembershipMap.get(mem) ?? 0) + t.count);
  }
  const ticketItems = byType.map((t) => ({
    label: t.type,
    amount: t.count * 850,
    count: t.count,
  }));
  const exhibitorItems = [
    { label: "3x3 Booth", amount: 96000, count: 24 },
    { label: "Premium Corner Booth", amount: 54000, count: 9 },
    { label: "Shell Scheme", amount: 21000, count: 7 },
  ];
  const sponsorItems = [
    { label: "Platinum Sponsor", amount: 60000, count: 2 },
    { label: "Awards Dinner", amount: 32000, count: 2 },
    { label: "Learning Centre", amount: 8800, count: 2 },
  ];
  const sum = (items: { amount: number }[]) => items.reduce((s, i) => s + i.amount, 0);
  const countOf = (items: { count: number }[]) => items.reduce((s, i) => s + i.count, 0);
  const streams: DashboardData["financials"]["streams"] = [
    { stream: "Tickets", amount: sum(ticketItems), count: countOf(ticketItems), items: ticketItems },
    {
      stream: "Exhibitors",
      amount: sum(exhibitorItems),
      count: countOf(exhibitorItems),
      items: exhibitorItems,
    },
    {
      stream: "Sponsors",
      amount: sum(sponsorItems),
      count: countOf(sponsorItems),
      items: sponsorItems,
    },
  ];
  return {
    demo: true,
    event,
    financials: {
      currency: "AUD",
      total: streams.reduce((s, x) => s + x.amount, 0),
      streams,
    },
    totalRegistrations: total,
    last7Days: daily.slice(-7).reduce((s, d) => s + d.count, 0),
    registeredToday: daily[daily.length - 1]!.count,
    byType,
    byLocation: [...demoLocationMap.entries()]
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count),
    byMembership: [...demoMembershipMap.entries()]
      .map(([membership, count]) => ({ membership, count }))
      .sort((a, b) => b.count - a.count),
    daily,
    recent,
  };
}

/* ---------------------------------- live ---------------------------------- */

export const demoEvents = DEMO_EVENTS;

export async function fetchEvents(): Promise<{ demo: boolean; events: EventSummary[] }> {
  if (!hasCredentials()) return { demo: true, events: DEMO_EVENTS };
  const data = await gql<{
    events: { id: string; name: string; startDate: string | null }[];
  }>(
    `query Events($offset: NonNegativeInt!, $limit: PaginationLimit!) {
      events(input: {}, offset: $offset, limit: $limit) {
        id
        name
        startDate
      }
    }`,
    { offset: 0, limit: 100 },
  );
  return { demo: false, events: data.events ?? [] };
}

type LiveRegistration = {
  id: string;
  createdAt: string;
  fee?: { amount?: number | null; currency?: { code?: string | null } | null } | null;
  type?: { name?: string | null } | null;
  contact?: { firstName?: string | null; lastName?: string | null } | null;
};

function rollup(
  rows: { label: string; amount: number; count: number }[],
): { label: string; amount: number; count: number }[] {
  const map = new Map<string, { label: string; amount: number; count: number }>();
  for (const row of rows) {
    const existing = map.get(row.label);
    if (existing) {
      existing.amount += row.amount;
      existing.count += row.count;
    } else {
      map.set(row.label, { ...row });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export async function fetchDashboard(eventId: string): Promise<DashboardData> {
  if (!hasCredentials()) return demoDashboard(eventId);

  const data = await gql<{
    event: { id: string; name: string; startDate: string | null } | null;
  }>(
    `query Event($eventId: ID!) {
      event(id: $eventId) { id name startDate }
    }`,
    { eventId },
  );

  const event: EventSummary = data.event ?? { id: eventId, name: "Event", startDate: null };
  const regs = (await paginatedRegistrations(eventId)).filter(
    (r) => !isExcludedTicketType(r.type?.name ?? ""),
  );

  const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
  const dailyMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const locationMap = new Map<string, number>();
  const membershipMap = new Map<string, number>();
  for (const r of regs) {
    const key = dayKey(r.createdAt);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    const t = r.type?.name ?? "Unspecified";
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    const loc = locationFromTicketName(t);
    locationMap.set(loc, (locationMap.get(loc) ?? 0) + 1);
    const mem = membershipFromTicketName(t);
    membershipMap.set(mem, (membershipMap.get(mem) ?? 0) + 1);
  }

  // Anchor the 90-day window to the latest registration so historic events
  // still show a meaningful trend instead of a flat line of zeroes.
  const latestReg = regs.reduce<number>(
    (max, r) => Math.max(max, +new Date(r.createdAt)),
    0,
  );
  const anchor = latestReg && latestReg < Date.now() ? new Date(latestReg) : new Date();
  const daily: { date: string; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key, count: dailyMap.get(key) ?? 0 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const recent = [...regs]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6)
    .map((r) => ({
      name: `${r.contact?.firstName ?? ""} ${r.contact?.lastName ?? ""}`.trim() || "Registrant",
      type: r.type?.name ?? "Unspecified",
      date: dayKey(r.createdAt),
    }));

  return {
    demo: false,
    event,
    totalRegistrations: regs.length,
    last7Days: daily.slice(-7).reduce((s, d) => s + d.count, 0),
    registeredToday: dailyMap.get(today) ?? 0,
    byType: [...typeMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    byLocation: [...locationMap.entries()]
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count),
    byMembership: [...membershipMap.entries()]
      .map(([membership, count]) => ({ membership, count }))
      .sort((a, b) => b.count - a.count),
    daily,
    recent,
  };
}
