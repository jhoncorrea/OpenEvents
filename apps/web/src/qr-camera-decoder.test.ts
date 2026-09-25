import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import { decodeQrFrame, isCredentialQr } from "./qr-camera";
describe("local QR decoder",()=>{
  it.each([3,6])("reads a generated synthetic credential at scale %s",async scale=>{const code="oe1_"+"A".repeat(43);const png=PNG.sync.read(await QRCode.toBuffer(code,{scale,margin:4,errorCorrectionLevel:"M"}));const value=decodeQrFrame(new Uint8ClampedArray(png.data),png.width,png.height);expect(value).toBe(code);expect(isCredentialQr(value!)).toBe(true);});
  it("finds no QR in a blank frame",()=>{expect(decodeQrFrame(new Uint8ClampedArray(64*64*4).fill(255),64,64)).toBeNull();});
  it("does not mistake a URL for a credential",async()=>{const png=PNG.sync.read(await QRCode.toBuffer("https://example.com",{margin:4}));const value=decodeQrFrame(new Uint8ClampedArray(png.data),png.width,png.height);expect(value).toBe("https://example.com");expect(isCredentialQr(value!)).toBe(false);});
});
