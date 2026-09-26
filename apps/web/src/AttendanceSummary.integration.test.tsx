// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import OperatorEvents from "./OperatorEvents";
import MyEvents from "./MyEvents";
import { EventQueryError } from "./event-query-error";
const event={id:"a4444444-4444-4444-8444-444444444444",name:"Encuentro",slug:"encuentro",version:1,createdAt:"2026-09-26T12:00:00.000Z",startsAt:"2027-08-27T14:00:00.000Z",endsAt:"2027-08-27T22:00:00.000Z",timezone:"America/Lima",location:"Lima",status:"active" as const};
const initial={eventId:event.id,registered:1,confirmed:1,cancelled:0,checkedIn:0,cancelledCheckedIn:0,pending:1,observedAt:"2026-09-26T21:00:00.000Z"};
function props(){return{accountKey:"one",enabled:true,saveEvent:vi.fn(),loadPage:vi.fn().mockResolvedValue({items:[event],nextCursor:null}),loadDetail:vi.fn().mockResolvedValue(event),searchPage:vi.fn().mockResolvedValue({items:[],nextCursor:null}),loadSummary:vi.fn().mockResolvedValue(initial),onAccessInvalidated:vi.fn()};}
async function select(operator=true){fireEvent.click(screen.getByRole("button",{name:operator?"Cargar eventos asignados":"Cargar eventos"}));fireEvent.click(await screen.findByRole("button",{name:operator?"Seleccionar Encuentro":"Ver detalle de Encuentro"}));await screen.findByText("Registrados");}
afterEach(cleanup);
it("refreshes actual persisted count explicitly after accepted and duplicate check-in",async()=>{
 const p=props();const saved={id:event.id,registrationId:event.id,checkedInAt:"2026-09-26T21:02:00.000Z",source:"manual" as const};
 const submitCheckIn=vi.fn().mockResolvedValueOnce({status:"accepted",checkIn:saved}).mockResolvedValueOnce({status:"duplicate",checkIn:saved});
 render(<OperatorEvents {...p} submitCheckIn={submitCheckIn}/>);await select();
 for(const message of ["Ingreso registrado correctamente.","Esta credencial ya tiene un ingreso registrado. No se creó otro ingreso."]){
  fireEvent.change(screen.getByLabelText("Código de la credencial"),{target:{value:"test-credential"}});fireEvent.click(screen.getByRole("button",{name:"Registrar ingreso"}));await screen.findByText(message);
 }
 expect(p.loadSummary).toHaveBeenCalledTimes(1);
 p.loadSummary.mockResolvedValue({...initial,checkedIn:1,pending:0});fireEvent.click(screen.getByText("Actualizar métricas"));
 await waitFor(()=>expect(p.loadSummary).toHaveBeenCalledTimes(2));await screen.findByText("Registrados");
 const cards=screen.getByRole("region",{name:"Resumen de asistencia"}).querySelectorAll("strong");expect([...cards].map(x=>x.textContent)).toEqual(["1","1","0"]);
});
it.each(["draft","active","closed","cancelled"] as const)("organizer can consult metrics for %s",async status=>{const p=props();p.loadDetail.mockResolvedValue({...event,status});render(<MyEvents {...p}/>);await select(false);expect(p.loadSummary).toHaveBeenCalledTimes(1);});
it("organizer drops inaccessible event and summary after 404",async()=>{const p=props();render(<MyEvents {...p}/>);await select(false);p.loadSummary.mockRejectedValue(new EventQueryError("not_found"));fireEvent.click(screen.getByText("Actualizar métricas"));await screen.findByRole("alert");expect(screen.queryByText("Registrados")).toBeNull();expect(screen.queryByText("Actualizar métricas")).toBeNull();});
it("returning to operator list cancels and discards refresh",async()=>{const p=props();render(<OperatorEvents {...p}/>);await select();let resolve!:(v:typeof initial)=>void;p.loadSummary.mockReturnValue(new Promise(r=>{resolve=r;}));fireEvent.click(screen.getByText("Actualizar métricas"));const signal=p.loadSummary.mock.calls[1][1] as AbortSignal;fireEvent.click(screen.getByText("Volver a eventos asignados"));expect(signal.aborted).toBe(true);await act(async()=>resolve(initial));expect(screen.queryByText("Registrados")).toBeNull();});
