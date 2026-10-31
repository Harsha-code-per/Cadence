export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-4">{children}</div>;
}
