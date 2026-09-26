// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./SessionControls",()=>({default:()=> <div>Sesión real</div>}));
import App from "./App";
afterEach(cleanup);
it("removes fixed attendance cards and labels the remaining demo",()=>{render(<App/>);expect(screen.queryByRole("region",{name:"Resumen de asistencia"})).toBeNull();for(const value of ["240","168","72","70% de asistencia","30% por ingresar"])expect(screen.queryByText(value)).toBeNull();expect(screen.getByText(/las secciones siguientes usan datos de ejemplo/)).toBeTruthy();expect(screen.queryByText("EN VIVO")).toBeNull();});
