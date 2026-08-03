import type { ESignatureProvider } from "./types";
import { DemoESignatureProvider } from "./demo-provider";

export function getESignatureProvider(): ESignatureProvider {
  const kind = process.env.ESIGNATURE_PROVIDER ?? "demo";
  switch (kind) {
    case "demo":
    default:
      return new DemoESignatureProvider();
  }
}

export * from "./types";
