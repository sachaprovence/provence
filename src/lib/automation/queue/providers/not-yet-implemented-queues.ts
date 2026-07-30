import "server-only";
import type { QueueProvider } from "../types";

/**
 * Fournisseurs déclarés au registre (visibles, sélectionnables via
 * `QUEUE_PROVIDER`) mais dont l'implémentation réelle nécessite une
 * dépendance/infrastructure absente de ce projet aujourd'hui — même
 * principe honnête que les bases vectorielles Milvus/FAISS/LanceDB (v0.7,
 * ADR 0025/0027) : aucun faux succès, un message d'erreur explicite au
 * moment de l'appel.
 *
 * - **BullMQ/Redis** : nécessite `ioredis`+`bullmq` et un serveur Redis
 *   accessible — ni l'un ni l'autre ne sont des dépendances/services de ce
 *   projet (voir `docker-compose.yml`, seul Postgres est provisionné).
 * - **RabbitMQ** : nécessite `amqplib` et un broker AMQP.
 * - **SQS** : nécessite `@aws-sdk/client-sqs` et des identifiants AWS.
 * - **Kafka** : nécessite `kafkajs` et un cluster Kafka.
 *
 * Remplacer un stub par une vraie implémentation ne change ni sa clé ni
 * son usage par le Job Executor : `QUEUE_PROVIDER=bullmq` fonctionnera
 * sans aucune autre modification le jour où la dépendance est ajoutée.
 */
function notYetImplemented(key: string, reason: string): QueueProvider {
  return {
    key,
    async notify() {
      throw new Error(`Le fournisseur de file "${key}" est déclaré au registre mais son implémentation n'est pas encore développée (${reason}).`);
    },
    async claim() {
      throw new Error(`Le fournisseur de file "${key}" est déclaré au registre mais son implémentation n'est pas encore développée (${reason}).`);
    },
  };
}

export const notYetImplementedQueueProviders: QueueProvider[] = [
  notYetImplemented("bullmq", "nécessite ioredis+bullmq et un serveur Redis"),
  notYetImplemented("redis", "nécessite ioredis et un serveur Redis"),
  notYetImplemented("rabbitmq", "nécessite amqplib et un broker AMQP"),
  notYetImplemented("sqs", "nécessite @aws-sdk/client-sqs et des identifiants AWS"),
  notYetImplemented("kafka", "nécessite kafkajs et un cluster Kafka"),
];
