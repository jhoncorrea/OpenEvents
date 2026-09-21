import { describe, expect, it } from "vitest";
import { REGISTRATION_CSV_LIMITS, validateRegistrationCsv } from "./validate-registration-csv.js";

const encode = (text: string) => new TextEncoder().encode(text);
const header = "fullName,email\n";
const validRow = "Persona,persona@example.com";
function validate(text: string) { return validateRegistrationCsv(encode(text)); }
function errors(text: string) {
  const result = validate(text);
  expect(result.valid).toBe(false); expect(result).not.toHaveProperty("rows");
  if (result.valid) throw new Error("Expected invalid result");
  return result;
}
describe("registration CSV validation", () => {
  it.each(["\n", "\r\n"])("normalizes data with %j endings and optional final newline", ending => {
    for (const final of ["", ending]) {
      expect(validate(`fullName,email${ending}  María Prueba  ,Persona+Tag@Example.COM${final}`))
        .toEqual({ valid: true, count: 1, rows: [{ fullName: "María Prueba", email: "persona+tag@example.com" }] });
    }
  });
  it("accepts a UTF-8 BOM and quoted headers", () => {
    expect(validate('\uFEFF"fullName","email"\n'+validRow)).toMatchObject({ valid: true, count: 1 });
  });
  it("parses commas and escaped quotes inside fields", () => {
    expect(validate(header+'"Persona, ""Ejemplo""",persona@example.com')).toEqual({ valid: true, count: 1,
      rows: [{ fullName: 'Persona, "Ejemplo"', email: "persona@example.com" }] });
  });
  it.each(["", "\uFEFF"])("rejects empty content %j", text => {
    expect(errors(text).errors).toEqual([{ code: "EMPTY_FILE", message: expect.any(String) }]);
  });
  it.each(["fullName,email", header, "fullName,email\r\n"])("rejects a header without data %j", text => {
    expect(errors(text).errors[0]).toEqual({ code: "NO_RECORDS", message: expect.any(String) });
  });
  it.each(["name,email", "email,fullName", "fullName,email,extra", "fullName,fullName", " fullName,email", "fullName;email", "\nfullName,email", "\uFEFF\uFEFFfullName,email"])("rejects header %j", text => {
    expect(errors(text+'\n'+validRow).errors[0]).toMatchObject({ code: "INVALID_HEADER", line: 1 });
  });
  it.each([[0xc3, 0x28], [0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82]])("rejects malformed UTF-8 %j", (...bytes) => {
    const result = validateRegistrationCsv(new Uint8Array(bytes));
    expect(result).toEqual({ valid: false, errors: [{ code: "INVALID_UTF8", message: expect.any(String) }], truncated: false });
  });
  it("rejects UTF-16 and accepts a byte subarray without decoding its surrounding buffer", () => {
    expect(validateRegistrationCsv(new Uint8Array([255,254,65,0]))).toMatchObject({ valid: false });
    const buffer = encode('xx'+header+validRow+'yy');
    expect(validateRegistrationCsv(buffer.subarray(2, buffer.length-2))).toMatchObject({ valid: true });
  });
  it("checks byte size before UTF-8 and accepts the exact byte boundary", () => {
    expect(validateRegistrationCsv(new Uint8Array(REGISTRATION_CSV_LIMITS.bytes+1).fill(255))).toMatchObject({ errors: [{ code: "FILE_TOO_LARGE" }] });
    const suffix=',persona@example.com';
    const text=header+'Persona'+' '.repeat(REGISTRATION_CSV_LIMITS.bytes-encode(header+'Persona'+suffix).length)+suffix;
    expect(validate(text)).toMatchObject({ valid: true, count: 1 });
    expect(errors(text+' ').errors[0].code).toBe("FILE_TOO_LARGE");
  });
  it("counts UTF-8 bytes rather than JavaScript characters", () => {
    const text=header+'é'.repeat(524288)+',p@example.com';
    expect(text.length).toBeLessThan(REGISTRATION_CSV_LIMITS.bytes);
    expect(errors(text).errors[0].code).toBe("FILE_TOO_LARGE");
  });
  it("accepts 500 data records and rejects the 501st", () => {
    const rows=Array.from({length:500},(_,i)=>`Persona,p${i}@example.com`).join('\n');
    expect(validate(header+rows)).toMatchObject({ valid:true,count:500 });
    expect(errors(header+rows+'\nOtra,other@example.com').errors[0]).toMatchObject({ code:"TOO_MANY_RECORDS",record:501,line:502 });
  });
  it.each(['Pe"rsona,p@example.com','"Persona"x,p@example.com','"Persona" ,p@example.com','"Persona,p@example.com','Persona,p@example.com\rOtra,o@example.com'])('rejects malformed CSV %j', row => {
    expect(errors(header+row).errors[0]).toMatchObject({code:"MALFORMED_CSV",record:1,line:2});
  });
  it("does not discard an extra blank record as a trailing newline", () => {
    expect(validate(header+validRow+'\n')).toMatchObject({valid:true});
    expect(errors(header+validRow+'\n\n').errors[0]).toMatchObject({code:"EMPTY_RECORD",record:2,line:3});
  });
  it.each(['Persona','Persona,p@example.com,extra',',,'])('rejects incorrect column count %j', row => {
    expect(errors(header+row).errors[0].code).toBe("INVALID_COLUMNS");
  });
  it("reports both missing values in a two-column record", () => {
    expect(errors(header+',').errors.map(e=>e.code)).toEqual(["INVALID_NAME","INVALID_EMAIL"]);
  });
  it.each(['',' '.repeat(5),'a'.repeat(201),'a\u0000b','a\u200Bb'])('uses manual-registration name rules %j', name => {
    expect(errors(header+name+',p@example.com').errors[0]).toMatchObject({code:"INVALID_NAME",field:"fullName"});
  });
  it("accepts the maximum name length", () => {
    expect(validate(header+'a'.repeat(200)+',p@example.com')).toMatchObject({valid:true});
  });
  it.each(['bad','ñ@example.com','a'.repeat(65)+'@example.com','a@b','a b@example.com'])('uses manual-registration email rules %j', email => {
    expect(errors(header+'Persona,'+email).errors[0]).toMatchObject({code:"INVALID_EMAIL",field:"email"});
  });
  it("preserves dots and plus tags as distinct addresses", () => {
    expect(validate(header+'A,a.b@example.com\nB,ab@example.com\nC,a.b+tag@example.com')).toMatchObject({valid:true,count:3});
  });
  it("references the first duplicate even when that row has an invalid name", () => {
    const result=errors(header+', Person@Example.COM \nOtra,person@example.com\nTercera,PERSON@example.com');
    expect(result.errors.map(e=>[e.code,e.record,e.firstRecord])).toEqual([
      ['INVALID_NAME',1,undefined],['DUPLICATE_EMAIL',2,1],['DUPLICATE_EMAIL',3,1],
    ]);
  });
  it.each(['\n','\r\n'])('tracks record and initial physical line through quoted multiline fields %j', nl => {
    const result=errors('fullName,email'+nl+'"Nombre'+nl+'multilínea",p@example.com'+nl+'Otra,bad');
    expect(result.errors.map(e=>[e.code,e.record,e.line])).toEqual([['INVALID_NAME',1,2],['INVALID_EMAIL',2,4]]);
  });
  it("reports the initial line of an unterminated multiline record", () => {
    expect(errors(header+validRow+'\n"broken\nrest').errors[0]).toMatchObject({code:"MALFORMED_CSV",record:2,line:3});
  });
  it("reports syntax errors in the header without inventing a data record", () => {
    expect(errors('"broken').errors[0]).toEqual({code:"MALFORMED_CSV",message:expect.any(String),line:1});
  });
  it("bounds diagnostics and flags truncation only when an error is omitted", () => {
    const hundred=errors(header+Array.from({length:50},()=>',').join('\n'));
    expect(hundred.errors).toHaveLength(100); expect(hundred.truncated).toBe(false);
    const more=errors(header+Array.from({length:51},()=>',').join('\n'));
    expect(more.errors).toHaveLength(100); expect(more.truncated).toBe(true);
  });
  it("never returns partially valid rows or private values in an error result", () => {
    const result=errors(header+'Sensitive Name,secret@example.com\nSensitive Name,secret@example.com\nPrivate,bad-secret');
    const output=JSON.stringify(result);
    for(const value of ['Sensitive','secret@example.com','Private','bad-secret','rows']) expect(output).not.toContain(value);
  });
  it("is deterministic and does not mutate input bytes", () => {
    const input=encode(header+validRow); const original=input.slice();
    expect(validateRegistrationCsv(input)).toEqual(validateRegistrationCsv(input)); expect(input).toEqual(original);
  });
});
