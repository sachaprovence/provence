/**
 * Abstraction de stockage de fichiers (v1.1, AR-0162 ; étendue v1.2,
 * AR-0164) — même patron que toutes les autres couches d'abstraction
 * fournisseur du projet (IA/email/facturation/communication) : un
 * fournisseur démo par défaut (fonctionne sans configuration externe), un
 * fournisseur réel substituable sans changer le code appelant. Voir
 * docs/adr/0043 et docs/adr/0045.
 */
export interface StorageProvider {
  readonly name: string;

  /**
   * `key` (renvoyé en plus de `url`) est la clé brute chez le fournisseur —
   * distincte de `url`, qui peut être une URL publique/CDN dérivée. Persistée
   * par l'appelant (`Attachment.storageKey`) pour permettre `download`/
   * `delete` fiables sans dépendre du format d'URL.
   */
  upload(params: { organizationId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ url: string; key: string }>;

  /** Lève `NotFoundError` si la clé n'existe pas, `ValidationError` si elle n'appartient pas à `organizationId`. */
  download(params: { organizationId: string; key: string }): Promise<{ data: Buffer; mimeType: string }>;

  /** Idempotent : ne lève pas si la clé n'existe déjà plus. Lève `ValidationError` si elle n'appartient pas à `organizationId`. */
  delete(params: { organizationId: string; key: string }): Promise<void>;
}
