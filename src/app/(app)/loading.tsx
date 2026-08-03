import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Affiché immédiatement à la navigation vers une page de l'espace applicatif
 * pendant que son contenu (dynamique, dépendant de la session) se charge.
 * La barre latérale reste affichée (`(app)/layout.tsx` n'est pas concerné
 * par cette frontière Suspense).
 */
export default function AppSegmentLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48" />
      <div className="card p-6">
        <SkeletonText lines={4} />
      </div>
      <div className="card p-6">
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}
