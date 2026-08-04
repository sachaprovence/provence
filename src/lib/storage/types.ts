/**
 * Abstraction de stockage de fichiers (v1.1, AR-0162) — même patron que
 * toutes les autres couches d'abstraction fournisseur du projet (IA/
 * email/facturation/communication) : un fournisseur démo par défaut
 * (fonctionne sans configuration externe), un fournisseur réel
 * substituable sans changer le code appelant. Voir docs/adr/0043.
 */
export interface StorageProvider {
  readonly name: string;
  upload(params: { organizationId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ url: string }>;
}
