import { ReviewsPage } from "@/components/dashboard/reviews-page";

export const dynamic = "force-dynamic";

type ReviewsRouteProps = {
  searchParams: Promise<{ repository?: string | string[] }>;
};

export default async function DashboardReviewsPage({
  searchParams,
}: ReviewsRouteProps) {
  const params = await searchParams;
  const raw = params.repository;
  const repositoryFullName =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;

  return <ReviewsPage repositoryFullName={repositoryFullName ?? null} />;
}
