export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-label="Loading"
      />
    </div>
  );
}
