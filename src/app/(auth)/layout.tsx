export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-p360-offwhite px-4 py-12">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold text-p360-blue">Provence 360</div>
        <p className="text-sm text-p360-muted mt-1">Acquisition client automatisée</p>
      </div>
      <div className="w-full max-w-md card p-8">{children}</div>
    </div>
  );
}
