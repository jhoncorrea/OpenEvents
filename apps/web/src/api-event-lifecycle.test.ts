import { type AccountInfo, type IPublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeApiEventState, type EventLifecycleAction } from "./api-event-lifecycle";
const event = { id: "a4444444-4444-4444-8444-444444444444", name: "Evento", slug: "evento", location: "Lima", timezone: "America/Lima",
  startsAt: "2027-08-27T14:00:00Z", endsAt: "2027-08-27T22:00:00Z", createdAt: "2026-09-24T12:00:00Z", version: 2, status: "active" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe.each(["activate", "close"] as const)("lifecycle client %s", action => {
  function setup() {
    const account = { homeAccountId: "selected" } as AccountInfo;
    const token = vi.fn().mockResolvedValue({ accessToken: "secret" });
    const updated = { ...event, status: action === "activate" ? "active" : "closed" };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(updated))); vi.stubGlobal("fetch", fetcher);
    return { token, fetcher, updated, options: { instance: { acquireTokenSilent: token } as unknown as IPublicClientApplication,
      account, apiScope: "scope", apiUrl: "https://api.example.com/prefix", eventId: event.id.toUpperCase(), action, input: { expectedVersion: 1 } } };
  }
  it("uses verified account, precise route/body, no-store and expected destination", async () => {
    const s = setup(); expect(await changeApiEventState(s.options)).toEqual(s.updated);
    expect(s.token).toHaveBeenCalledExactlyOnceWith({ account: s.options.account, scopes: ["scope"] });
    expect(s.fetcher).toHaveBeenCalledExactlyOnceWith(`https://api.example.com/prefix/api/v1/events/${event.id}/${action}`, expect.objectContaining({
      method: "POST", body: '{"expectedVersion":1}', cache: "no-store", credentials: "omit", redirect: "error",
      headers: { Authorization: "Bearer secret", Accept: "application/json", "Content-Type": "application/json" } }));
  });
  it.each(["bad", "http://remote.example", "https://u:p@example.com", "https://example.com?q=x", "https://example.com#x"])("rejects URL %s before token", async apiUrl => {
    const s = setup(); await expect(changeApiEventState({ ...s.options, apiUrl })).rejects.toMatchObject({ kind: "configuration" }); expect(s.token).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 2147483647, NaN])("rejects version %s before token", async expectedVersion => {
    const s = setup(); await expect(changeApiEventState({ ...s.options, input: { expectedVersion } })).rejects.toMatchObject({ kind: "validation" }); expect(s.token).not.toHaveBeenCalled();
  });
  it("rejects extra fields, invalid action, ID and scope", async () => {
    const s = setup();
    for (const options of [{ input: { expectedVersion: 1, actor: "forged" } }, { action: "cancel" as EventLifecycleAction }, { eventId: "../x" }])
      await expect(changeApiEventState({ ...s.options, ...options })).rejects.toMatchObject({ kind: "validation" });
    await expect(changeApiEventState({ ...s.options, apiScope: " " })).rejects.toMatchObject({ kind: "configuration" }); expect(s.token).not.toHaveBeenCalled();
  });
  it.each([[400,"validation"],[401,"unauthorized"],[403,"forbidden"],[404,"not_found"],[500,"uncertain"],[201,"uncertain"]])("maps status %s without retry", async (status,kind) => {
    const s=setup(); s.fetcher.mockResolvedValue(new Response('{"message":"private"}',{status:Number(status)}));
    await expect(changeApiEventState(s.options)).rejects.toMatchObject({kind}); expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([["EVENT_VERSION_CONFLICT","version_conflict"],["EVENT_TRANSITION_NOT_ALLOWED","transition_conflict"],["toString","uncertain"]])("maps conflict %s",async(code,kind)=>{
    const s=setup();s.fetcher.mockResolvedValue(new Response(JSON.stringify({code}),{status:409}));await expect(changeApiEventState(s.options)).rejects.toMatchObject({kind});
  });
  it.each([{version:1},{version:3},{status:"draft"},{id:"b4444444-4444-4444-8444-444444444444"},{timezone:"Bad/Zone"}])("rejects unexpected success %#",async change=>{
    const s=setup();s.fetcher.mockResolvedValue(new Response(JSON.stringify({...s.updated,...change})));await expect(changeApiEventState(s.options)).rejects.toMatchObject({kind:"uncertain"});
  });
  it("handles interaction before sending",async()=>{const s=setup();s.token.mockRejectedValue(new InteractionRequiredAuthError("interaction_required", "Interaction required"));await expect(changeApiEventState(s.options)).rejects.toMatchObject({kind:"interaction_required"});expect(s.fetcher).not.toHaveBeenCalled();});
  it("rejects obsolete account after awaiting token",async()=>{const s=setup();let current=true;s.token.mockImplementation(async()=>{current=false;return{accessToken:"secret"};});await expect(changeApiEventState({...s.options,isCurrent:()=>current})).rejects.toMatchObject({kind:"cancelled"});expect(s.fetcher).not.toHaveBeenCalled();});
  it("ignores late response after abort",async()=>{const s=setup();const c=new AbortController();s.fetcher.mockImplementation(async()=>{c.abort();return new Response(JSON.stringify(s.updated));});await expect(changeApiEventState({...s.options,signal:c.signal})).rejects.toMatchObject({kind:"cancelled"});});
  it("treats network and unreadable JSON as uncertain",async()=>{const s=setup();s.fetcher.mockRejectedValueOnce(new Error("private"));await expect(changeApiEventState(s.options)).rejects.toMatchObject({kind:"uncertain"});s.fetcher.mockResolvedValue(new Response("{"));await expect(changeApiEventState(s.options)).rejects.toMatchObject({kind:"uncertain"});});
  it("times out once without retry",async()=>{vi.useFakeTimers();const s=setup();s.fetcher.mockImplementation((_url,init:RequestInit)=>new Promise((_resolve,reject)=>{init.signal?.addEventListener("abort",()=>reject(new Error("timeout")));}));const result=expect(changeApiEventState(s.options)).rejects.toMatchObject({kind:"uncertain"});await vi.advanceTimersByTimeAsync(15000);await result;expect(s.fetcher).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);});
});
