import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractionRequiredAuthError, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { getAttendanceSummary, parseAttendanceSummary } from "./api-attendance-summary";
const id = "a4444444-4444-4444-8444-444444444444";
const data = { eventId: id, registered: 6, confirmed: 4, cancelled: 2, checkedIn: 3, cancelledCheckedIn: 1, pending: 2, observedAt: "2026-09-26T21:00:00.000Z" };
function setup() {
  const token = vi.fn().mockResolvedValue({ accessToken: "secret" });
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data))); vi.stubGlobal("fetch", fetcher);
  return { token, fetcher, options: { eventId: id, apiUrl: "http://localhost:3001", apiScope: "scope", account: { homeAccountId: "one" } as AccountInfo, instance: { acquireTokenSilent: token } as unknown as IPublicClientApplication } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("attendance summary client", () => {
  it("queries selected event with account/scope and safe transport", async () => {
    const s = setup(); expect(await getAttendanceSummary({ ...s.options, eventId: id.toUpperCase() })).toEqual(data);
    expect(s.token).toHaveBeenCalledWith({ account: s.options.account, scopes: ["scope"] });
    expect(s.fetcher).toHaveBeenCalledWith(`http://localhost:3001/api/v1/events/${id}/attendance-summary`, expect.objectContaining({ method: "GET", cache: "no-store", credentials: "omit", redirect: "error", headers: { Authorization: "Bearer secret", Accept: "application/json" } }));
  });
  it("accepts genuine zeros and projects only contract fields", () => {
    const zeros = { ...data, registered: 0, confirmed: 0, cancelled: 0, checkedIn: 0, cancelledCheckedIn: 0, pending: 0 };
    expect(parseAttendanceSummary({ ...zeros, private: "hidden" }, id)).toEqual(zeros);
  });
  it.each([null, [], {}, { ...data, eventId: "b4444444-4444-4444-8444-444444444444" },
    ...["registered", "confirmed", "cancelled", "checkedIn", "cancelledCheckedIn", "pending"].map(key => ({ ...data, [key]: undefined })),
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "6", null].map(registered => ({ ...data, registered })),
    { ...data, pending: 3 }, { ...data, registered: 7 }, { ...data, cancelledCheckedIn: 3 },
    { ...data, observedAt: "2026-02-30T21:00:00.000Z" }, { ...data, observedAt: "2026-09-26T21:00:00+00:00" },
  ])("rejects incomplete/inconsistent or foreign response %#", value => expect(() => parseAttendanceSummary(value, id)).toThrow());
  it.each([[400,"validation"],[401,"unauthorized"],[403,"forbidden"],[404,"not_found"],[500,"unavailable"],[204,"unavailable"]])("maps HTTP %s without leaking body or retry", async (status, kind) => {
    const s=setup(); s.fetcher.mockResolvedValue(new Response(status===204 ? null : '{"message":"private"}', { status: Number(status) }));
    await expect(getAttendanceSummary(s.options)).rejects.toMatchObject({ kind }); expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["https://user:password@example.com", "http://example.com", "http://localhost:3001?x=1"])("rejects unsafe URL %s", async apiUrl => {
    const s=setup(); await expect(getAttendanceSummary({ ...s.options, apiUrl })).rejects.toMatchObject({ kind:"configuration" }); expect(s.token).not.toHaveBeenCalled();
  });
  it("rejects bad ID before requesting token", async()=>{const s=setup();await expect(getAttendanceSummary({...s.options,eventId:"bad"})).rejects.toMatchObject({kind:"validation"});expect(s.token).not.toHaveBeenCalled();});
  it.each([false,true])("maps token failure interaction=%s", async interaction => {const s=setup();s.token.mockRejectedValue(interaction?new InteractionRequiredAuthError("interaction_required", "Required"):new Error("private"));await expect(getAttendanceSummary(s.options)).rejects.toMatchObject({kind:interaction?"interaction_required":"authentication"});expect(s.fetcher).not.toHaveBeenCalled();});
  it("rejects empty token",async()=>{const s=setup();s.token.mockResolvedValue({accessToken:""});await expect(getAttendanceSummary(s.options)).rejects.toMatchObject({kind:"authentication"});expect(s.fetcher).not.toHaveBeenCalled();});
  it("does not send after account changes during token acquisition",async()=>{const s=setup();let current=true;s.token.mockImplementation(async()=>{current=false;return{accessToken:"secret"};});await expect(getAttendanceSummary({...s.options,isCurrent:()=>current})).rejects.toMatchObject({kind:"cancelled"});expect(s.fetcher).not.toHaveBeenCalled();});
  it("rejects pre-aborted and late responses",async()=>{const s=setup();const c=new AbortController();c.abort();await expect(getAttendanceSummary({...s.options,signal:c.signal})).rejects.toMatchObject({kind:"cancelled"});expect(s.token).not.toHaveBeenCalled();const late=new AbortController();s.fetcher.mockImplementation(async()=>{late.abort();return new Response(JSON.stringify(data));});await expect(getAttendanceSummary({...s.options,signal:late.signal})).rejects.toMatchObject({kind:"cancelled"});});
  it("checks account again after JSON arrives",async()=>{const s=setup();let current=true;s.fetcher.mockResolvedValue({status:200,json:async()=>{current=false;return data;}});await expect(getAttendanceSummary({...s.options,isCurrent:()=>current})).rejects.toMatchObject({kind:"cancelled"});});
  it("handles network and malformed JSON without zeros",async()=>{const s=setup();s.fetcher.mockRejectedValueOnce(new Error("private")).mockResolvedValueOnce(new Response("{"));await expect(getAttendanceSummary(s.options)).rejects.toMatchObject({kind:"unavailable"});await expect(getAttendanceSummary(s.options)).rejects.toMatchObject({kind:"invalid_response"});});
  it("times out and cleans up without retry",async()=>{vi.useFakeTimers();const s=setup();s.fetcher.mockImplementation((_url,init:RequestInit)=>new Promise((_resolve,reject)=>init.signal?.addEventListener("abort",()=>reject(new Error()))));const result=expect(getAttendanceSummary(s.options)).rejects.toMatchObject({kind:"unavailable"});await vi.advanceTimersByTimeAsync(15000);await result;expect(s.fetcher).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);});
});
