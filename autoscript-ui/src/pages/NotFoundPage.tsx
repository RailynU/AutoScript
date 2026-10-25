import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center">
      <p className="text-sm font-medium">Page not found.</p>
      <Link to="/" className="mt-2 inline-block text-sm text-primary hover:underline">Back to the review queue</Link>
    </div>
  );
}
