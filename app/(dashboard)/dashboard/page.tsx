import { ReviewsTable } from "@/components/dashboard/reviews-table";
import { getDashboardReviews } from "@/lib/dashboard/reviews";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const reviews = await getDashboardReviews();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Reviews
        </h1>
        <p className="text-sm text-text-muted">
          Read-only history for installations your GitHub account can access.
        </p>
      </div>

      <ReviewsTable reviews={reviews} />
    </div>
  );
}
