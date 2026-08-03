import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PostgresLockManager } from "@/lib/automation/lock/providers/postgres-lock";
import { MemoryLockManager } from "@/lib/automation/lock/providers/memory-lock";

const runIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runIfDatabase("Lock Manager", () => {
  it("PostgresLockManager : un verrou tenu ne peut pas être acquis par un autre holder", async () => {
    const lock = new PostgresLockManager();
    const key = `test-lock-${Date.now()}`;

    const acquiredA = await lock.tryAcquire({ lockKey: key, holderId: "holder-A", leaseMs: 5000 });
    expect(acquiredA).toBe(true);

    const acquiredB = await lock.tryAcquire({ lockKey: key, holderId: "holder-B", leaseMs: 5000 });
    expect(acquiredB).toBe(false);

    // Ré-acquisition idempotente par le même holder.
    const reacquiredA = await lock.tryAcquire({ lockKey: key, holderId: "holder-A", leaseMs: 5000 });
    expect(reacquiredA).toBe(true);

    await lock.release({ lockKey: key, holderId: "holder-A" });
    const acquiredBAfterRelease = await lock.tryAcquire({ lockKey: key, holderId: "holder-B", leaseMs: 5000 });
    expect(acquiredBAfterRelease).toBe(true);

    await lock.release({ lockKey: key, holderId: "holder-B" });
  });

  it("PostgresLockManager : un verrou expiré peut être volé par un autre holder", async () => {
    const lock = new PostgresLockManager();
    const key = `test-lock-expiry-${Date.now()}`;

    await lock.tryAcquire({ lockKey: key, holderId: "holder-A", leaseMs: -1 });
    const stolen = await lock.tryAcquire({ lockKey: key, holderId: "holder-B", leaseMs: 5000 });
    expect(stolen).toBe(true);

    const row = await prisma.automationLock.findUniqueOrThrow({ where: { lockKey: key } });
    expect(row.holderId).toBe("holder-B");
    await lock.release({ lockKey: key, holderId: "holder-B" });
  });

  it("PostgresLockManager : renew prolonge le bail, seulement pour le holder actuel", async () => {
    const lock = new PostgresLockManager();
    const key = `test-lock-renew-${Date.now()}`;

    await lock.tryAcquire({ lockKey: key, holderId: "holder-A", leaseMs: 1000 });
    const renewed = await lock.renew({ lockKey: key, holderId: "holder-A", leaseMs: 60_000 });
    expect(renewed).toBe(true);

    const renewedByOther = await lock.renew({ lockKey: key, holderId: "holder-B", leaseMs: 60_000 });
    expect(renewedByOther).toBe(false);

    await lock.release({ lockKey: key, holderId: "holder-A" });
  });

  it("MemoryLockManager : même contrat que le fournisseur Postgres", async () => {
    const lock = new MemoryLockManager();
    const key = "mem-lock";

    expect(await lock.tryAcquire({ lockKey: key, holderId: "A", leaseMs: 5000 })).toBe(true);
    expect(await lock.tryAcquire({ lockKey: key, holderId: "B", leaseMs: 5000 })).toBe(false);
    expect(await lock.renew({ lockKey: key, holderId: "A", leaseMs: 5000 })).toBe(true);
    await lock.release({ lockKey: key, holderId: "A" });
    expect(await lock.tryAcquire({ lockKey: key, holderId: "B", leaseMs: 5000 })).toBe(true);
  });
});
