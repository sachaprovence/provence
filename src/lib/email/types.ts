export type OutboundEmail = {
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  organizationId: string;
  messageId: string;
};

export type SendResult = {
  providerMessageId: string;
  status: "sent" | "failed";
  error?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(email: OutboundEmail): Promise<SendResult>;
}
