/**
 * Leave cover: while a leader is away, the person they chose (anyone active in their
 * department) approves and monitors for them, on the dates set; the access ends by itself
 * the day after. A stand-in gets the leader's approvals (leave, schedule, overtime, breaks)
 * and views (team calendars, dashboards, trackers), never their admin rights.
 */
import type { CalendarData, Cover } from "./types";

type D = Pick<CalendarData, "covers">;

/** Covers running on a day. */
export const activeCovers = (d: D, day: string): Cover[] => (d.covers ?? []).filter((x) => x.from <= day && day <= x.to);

/** Leaders `me` covers for on a day. */
export const coveredLeaders = (d: D, me: number, day: string): number[] => [...new Set(activeCovers(d, day).filter((x) => x.standIn === me).map((x) => x.leader))];

/** Who covers for a leader on a day, if anyone. */
export const standInFor = (d: D, leader: number, day: string): number | undefined => activeCovers(d, day).find((x) => x.leader === leader)?.standIn;

/** A leader's covers that haven't ended yet (running or coming up), soonest first. */
export const coversOf = (d: D, leader: number, day: string): Cover[] =>
  (d.covers ?? []).filter((x) => x.leader === leader && x.to >= day).sort((a, b) => a.from.localeCompare(b.from));

/** Covers someone is (or will be) a stand-in for, soonest first. */
export const coveringFor = (d: D, me: number, day: string): Cover[] =>
  (d.covers ?? []).filter((x) => x.standIn === me && x.to >= day).sort((a, b) => a.from.localeCompare(b.from));
