export type SignatureRequest = {
  quoteId: string;
  organizationId: string;
  signerName: string;
  signerEmail: string;
  documentUrl?: string;
};

export type SignatureRequestResult = {
  providerRequestId: string;
  /** URL vers laquelle rediriger le signataire (fournisseurs réels type DocuSign/Yousign). */
  signUrl?: string;
};

/**
 * Abstraction de signature électronique (brief v0.9 : "Signature
 * électronique (abstraction)") — DÉLIBÉRÉMENT une abstraction, pas une
 * intégration réelle : contrairement aux emails/Google Calendar, le brief
 * ne demande pas de supprimer le fonctionnement démo ici (voir ADR 0038).
 * Un vrai fournisseur (DocuSign, Yousign, Dropbox Sign...) s'implémente en
 * ajoutant une classe ici et en l'enregistrant dans `index.ts`.
 */
export interface ESignatureProvider {
  readonly name: string;
  requestSignature(request: SignatureRequest): Promise<SignatureRequestResult>;
}
