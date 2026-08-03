import "server-only";
import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";
import { resolveEmailConfig, configValue } from "../config";
import type { EmailProvider, OutboundEmail, SendResult } from "../types";

/**
 * Fournisseur SMTP réel (brief v0.9 : "Supprimer progressivement le
 * fonctionnement démo... architecture permettant l'envoi réel d'emails") —
 * via `nodemailer`. Configuration par organisation (`Integration.config`),
 * repli sur les variables d'environnement `SMTP_HOST`/`SMTP_PORT`/
 * `SMTP_USER`/`SMTP_PASSWORD` pour un déploiement mono-organisation.
 * Échoue explicitement (résultat "failed", jamais une exception non
 * gérée) si la configuration est incomplète — aucune vérification
 * end-to-end contre un vrai serveur SMTP n'a été possible dans cet
 * environnement (aucun identifiant disponible), voir ADR 0038.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";

  async send(email: OutboundEmail): Promise<SendResult> {
    const config = await resolveEmailConfig(email.organizationId);
    const host = configValue(config, "smtpHost", "SMTP_HOST");
    const port = Number(configValue(config, "smtpPort", "SMTP_PORT") ?? "587");
    const user = configValue(config, "smtpUser", "SMTP_USER");
    const password = configValue(config, "smtpPassword", "SMTP_PASSWORD");

    if (!host || !user || !password) {
      return {
        providerMessageId: "",
        status: "failed",
        error: "Fournisseur SMTP non configuré : hôte, utilisateur et mot de passe requis (Integration.config ou SMTP_HOST/SMTP_USER/SMTP_PASSWORD).",
      };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: config.smtpSecure === true || port === 465,
      auth: { user, pass: password },
    });

    try {
      const info = await transporter.sendMail({
        from: `"${email.fromName}" <${email.fromEmail}>`,
        to: email.toEmail,
        subject: email.subject,
        html: email.body,
      });
      return { providerMessageId: info.messageId, status: "sent" };
    } catch (error) {
      logger.warn({ err: error, host }, "Échec de l'envoi SMTP.");
      return { providerMessageId: "", status: "failed", error: error instanceof Error ? error.message : "Erreur SMTP." };
    }
  }
}
