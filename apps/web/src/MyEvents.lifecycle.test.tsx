// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyEvents from "./MyEvents";
import { EventLifecycleError } from "./event-lifecycle-error";
import { EventQueryError, type ApiEvent } from "./api-event-queries";
const event: ApiEvent = { id:"a4444444-4444-4444-8444-444444444444",name:"Evento prueba",slug:"evento",location:"Lima",timezone:"America/Lima",startsAt:"2027-08-27T14:00:00Z",endsAt:"2027-08-27T22:00:00Z",createdAt:"2026-09-24T12:00:00Z",status:"draft",version:1 };
function setup(status:ApiEvent["status"]="draft") {return {accountKey:"a",enabled:true,loadPage:vi.fn().mockResolvedValue({items:[{...event,status}],nextCursor:null}),loadDetail:vi.fn().mockResolvedValue({...event,status}),saveEvent:vi.fn(),registerAttendee:vi.fn(),changeEventState:vi.fn().mockResolvedValue({...event,status:status==="draft"?"active":"closed",version:2}),onAccessInvalidated:vi.fn()};}
async function open(){fireEvent.click(screen.getByText("Cargar eventos"));fireEvent.click(await screen.findByLabelText("Ver detalle de Evento prueba"));await screen.findByText("Identificador");}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("organizer lifecycle controls",()=>{
  it.each(["draft","active"] as const)("confirms %s, prevents double send and updates list",async status=>{
    const props=setup(status);vi.spyOn(window,"confirm").mockReturnValue(true);render(<MyEvents {...props}/>);await open();
    const button=screen.getByText(status==="draft"?"Activar evento":"Cerrar evento");fireEvent.click(button);fireEvent.click(button);
    await screen.findByText(status==="draft"?"Evento activado correctamente.":"Evento cerrado correctamente.");
    expect(props.changeEventState).toHaveBeenCalledExactlyOnceWith(event.id,status==="draft"?"activate":"close",{expectedVersion:1},expect.any(AbortSignal));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(event.name));expect(screen.queryByText("Editar evento")).toBeNull();
    if(status==="active")expect(screen.queryByText("Registrar asistente")).toBeNull();
    fireEvent.click(screen.getByText("Volver al listado"));expect(screen.getByText(status==="draft"?"Activo":"Cerrado")).toBeTruthy();
  });
  it("cancel confirmation sends nothing",async()=>{const props=setup();vi.spyOn(window,"confirm").mockReturnValue(false);render(<MyEvents {...props}/>);await open();fireEvent.click(screen.getByText("Activar evento"));expect(props.changeEventState).not.toHaveBeenCalled();expect(screen.getByText("Borrador")).toBeTruthy();});
  it.each(["closed","cancelled"] as const)("offers no transition for %s",async status=>{render(<MyEvents {...setup(status)}/>);await open();expect(screen.queryByText("Activar evento")).toBeNull();expect(screen.queryByText("Cerrar evento")).toBeNull();});
  it.each(["uncertain","version_conflict","transition_conflict"] as const)("requires successful refresh after %s",async kind=>{
    const props=setup();props.changeEventState.mockRejectedValue(new EventLifecycleError(kind));vi.spyOn(window,"confirm").mockReturnValue(true);render(<MyEvents {...props}/>);await open();fireEvent.click(screen.getByText("Activar evento"));
    await screen.findByText("Consultar estado actual");expect((screen.getByText("Activar evento") as HTMLButtonElement).disabled).toBe(true);expect((screen.getByText("Editar evento") as HTMLButtonElement).disabled).toBe(true);
    props.loadDetail.mockRejectedValueOnce(new EventQueryError("unavailable"));fireEvent.click(screen.getByText("Consultar estado actual"));await screen.findByRole("alert");
    props.loadDetail.mockResolvedValue({...event,status:"active",version:2});fireEvent.click(screen.getByText("Consultar estado actual"));await screen.findByText("Cerrar evento");expect(screen.queryByText("Evento activado correctamente.")).toBeNull();expect(props.changeEventState).toHaveBeenCalledTimes(1);
  });
  it.each(["authentication","interaction_required","unauthorized","forbidden"] as const)("invalidates access for %s",async kind=>{const props=setup();props.changeEventState.mockRejectedValue(new EventLifecycleError(kind));vi.spyOn(window,"confirm").mockReturnValue(true);render(<MyEvents {...props}/>);await open();fireEvent.click(screen.getByText("Activar evento"));await screen.findByText("Vuelve a comprobar el acceso con tu cuenta.");expect(props.onAccessInvalidated).toHaveBeenCalledOnce();expect(screen.queryByText("Identificador")).toBeNull();});
  it("removes inaccessible event",async()=>{const props=setup();props.changeEventState.mockRejectedValue(new EventLifecycleError("not_found"));vi.spyOn(window,"confirm").mockReturnValue(true);render(<MyEvents {...props}/>);await open();fireEvent.click(screen.getByText("Activar evento"));await screen.findByText("No tienes eventos asignados.");});
  it.each(["back","account","disabled","unmount"])("discards late success on %s",async mode=>{
    const props=setup();let resolve!:(value:ApiEvent)=>void;props.changeEventState.mockImplementation(()=>new Promise<ApiEvent>(r=>{resolve=r;}));vi.spyOn(window,"confirm").mockReturnValue(true);
    const view=render(<MyEvents {...props}/>);await open();fireEvent.click(screen.getByText("Activar evento"));expect((screen.getByText("Editar evento") as HTMLButtonElement).disabled).toBe(true);
    if(mode==="back")fireEvent.click(screen.getByText("Volver al listado"));if(mode==="account")view.rerender(<MyEvents {...props} accountKey="b"/>);if(mode==="disabled")view.rerender(<MyEvents {...props} enabled={false}/>);if(mode==="unmount")view.unmount();
    expect(props.changeEventState.mock.calls[0][3].aborted).toBe(true);await act(async()=>{resolve({...event,status:"active",version:2});});expect(screen.queryByText("Evento activado correctamente.")).toBeNull();
  });
});
