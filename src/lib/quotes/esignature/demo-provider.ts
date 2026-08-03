import crypto from "node:crypto";
import type { ESignatureProvider, SignatureRequest, SignatureRequestResult } from "./types";

/**
 * Fournisseur de signature électronique simulé : n'envoie aucune requête
 * réseau réelle, aucun document n'est réellement signé de façon légalement
 * opposable. Le statut passe à `PENDING` immédiatement ; le passage à
 * `SIGNED`/`DECLINED` se fait via `recordSignatureResult` (voir
 * `quote-service.ts`), qui simule côté démo l'équivalent du webhook qu'un
 * vrai fournisseur enverrait.
 */
export class DemoESignatureProvider implements ESignatureProvider {
  readonly name = "demo";

  async requestSignature(request: SignatureRequest): Promise<SignatureRequestResult> {
    void request;
    return { providerRequestId: crypto.randomUUID() };
  }
}
