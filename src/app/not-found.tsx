import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-p360-muted">Erreur 404</p>
      <h1 className="text-2xl font-semibold text-p360-ink">Cette page n&apos;existe pas.</h1>
      <p className="max-w-md text-sm text-p360-muted">
        L&apos;adresse demandée est introuvable ou a été déplacée.
      </p>
      <Link href="/dashboard" className="mt-2">
        <Button variant="primary">Retour au tableau de bord</Button>
      </Link>
    </div>
  );
}
