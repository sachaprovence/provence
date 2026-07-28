import type { EmailProvider } from "./types";
import { DemoEmailProvider } from "./demo-provider";

export function getEmailProvider(): EmailProvider {
  const kind = process.env.EMAIL_PROVIDER ?? "demo";
  switch (kind) {
    case "demo":
    default:
      return new DemoEmailProvider();
  }
}

export * from "./types";
